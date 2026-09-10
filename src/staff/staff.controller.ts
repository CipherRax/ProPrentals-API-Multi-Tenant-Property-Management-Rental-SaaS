import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';
import { StaffService } from './staff.service';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { ListStaffDto } from './dto/list-staff.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrgRoles } from '../auth/decorators/roles.decorator';

@ApiTags('staff')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('organizations/:organizationId/staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  listMembers(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Query() query: ListStaffDto,
  ) {
    return this.staffService.listMembers(userId, organizationId, query);
  }

  @Get('invitations')
  listInvitations(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
  ) {
    return this.staffService.listInvitations(userId, organizationId);
  }

  @Post('invitations')
  @OrgRoles(OrgRole.OWNER, OrgRole.PROPERTY_MANAGER)
  invite(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Body() dto: InviteStaffDto,
  ) {
    return this.staffService.invite(userId, organizationId, dto);
  }

  @Patch(':memberId/role')
  @OrgRoles(OrgRole.OWNER, OrgRole.PROPERTY_MANAGER)
  updateRole(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
    @Body('role') role: OrgRole,
  ) {
    return this.staffService.updateRole(userId, organizationId, memberId, role);
  }

  @Delete('invitations/:invitationId')
  @OrgRoles(OrgRole.OWNER, OrgRole.PROPERTY_MANAGER)
  revoke(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.staffService.revoke(userId, organizationId, invitationId);
  }

  @Delete(':memberId')
  @OrgRoles(OrgRole.OWNER, OrgRole.PROPERTY_MANAGER)
  removeMember(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.staffService.removeMember(userId, organizationId, memberId);
  }
}
