import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { StaffService } from './staff.service';
import { AcceptStaffInvitationDto } from './dto/accept-staff-invitation.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('staff')
@Public()
@Controller('public/staff-invitations')
export class PublicStaffInvitationsController {
  constructor(private readonly staffService: StaffService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':token')
  preview(@Param('token') token: string) {
    return this.staffService.previewByToken(token);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post(':token/accept')
  accept(@Param('token') token: string, @Body() dto: AcceptStaffInvitationDto) {
    return this.staffService.accept(token, dto);
  }
}
