import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../types/authenticated-user.interface';

interface AccessTokenPayload {
  sub: string;
  email: string;
  orgId?: string;
}

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt-access') {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid or expired session');
    }
    if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
      throw new UnauthorizedException('Account is not active');
    }

    // Resolve active-organization role server-side. If the token carries an
    // orgId (set at login/switch-org time), verify membership still holds;
    // never trust org context supplied only by the client.
    let activeOrganizationId: string | null = null;
    let activeOrgRole = null;

    if (payload.orgId) {
      const membership = await this.prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: payload.orgId, userId: user.id } },
      });
      if (membership && membership.isActive) {
        activeOrganizationId = membership.organizationId;
        activeOrgRole = membership.role;
      }
    }

    return {
      userId: user.id,
      email: user.email,
      platformRole: user.platformRole,
      activeOrganizationId,
      activeOrgRole,
    };
  }
}
