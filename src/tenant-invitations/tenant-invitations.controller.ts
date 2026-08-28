import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantInvitationsService } from './tenant-invitations.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { QueryInvitationsDto } from './dto/query-invitations.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('tenant-invitations')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('organizations/:organizationId/tenant-invitations')
export class TenantInvitationsController {
  constructor(private readonly invitationsService: TenantInvitationsService) {}

  @Post()
  create(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitationsService.create(userId, organizationId, dto);
  }

  @Get()
  findAll(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Query() query: QueryInvitationsDto,
  ) {
    return this.invitationsService.findAll(userId, organizationId, query);
  }

  @Delete(':invitationId')
  revoke(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.invitationsService.revoke(userId, organizationId, invitationId);
  }
}
