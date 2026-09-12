import { Injectable, Logger } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { PrismaService } from '../database/prisma.service';
import { AiProviderService } from '../ai/ai-provider.service';

const VALID_UNIT_TYPES = [
  'APARTMENT',
  'BEDSITTER',
  'SINGLE_ROOM',
  'ONE_BEDROOM',
  'TWO_BEDROOM',
  'THREE_BEDROOM',
  'MAISONETTE',
  'HOUSE',
  'BUNGALOW',
  'STUDIO',
  'SHOP',
  'OFFICE',
  'PARKING_SPACE',
  'OTHER',
] as const;

type UnitType = (typeof VALID_UNIT_TYPES)[number];

/** nb: exact/safe filter shape consumed by PublicListingsQueryDto */
export interface ParsedFilters {
  unitType?: UnitType;
  bedrooms?: number;
  minPrice?: number;
  maxPrice?: number;
  county?: string;
  neighborhood?: string;
  city?: string;
  furnished?: string[];
  water?: string[];
  securityFeatures?: string[];
  proximityTags?: string[];
  utilitiesIncluded?: string[];
  amenities?: string[];
  parking?: boolean;
  petFriendly?: boolean;
  availableFrom?: string;
  /** Residual text — fed into the existing general keyword search engine. */
  keyword?: string;
}

export interface ParsedSearch {
  query: string;
  filters: ParsedFilters;
  /** Residual text the parser couldn't map — kept as a general keyword search. */
  keyword?: string;
  /** Human labels so the UI can show/confirm/remove what was understood. */
  understood: Array<{ id: string; label: string; filter: string }>;
}

const UNIT_TYPE_ALIASES: Array<{ keys: RegExp; value: UnitType; label: string }> = [
  {
    keys: /\b(1|one)\s*[- ]?br\b|\bone bedroom|\b1 bedroom\b/i,
    value: 'ONE_BEDROOM',
    label: '1 bedroom',
  },
  {
    keys: /\b(2|two)\s*[- ]?br\b|\btwo bedroom|\b2 bedroom\b|\b2bed\b/i,
    value: 'TWO_BEDROOM',
    label: '2 bedroom',
  },
  {
    keys: /\b(3|three)\s*[- ]?br\b|\bthree bedroom|\b3 bedroom\b/i,
    value: 'THREE_BEDROOM',
    label: '3 bedroom',
  },
  { keys: /\bbedsitter\b|\bbedsit\b/i, value: 'BEDSITTER', label: 'Bedsitter' },
  { keys: /\bstudio\b/i, value: 'STUDIO', label: 'Studio' },
  { keys: /\bmaisonette\b/i, value: 'MAISONETTE', label: 'Maisonette' },
  { keys: /\bapartment\b|\bflat\b|\bapt\b/i, value: 'APARTMENT', label: 'Apartment' },
  { keys: /\bbungalow\b/i, value: 'BUNGALOW', label: 'Bungalow' },
  { keys: /\bsingle room\b/i, value: 'SINGLE_ROOM', label: 'Single room' },
  { keys: /\bhouse\b/i, value: 'HOUSE', label: 'House' },
  { keys: /\bshop\b/i, value: 'SHOP', label: 'Shop' },
  { keys: /\boffice\b/i, value: 'OFFICE', label: 'Office' },
];

// Well-known places. Unknown place names fall back to a general keyword
// search rather than being silently dropped or returning zero results.
const KENYAN_COUNTIES = [
  'nairobi',
  'mombasa',
  'kisumu',
  'nakuru',
  'eldoret',
  'thika',
  'kakamega',
  'naivasha',
  'kitale',
  'malindi',
  'kilifi',
  'nyeri',
  'embu',
  'machakos',
  'kajiado',
  'kiambu',
  'meru',
  'garissa',
  'lamu',
  'kisii',
  'bomet',
  'baringo',
  'bungoma',
  'busia',
  'elgeyo-marakwet',
  'embu',
  'garissa',
  'isi,olo',
  'isiolo',
  'kitui',
  'kwale',
  'laikipia',
  'makueni',
  'mandera',
  'marsabit',
  'migori',
  'moyale',
  'muranga',
  "murang'a",
  'narok',
  'nyamira',
  'nyandarua',
  'nandi',
  'samburu',
  'siaya',
  'taita',
  'tana river',
  'tharaka',
  'trans nzoia',
  'turkana',
  'uasin gishu',
  'vihiga',
  'wajir',
  'west pokot',
];
const NAIROBI_AREAS = [
  'kilimani',
  'westlands',
  'kileleshwa',
  'lavington',
  'hurlingham',
  'langata',
  'south b',
  'south c',
  'donholm',
  'karen',
  'runda',
  'loresho',
  'muthaiga',
  'lavington',
  'parklands',
  'upphill',
  'upper hill',
  'ngara',
  'pangani',
  'roysambu',
  'kahawa',
  'ruiru',
  'juja',
  'kasarani',
  'kasarani',
  'thumbi',
  'kamakis',
  'embakasi',
  'fedha',
  'imara daima',
  'mwiki',
  'zimmerman',
  'garden estate',
  'buruburu',
  'uhuru',
  'madaraka',
  'hardy',
  'nyayo',
  'yaya',
  'kikuyu',
  'limuru',
  'ngong',
  'karen',
  'matasia',
  'apitih',
  'royal estate',
  'muthangari',
  'brookside',
  'kitsuru',
  'gigiri',
];

/**
 * Part B — natural-language → structured-filter translation. The AI's job is
 * translation into the existing public-listings filter engine, NOT a new
 * search path. When no LLM provider is configured a deterministic keyword
 * parser produces the same shape; anything it can't confidently map is kept
 * as a general keyword search instead of being dropped, and every parsed
 * search is logged anonymously for taxonomy improvement.
 */
@Injectable()
export class NlSearchService {
  private readonly logger = new Logger(NlSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiProviderService,
  ) {}

  async parse(rawQuery: string): Promise<ParsedSearch> {
    const text = rawQuery.trim().replace(/\s+/g, ' ');
    const heuristic = this.heuristic(text);
    const filters = this.ai.isConfigured() ? await this.llm(text, heuristic) : heuristic;

    try {
      await this.prisma.marketplaceSearchLog.create({
        data: { query: text.slice(0, 300), filters: filters as never },
      });
    } catch (e) {
      this.logger.warn(`failed to log search: ${(e as Error).message}`);
    }

    return {
      query: text,
      filters,
      keyword: filters.keyword,
      understood: this.buildChips(filters),
    };
  }

  // ── Deterministic parser (no LLM key needed) ─────────────────────

  private heuristic(text: string): ParsedFilters & { keyword?: string } {
    const filters: ParsedFilters = {};
    const used = new Set<string>();

    // Price: "under 20k", "below KES 20,000", "max 25000", "20-30k", "between 15k and 25k".
    let hadPrice = false;

    const range = text.match(
      /(?:kes\s*)?([\d,.]+)\s*(k)?\s*[-–]to?\s*(?:kes\s*)?([\d,.]+)\s*(k)?/i,
    );
    if (range && !hadPrice) {
      filters.minPrice = toKsh(range[1], range[2]);
      filters.maxPrice = toKsh(range[3], range[4]);
      hadPrice = true;
    }
    if (!hadPrice) {
      const over = text.match(
        /(?:over|above|more than|min|minimum|at least)\s*(?:kes\s*)?([\d,.]+)\s*(k)?/i,
      );
      if (over) {
        filters.minPrice = toKsh(over[1], over[2]);
        hadPrice = true;
      }
    }
    if (!hadPrice) {
      const under = text.match(
        /(?:under|below|less than|upto|up to|max|maximum|at most)\s*(?:kes\s*)?([\d,.]+)\s*(k)?/i,
      );
      if (under) {
        filters.maxPrice = toKsh(under[1], under[2]);
        hadPrice = true;
      }
    }
    if (!hadPrice) {
      const bare2 = text.match(/\b([\d,.]+)\s*k(?:sh)?\b/i);
      if (bare2 && !bedroomLike(bare2[1])) {
        filters.maxPrice = toKsh(bare2[1], '');
        hadPrice = true;
      }
    }

    // Bedrooms via explicit count or type alias.
    const bedRe = /\b([1-6])\s*(?:-|bed|br|bedroom)\b/i;
    const bed = text.match(bedRe) ?? text.match(/\b([1-6])\s*(?:bedrooms?|bed)\b/i);
    if (bed && !used.has('bed')) {
      filters.bedrooms = Number(bed[1]);
      used.add('bed');
    }

    for (const alias of UNIT_TYPE_ALIASES) {
      if (alias.keys.test(text) && !filters.unitType) {
        filters.unitType = alias.value;
        used.add(`type:${alias.value}`);
        if (!filters.bedrooms && /bedroom|br\b/.test(text) && alias.value === 'ONE_BEDROOM') {
          filters.bedrooms = 1;
        }
        break;
      }
    }

    // Location.
    const lower = text.toLowerCase();
    if (/cbd|city (centre|center)|downtown|in town|town centre/i.test(text)) {
      filters.city = 'Nairobi';
      filters.neighborhood = 'CBD';
      used.add('loc:cbd');
    } else {
      for (const area of NAIROBI_AREAS) {
        if (new RegExp(`\\b${escapeRe(area)}\\b`).test(lower) && !used.has('loc:area')) {
          filters.city = 'Nairobi';
          filters.neighborhood = capitalize(area);
          used.add('loc:area');
          break;
        }
      }
    }
    if (!used.has('loc:area') && !used.has('loc:cbd')) {
      for (const county of KENYAN_COUNTIES) {
        if (new RegExp(`\\b${escapeRe(county)}\\b`).test(lower) && !used.has('loc:county')) {
          filters.county = capitalize(county);
          used.add('loc:county');
          break;
        }
      }
    }

    // Booleans / amenity attributes.
    if (
      /pet[- ]?friendly|pets allowed|dogs? allowed|cats? allowed|pet friendly|dog|cat/i.test(text)
    ) {
      filters.petFriendly = true;
    }
    if (/\bparking\b|car park|with parking/i.test(text)) {
      filters.parking = true;
    }
    if (/fully furnished|furnished/i.test(text)) filters.furnished = ['FULLY_FURNISHED'];
    else if (/semi[- ]?furnished/i.test(text)) filters.furnished = ['SEMI_FURNISHED'];
    else if (/unfurnished/i.test(text)) filters.furnished = ['UNFURNISHED'];
    if (/borehole/i.test(text)) filters.water = ['BOREHOLE'];
    else if (/24[- ]?hour|24hr/i.test(text) && /water/i.test(text))
      filters.water = ['TWENTY_FOUR_HOUR'];
    if (/gated|security|guards|manned/i.test(text)) filters.securityFeatures = ['Gated'];
    if (/cctv|secured|security cameras/i.test(text))
      filters.securityFeatures = filters.securityFeatures ?? ['CCTV'];
    if (/\bwifi\b|internet/i.test(text)) filters.amenities = ['WiFi'];
    if (/water included|with water|water supply/i.test(text)) filters.utilitiesIncluded = ['Water'];

    // Any non-flag words left over that we don't recognise become a general
    // keyword search (e.g. an unknown neighborhood), so nothing is silently lost.
    const knownPatterns = [
      /\b(under|below|less than|upto|up to|max|maximum|at most|over|above|more than|minimum|min)?\s*kes\s*[\d,.k]+\s*k?\b/i,
      /\b(?:[\d,.]+k)\b/i,
      /\bx?\d+\s*(?:br|bed|bedroom|bedrooms)\b/i,
      ...UNIT_TYPE_ALIASES.map((a) => a.keys),
      /\b(pet[- ]?friendly|friendly|pets?|dogs?|cats?|parking|furnished|semi[- ]?furnished|unfurnished|borehole|water|gated|security|guards|cctv|wifi|internet|near|in|at|and|with|for|under|below|over|max|min|bedroom|bedrooms|br|bed|single|room|house|flat|apartment|apt|bedsitter|studio|maisonette|bungalow|shop|office)\b/i,
      ...NAIROBI_AREAS.map((a) => new RegExp(`\\b${escapeRe(a)}\\b`, 'i')),
      ...KENYAN_COUNTIES.map((c) => new RegExp(`\\b${escapeRe(c)}\\b`, 'i')),
      /\bcbd|city centre|city center|downtown\b/i,
    ];
    const tokens = text.split(/\b/);
    const leftovers = tokens.filter((tok) => {
      const w = tok.trim();
      if (!w || /^[\s.,\-&,]+$/.test(w)) return false;
      if (/^\d+$/.test(w)) return false;
      return !knownPatterns.some((re) => re.test(w));
    });
    const keyword = leftovers.join(' ').trim().replace(/\s+/g, ' ');
    if (keyword && keyword.length > 2) filters.keyword = keyword;

    return filters as ParsedFilters & { keyword?: string };
  }

  private async llm(
    text: string,
    heuristic: ParsedFilters & { keyword?: string },
  ): Promise<ParsedFilters & { keyword?: string }> {
    const system = [
      "You translate a tenant's natural-language rental search into Habita's structured filters.",
      `Allowed unitType enum values: ${VALID_UNIT_TYPES.join(', ')}.`,
      'Return STRICT JSON with only these keys, all optional: unitType (enum value), bedrooms (int), minPrice (int, KES/month), maxPrice (int, KES/month), city, county, neighborhood (strings), furnished (array of UNFURNISHED/SEMI_FURNISHED/FULLY_FURNISHED), water (array of BOREHOLE/PIPED/TWENTY_FOUR_HOUR/NONE), securityFeatures (strings like Gated, CCTV), proximityTags, utilitiesIncluded, amenities (strings like WiFi, Kitchen, Parking), parking (boolean), petFriendly (boolean), availableFrom (ISO date), keyword (string).',
      'keyword must hold anything you cannot confidently map (e.g. an unrecognised place name) so it becomes a general text search. Never invent values not implied by the query.',
      'Convert "20k" into 20000. "under 20k" → maxPrice 20000. "2 bed" → unitType TWO_BEDROOM (or bedrooms 2).',
    ].join(' ');
    const res = await this.ai.complete([
      { role: 'system', content: system },
      { role: 'user', content: `Query: "${text}"` },
    ]);
    if (!res) return heuristic;
    try {
      const parsed = JSON.parse(res) as ParsedFilters;
      const out: ParsedFilters & { keyword?: string } = {};
      if (parsed.unitType && VALID_UNIT_TYPES.includes(parsed.unitType))
        out.unitType = parsed.unitType;
      if (parsed.bedrooms && parsed.bedrooms >= 1 && parsed.bedrooms <= 6)
        out.bedrooms = parsed.bedrooms;
      if (parsed.minPrice != null && parsed.minPrice > 0)
        out.minPrice = Math.round(parsed.minPrice);
      if (parsed.maxPrice != null && parsed.maxPrice > 0)
        out.maxPrice = Math.round(parsed.maxPrice);
      if (parsed.city) out.city = parsed.city;
      if (parsed.county) out.county = parsed.county;
      if (parsed.neighborhood) out.neighborhood = parsed.neighborhood;
      if (parsed.furnished?.length) out.furnished = parsed.furnished;
      if (parsed.water?.length) out.water = parsed.water;
      if (parsed.securityFeatures?.length) out.securityFeatures = parsed.securityFeatures;
      if (parsed.proximityTags?.length) out.proximityTags = parsed.proximityTags;
      if (parsed.utilitiesIncluded?.length) out.utilitiesIncluded = parsed.utilitiesIncluded;
      if (parsed.amenities?.length) out.amenities = parsed.amenities;
      if (typeof parsed.parking === 'boolean') out.parking = parsed.parking;
      if (typeof parsed.petFriendly === 'boolean') out.petFriendly = parsed.petFriendly;
      if (parsed.availableFrom) out.availableFrom = parsed.availableFrom;
      if (parsed.keyword) out.keyword = parsed.keyword;
      return out;
    } catch {
      return heuristic;
    }
  }

  private buildChips(filters: ParsedFilters): ParsedSearch['understood'] {
    const chips: ParsedSearch['understood'] = [];
    const label = (filter: string, text: string) =>
      chips.push({ id: nanoid(), label: text, filter });

    if (filters.unitType)
      label(
        'unitType',
        `Type: ${UNIT_TYPE_ALIASES.find((a) => a.value === filters.unitType)?.label ?? filters.unitType}`,
      );
    if (filters.bedrooms) label('bedrooms', `Bedrooms: ${filters.bedrooms}`);
    if (filters.minPrice) label('minPrice', `Min price: KES ${filters.minPrice.toLocaleString()}`);
    if (filters.maxPrice) label('maxPrice', `Max price: KES ${filters.maxPrice.toLocaleString()}`);
    if (filters.city) label('city', `City: ${filters.city}`);
    if (filters.county) label('county', `County: ${filters.county}`);
    if (filters.neighborhood) label('neighborhood', `Area: ${filters.neighborhood}`);
    if (filters.furnished?.length)
      label(
        'furnished',
        `Furnished: ${filters.furnished.join(', ').replace(/_/g, ' ').toLowerCase()}`,
      );
    if (filters.parking) label('parking', 'Parking: Yes');
    if (filters.petFriendly) label('petFriendly', 'Pets: allowed');
    if (filters.water?.length) label('water', `Water: ${filters.water.join(', ')}`);
    if (filters.securityFeatures?.length)
      label('securityFeatures', `Security: ${filters.securityFeatures.join(', ')}`);
    if (filters.utilitiesIncluded?.length)
      label('utilitiesIncluded', `Utilities: ${filters.utilitiesIncluded.join(', ')}`);
    if (filters.amenities?.length) label('amenities', `Amenities: ${filters.amenities.join(', ')}`);
    if (filters.keyword) label('keyword', `Keyword: ${filters.keyword}`);
    return chips;
  }
}

function toKsh(raw: string | undefined, kSuffix?: string): number {
  if (!raw) return 0;
  const n = Number(raw.replace(/,/g, ''));
  return kSuffix ? Math.round(n * 1000) : n;
}

function bedroomLike(raw: string): boolean {
  return /^[1-6]$/.test(raw.replace(/,/g, ''));
}

function capitalize(s: string): string {
  return s
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
