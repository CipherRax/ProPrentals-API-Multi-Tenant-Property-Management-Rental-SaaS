import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuditService } from '../common/utils/audit.service';
import { TransactionalEmailService } from '../notifications/transactional-email.service';

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') +
    '-' +
    randomBytes(3).toString('hex')
  );
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly transactionalEmail: TransactionalEmailService,
  ) {}

  // Public: other modules (e.g. tenant-invitation acceptance) need to
  // issue a session for a user created outside the normal register/login
  // flow, without duplicating token-signing/rotation logic.
  async issueTokenPair(userId: string, email: string, orgId?: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, orgId },
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: this.config.get<string>('jwt.accessExpiresIn'),
      },
    );

    const jti = randomBytes(16).toString('hex');
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, jti },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<string>('jwt.refreshExpiresIn'),
      },
    );

    const refreshExpiresInMs = this.parseDurationMs(
      this.config.get<string>('jwt.refreshExpiresIn') || '30d',
    );

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshExpiresInMs),
      },
    });

    return { accessToken, refreshToken };
  }

  private parseDurationMs(duration: string): number {
    const match = /^(\d+)([smhd])$/.exec(duration);
    if (!match) return 30 * 24 * 60 * 60 * 1000;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return value * multipliers[unit];
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          phone: dto.phone,
          firstName: dto.firstName,
          lastName: dto.lastName,
          passwordHash,
          status: 'PENDING_VERIFICATION',
        },
      });

      const organization = await tx.organization.create({
        data: {
          name: dto.organizationName,
          slug: slugify(dto.organizationName),
          contactEmail: dto.email.toLowerCase(),
        },
      });

      await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: 'OWNER',
        },
      });

      return { user, organization };
    });

    await this.audit.log({
      organizationId: result.organization.id,
      actorUserId: result.user.id,
      action: 'USER_REGISTERED',
      entityType: 'User',
      entityId: result.user.id,
      newValue: { email: result.user.email, organizationId: result.organization.id },
    });

    const tokens = await this.issueTokenPair(
      result.user.id,
      result.user.email,
      result.organization.id,
    );

    return {
      user: this.sanitizeUser(result.user),
      organization: result.organization,
      ...tokens,
    };
  }

  async login(dto: LoginDto, meta: { ipAddress?: string; userAgent?: string } = {}) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase(), deletedAt: null },
    });

    // Constant-shape response regardless of whether the email exists,
    // to avoid user-enumeration via timing/response differences.
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException(
        `Account temporarily locked due to repeated failed logins. Try again later.`,
      );
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);

    if (!passwordValid) {
      const failedLoginCount = user.failedLoginCount + 1;
      const shouldLock = failedLoginCount >= MAX_FAILED_LOGIN_ATTEMPTS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: shouldLock ? 0 : failedLoginCount,
          lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_DURATION_MS) : undefined,
        },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
      throw new ForbiddenException('This account is not active');
    }

    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId: user.id, isActive: true },
      orderBy: { joinedAt: 'asc' },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    await this.audit.log({
      organizationId: membership?.organizationId,
      actorUserId: user.id,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    const tokens = await this.issueTokenPair(user.id, user.email, membership?.organizationId);

    return { user: this.sanitizeUser(user), ...tokens };
  }

  async refresh(userId: string, jti: string, rawToken: string) {
    const tokenHash = hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revoked || stored.userId !== userId || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid session');
    }

    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId: user.id, isActive: true },
      orderBy: { joinedAt: 'asc' },
    });

    // Rotate: revoke the old refresh token and issue a new pair. This
    // limits the blast radius if a refresh token is ever intercepted.
    const tokens = await this.issueTokenPair(user.id, user.email, membership?.organizationId);

    await this.prisma.refreshToken.update({
      where: { tokenHash },
      data: { revoked: true, replacedBy: hashToken(tokens.refreshToken) },
    });

    return tokens;
  }

  async logout(userId: string, rawToken: string) {
    const tokenHash = hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { userId, tokenHash, revoked: false },
      data: { revoked: true },
    });
    return { message: 'Logged out successfully' };
  }

  async logoutAllSessions(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
    return { message: 'All sessions revoked' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const valid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!valid) throw new BadRequestException('Current password is incorrect');

    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    // Changing password revokes all existing sessions for safety.
    await this.logoutAllSessions(userId);

    await this.audit.log({
      actorUserId: userId,
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: userId,
    });

    return { message: 'Password changed successfully. Please log in again.' };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findFirst({ where: { email: email.toLowerCase() } });
    // Always return a generic response — never reveal whether the email exists.
    if (!user) return { message: 'If that email exists, a reset link has been sent.' };

    const rawToken = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    const frontendUrl = this.config.get<string>('frontendUrl');
    // Fire-and-forget from the caller's perspective — TransactionalEmailService
    // logs failures internally but never throws, so a broken SMTP config
    // can't turn "forgot password" into a 500 (which would also leak
    // that the email genuinely exists, defeating the point of the
    // generic response above).
    await this.transactionalEmail.sendPasswordReset(
      user.email,
      user.firstName || user.lastName || 'there',
      `${frontendUrl}/reset-password?token=${rawToken}`,
    );

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = hashToken(token);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record || record.used || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await argon2.hash(newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { tokenHash }, data: { used: true } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revoked: false },
        data: { revoked: true },
      }),
    ]);

    return { message: 'Password reset successfully. Please log in.' };
  }

  private sanitizeUser(user: { passwordHash?: string; [key: string]: unknown }) {
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }
}
