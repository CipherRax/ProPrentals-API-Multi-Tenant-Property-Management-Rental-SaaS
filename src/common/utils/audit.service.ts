import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

interface AuditLogInput {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

// Append-only audit trail. Never expose update/delete methods here —
// audit logs must not be casually editable (spec §38).
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditLogInput) {
    await this.prisma.auditLog.create({
      data: {
        organizationId: input.organizationId ?? undefined,
        actorUserId: input.actorUserId ?? undefined,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? undefined,
        previousValue: input.previousValue as never,
        newValue: input.newValue as never,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  }
}
