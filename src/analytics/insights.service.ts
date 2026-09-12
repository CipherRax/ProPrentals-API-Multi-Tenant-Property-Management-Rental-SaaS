import { Injectable, NotFoundException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { nanoid } from 'nanoid';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { AiProviderService } from '../ai/ai-provider.service';
import { AnalyticsService, AnalyticsBundle } from './analytics.service';
import { GetAnalyticsQueryDto } from './dto/get-analytics-query.dto';

const ALLOWED_ROLES: OrgRole[] = ['OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT'];
const INSIGHT_TTL_MS = 24 * 60 * 60 * 1000;

export interface InsightItem {
  id: string;
  title: string;
  details: string;
  /** Drill-down anchor — never empty for suggestions referencing a unit type. */
  unitTypeId?: string;
  propertyId?: string;
  /** Which metric backs this item (used for the "why" label). */
  metric?: string;
  /** Human-readable number / basis behind the item. */
  basis?: string;
  dismissed?: boolean;
}

export interface InsightsResult {
  generatedAt: string;
  provider: string;
  summary: string;
  criticalIssues: InsightItem[];
  suggestions: InsightItem[];
  viewsUnavailable?: boolean;
}

/**
 * Part A2 — turns the structured analytics bundle (A1) into a plain-language
 * digest: a summary, distinct critical issues, and actionable suggestions.
 * Only the requesting landlord's own scoped bundle is ever handed to the LLM;
 * the system prompt forbids inventing numbers and every suggestion must cite
 * the property/unit type and the data point behind it. A deterministic,
 * number-grounded heuristic generator produces identical shapes when no LLM
 * provider is configured, so the feature works end-to-end without a key.
 */
@Injectable()
export class AnalyticsInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly ai: AiProviderService,
    private readonly analytics: AnalyticsService,
  ) {}

  private async assertAccess(userId: string, organizationId: string) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!ALLOWED_ROLES.includes(membership.role)) {
      throw new NotFoundException('Analytics not found');
    }
    if (!(await this.subscriptions.isFeatureEnabled(organizationId, 'analytics'))) {
      throw new NotFoundException('Analytics not found');
    }
  }

  async getInsights(userId: string, organizationId: string, query: GetAnalyticsQueryDto) {
    await this.assertAccess(userId, organizationId);
    const bundle = await this.analytics.getAnalytics(userId, organizationId, query);

    if (query.unitTypeId || query.propertyId) {
      // Drill-down scopes: generate on demand (charts already fetched live).
      const idx = await this.generate(bundle);
      return { generatedAt: new Date().toISOString(), provider: idx.provider, ...idx.data };
    }

    const existing = await this.prisma.analyticsInsight.findUnique({
      where: { organizationId },
    });
    const stale = !existing || existing.generatedAt.getTime() < Date.now() - INSIGHT_TTL_MS;
    if (existing && !stale) {
      return this.deserialize(existing);
    }

    const idx = await this.generate(bundle);
    const data = {
      summary: idx.data.summary,
      criticalIssues: idx.data.criticalIssues,
      suggestions: idx.data.suggestions,
      provider: idx.provider,
    };
    const saved = await this.prisma.analyticsInsight.upsert({
      where: { organizationId },
      update: { ...data, generatedAt: new Date() } as never,
      create: { organizationId, ...data } as never,
    });
    return this.deserialize(saved);
  }

  async refresh(userId: string, organizationId: string) {
    await this.assertAccess(userId, organizationId);
    const bundle = await this.analytics.getAnalytics(userId, organizationId, {});
    const idx = await this.generate(bundle);
    const data = {
      summary: idx.data.summary,
      criticalIssues: idx.data.criticalIssues,
      suggestions: idx.data.suggestions,
      provider: idx.provider,
    };
    const saved = await this.prisma.analyticsInsight.upsert({
      where: { organizationId },
      update: { ...data, generatedAt: new Date() } as never,
      create: { organizationId, ...data } as never,
    });
    return this.deserialize(saved);
  }

  async dismissSuggestion(userId: string, organizationId: string, suggestionId: string) {
    await this.assertAccess(userId, organizationId);
    const insight = await this.prisma.analyticsInsight.findUnique({
      where: { organizationId },
    });
    if (!insight) throw new NotFoundException('Suggestion not found');
    const suggestions = (insight.suggestions as unknown as InsightItem[]) ?? [];
    const next = suggestions.map((s) => (s.id === suggestionId ? { ...s, dismissed: true } : s));
    const saved = await this.prisma.analyticsInsight.update({
      where: { organizationId },
      data: { suggestions: next as never },
    });
    return this.deserialize(saved);
  }

  private deserialize(row: {
    generatedAt: Date;
    summary: string;
    criticalIssues: unknown;
    suggestions: unknown;
    provider: string;
  }): InsightsResult {
    return {
      generatedAt: row.generatedAt.toISOString(),
      provider: row.provider,
      summary: row.summary,
      criticalIssues: (row.criticalIssues as unknown as InsightItem[]) ?? [],
      suggestions: (row.suggestions as unknown as InsightItem[]) ?? [],
      viewsUnavailable: true,
    };
  }

  // ── Generation ────────────────────────────────────────────────────
  // Returns either the LLM output (validated + structurally merged with the
  // grounded heuristic output) or the heuristic output alone; the response
  // shape is identical so the dashboard can't tell the difference.

  private async generate(bundle: AnalyticsBundle): Promise<{
    provider: string;
    data: Pick<InsightsResult, 'summary' | 'criticalIssues' | 'suggestions'>;
  }> {
    const heuristic = this.heuristic(bundle);
    if (!this.ai.isConfigured()) {
      return { provider: 'heuristic', data: heuristic };
    }
    const llm = await this.llm(bundle);
    if (llm) return { provider: 'openai', data: llm };
    return { provider: 'heuristic', data: heuristic };
  }

  private async llm(
    bundle: AnalyticsBundle,
  ): Promise<Pick<InsightsResult, 'summary' | 'criticalIssues' | 'suggestions'> | null> {
    const system = [
      'You are Habita, the rental analytics assistant for one landlord.',
      "You are given ONLY that landlord's own analytics JSON. Never reference any other landlord, organization, or aggregate unless it appears in the input provided.",
      'Return STRICT JSON with exactly three keys: "summary" (string, 2-3 plain sentences in Kenyan-English tone), "criticalIssues" (array), "suggestions" (array).',
      'Every critical issue and suggestion entry MUST have: "title" (<=60 chars), "details" (1-2 sentences grounded in the supplied numbers — always name the property/unitTypeName and the data point), "unitTypeId" (exact id string from the data when the item refers to a specific unit type), "propertyId" (exact id string), "metric" (e.g. "vacancy_days","on_time_rate","overdue_rent","inquiries","price_gap"), "basis" (the raw number(s) behind it, e.g. "45 days vacant, 0 inquiries in 30 days").',
      "Critical issues are SEVERE and time-sensitive (a unit vacant far longer than the landlord's own average, on-time payment rate far below the portfolio norm, overdue balances, a sudden drop in on-time payments). Limit to the most important 1-3. They must be visually distinct in the UI, so do NOT blur them into suggestions.",
      'Suggestions must be actionable and reference the actual numbers in the data — never generic advice without a cited data point.',
      'If a figure looks impossible DO NOT fix it and DO NOT invent replacement figures: leave it out.',
    ].join(' ');

    const user = JSON.stringify({
      scope: bundle.scope,
      metrics: bundle.metrics,
      trendsTail: {
        occupancy30: bundle.trends.occupancyTrend30.at(-1),
        occupancy365: bundle.trends.occupancyTrend365.at(-1),
        payment30: bundle.trends.paymentTrend30.at(-1),
      },
      byMethod30: bundle.byMethod30,
      unitTypes: bundle.unitTypes,
      areaComparison: bundle.comparisons.area,
      uiNote:
        'viewsUnavailable=true means marketplace views are not recorded yet — never claim a view count.',
    });

    const raw = await this.ai.complete([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as {
        summary?: string;
        criticalIssues?: Array<Partial<InsightItem>>;
        suggestions?: Array<Partial<InsightItem>>;
      };
      const heuristic = this.heuristic(bundle);
      const hk = new Map(heuristic.suggestions.map((s) => [s.metric, s]));
      const ok = (items: Array<Partial<InsightItem>>) =>
        items
          .filter(
            (i) =>
              i.title &&
              i.details &&
              i.metric &&
              i.basis &&
              (typeof i.unitTypeId === 'string' || typeof i.propertyId === 'string'),
          )
          .map((i) => {
            const fallback = hk.get(i.metric);
            return {
              id: nanoid(),
              title: i.title!,
              details: i.details!,
              unitTypeId: i.unitTypeId ?? fallback?.unitTypeId,
              propertyId: i.propertyId ?? fallback?.propertyId,
              metric: i.metric!,
              basis: i.basis!,
              dismissed: false,
            } satisfies InsightItem;
          });
      return {
        summary: parsed.summary?.trim() || heuristic.summary,
        criticalIssues: ok(parsed.criticalIssues ?? []),
        suggestions: ok(parsed.suggestions ?? []),
      };
    } catch {
      return null;
    }
  }

  // ── Deterministic, number-grounded fallback ──────────────────────

  private heuristic(
    bundle: AnalyticsBundle,
  ): Pick<InsightsResult, 'summary' | 'criticalIssues' | 'suggestions'> {
    const m = bundle.metrics;
    const uts = bundle.unitTypes.filter((u) => u.totalUnits > 0);
    const criticalIssues: InsightItem[] = [];
    const suggestions: InsightItem[] = [];

    // Portfolio norms for relative judgment.
    const paidTypes = uts.filter((u) => u.onTimePaymentRate90 != null);
    const normOnTime =
      paidTypes.length > 0
        ? paidTypes.reduce((s, u) => s + (u.onTimePaymentRate90 ?? 0), 0) / paidTypes.length
        : (m.onTimePaymentRate ?? null);
    const normVacancy = m.avgDaysToFill;

    // 1. Sudden on-time payment drop (30d vs 90d) — building-wide signal.
    for (const u of uts) {
      if (
        u.onTimePaymentRate30 != null &&
        u.onTimePaymentRate90 != null &&
        u.onTimePaymentRate90 - u.onTimePaymentRate30 >= 10
      ) {
        criticalIssues.push({
          id: nanoid(),
          title: `On-time payments dropping at ${u.unitTypeName} (${u.propertyName})`,
          details: `On-time payment rate fell from ${u.onTimePaymentRate90}% to ${u.onTimePaymentRate30}% over the last 30 days${
            normOnTime != null ? ` — below your ${Math.round(normOnTime)}% portfolio norm` : ''
          }. Worth checking whether a building-wide issue (billing, water, or rent changes) is behind it.`,
          unitTypeId: u.unitTypeId ?? undefined,
          propertyId: u.propertyId,
          metric: 'on_time_drop',
          basis: `${u.onTimePaymentRate90}% → ${u.onTimePaymentRate30}%`,
        });
      }
    }

    // 2. Units vacant far longer than the landlord's own historical norm.
    for (const u of uts) {
      if (u.currentVacantAvgDays != null && u.vacantUnits > 0) {
        const threshold = Math.max(30, (normVacancy ?? 0) * 2);
        if (u.currentVacantAvgDays >= threshold) {
          criticalIssues.push({
            id: nanoid(),
            title: `${u.unitTypeName} at ${u.propertyName} vacant well above your norm`,
            details: `${u.vacantUnits} ${u.unitTypeName.toLowerCase()} unit(s) have sat empty for ~${Math.round(u.currentVacantAvgDays)} days on average${
              normVacancy != null ? ` vs your typical ${Math.round(normVacancy)} days to fill` : ''
            }.`,
            unitTypeId: u.unitTypeId ?? undefined,
            propertyId: u.propertyId,
            metric: 'vacancy_days',
            basis: `${Math.round(u.currentVacantAvgDays)} days vacant × ${u.vacantUnits} unit(s)`,
          });
        }
      }
    }

    // 3. Overdue balances building up.
    if (m.overdueRent > 0) {
      criticalIssues.push({
        id: nanoid(),
        title: 'Overdue rent is accumulating',
        details: `You have ${formatKsh(m.overdueRent)} overdue right now (of ${formatKsh(m.expectedRent)} expected in the last year). Unpaid charges usually compound — a quick reminder sweep could stop this from growing.`,
        metric: 'overdue_rent',
        basis: `${formatKsh(m.overdueRent)} overdue / ${formatKsh(m.expectedRent)} expected`,
      });
    }

    // Suggestions — always grounded in a specific property/unit type.
    for (const u of uts) {
      // Long-vacant + no interest → price / visibility.
      if (u.currentVacantAvgDays != null && u.currentVacantAvgDays >= 45 && u.inquiries30 === 0) {
        suggestions.push({
          id: nanoid(),
          title: `No inquiries for ${u.unitTypeName} at ${u.propertyName}`,
          details: `${u.unitTypeName} unit(s) have had ${Math.round(u.currentVacantAvgDays)} days vacant on average and no inquiries in the last 30 days. Consider a price review (currently ${formatKsh(u.baseRent)}/mo) or making the listed amenities clearer.`,
          unitTypeId: u.unitTypeId ?? undefined,
          propertyId: u.propertyId,
          metric: 'inquiries',
          basis: `${u.inquiries30} inquiries, ${Math.round(u.currentVacantAvgDays)} days vacant`,
        });
      }
      // Priced above similar nearby listings (when aggregate data allows).
      if (
        bundle.comparisons.area &&
        u.unitTypeId != null &&
        (u.unitTypeId === bundle.scope.unitTypeId || bundle.scope.kind === 'portfolio')
      ) {
        const area = bundle.comparisons.area;
        if (area.avgRent != null && u.baseRent > area.avgRent * 1.15 && u.inquiries30 === 0) {
          suggestions.push({
            id: nanoid(),
            title: `${u.unitTypeName} at ${u.propertyName} priced above nearby comparables`,
            details: `Listed at ${formatKsh(u.baseRent)}/mo vs ~${formatKsh(area.avgRent)}/mo for similar units near ${'(same county)'} (based on ${area.sampleCount} public listings). With zero inquiries in 30 days, a review has a clear benchmark to move against.`,
            unitTypeId: u.unitTypeId ?? undefined,
            propertyId: u.propertyId,
            metric: 'price_gap',
            basis: `${Math.round(area.deltaPct ?? 0)}% above area average`,
          });
        }
      }
    }

    // Praise best performers (reinforces good behavior, still numeric).
    const best = [...uts].sort(
      (a, b) => (b.onTimePaymentRate30 ?? 0) - (a.onTimePaymentRate30 ?? 0),
    )[0];
    if (best && (best.onTimePaymentRate30 ?? 0) >= 95 && (best.occupancyRate ?? 0) >= 85) {
      suggestions.push({
        id: nanoid(),
        title: `${best.unitTypeName} at ${best.propertyName} is your best performer`,
        details: `${best.onTimePaymentRate30}% on-time payments and ${best.occupancyRate}% occupancy — the strongest combination in your portfolio right now. Keep its pricing stable; it's your benchmark for the rest.`,
        unitTypeId: best.unitTypeId ?? undefined,
        propertyId: best.propertyId,
        metric: 'best_performer',
        basis: `${best.onTimePaymentRate30}% on-time, ${best.occupancyRate}% occupied`,
      });
    }

    // Summary — plain language, grounded.
    const occLbl = m.occupancyRate != null ? `${m.occupancyRate}%` : 'n/a';
    const onTimeLbl = m.onTimePaymentRate != null ? `${m.onTimePaymentRate}%` : 'n/a';
    let summary = `Overall you're at ${occLbl} occupancy with a ${onTimeLbl} on-time payment rate; ${formatKsh(m.collectedThisPeriod)} was collected in the last 30 days.`;
    if (m.collectionRate != null) {
      summary += ` Your collection rate over the last year is ${Math.round(m.collectionRate)}% (${formatKsh(m.outstandingRent)} outstanding).`;
    }
    const bestLbl = best
      ? ` ${best.unitTypeName} at ${best.propertyName} leads your portfolio.`
      : '';
    summary += bestLbl;
    if (criticalIssues.length === 0 && m.vacantUnits > 0) {
      summary +=
        ' No critical issues right now — a few units are vacant but within your normal range.';
    }

    return {
      summary,
      criticalIssues,
      suggestions: suggestions.slice(0, 6),
    };
  }
}

function formatKsh(n: number): string {
  return `KES ${Math.round(n).toLocaleString('en-KE')}`;
}
