import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TenantInvitationsService } from './tenant-invitations.service';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('public')
@Public()
@Controller('public/tenant-invitations')
export class PublicTenantInvitationsController {
  constructor(private readonly invitationsService: TenantInvitationsService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':token')
  preview(@Param('token') token: string) {
    return this.invitationsService.previewByToken(token);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post(':token/accept')
  accept(@Param('token') token: string, @Body() dto: AcceptInvitationDto) {
    return this.invitationsService.accept(token, dto);
  }
}
