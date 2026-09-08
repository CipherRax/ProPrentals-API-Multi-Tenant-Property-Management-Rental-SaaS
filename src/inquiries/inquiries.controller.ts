import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InquiriesService } from './inquiries.service';
import { CreateInquiryDto } from '../public-listings/dto/create-inquiry.dto';
import { UpdateInquiryStatusDto } from '../public-listings/dto/update-inquiry-status.dto';
import { OrgRoles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Property Inquiries')
@Controller('inquiries')
export class InquiriesController {
  constructor(private readonly inquiries: InquiriesService) {}

  @Post('public')
  @Public()
  @ApiOperation({
    summary: 'Public visitor submits an inquiry about a listed unit/property (no auth)',
  })
  createPublic(@Body() dto: CreateInquiryDto) {
    return this.inquiries.create(dto);
  }

  @Get('organizations/:organizationId')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER', 'STAFF')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List inquiries received by an organization' })
  list(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: 'NEW' | 'CONTACTED' | 'INTERESTED' | 'CONVERTED' | 'CLOSED' | 'SPAM',
  ) {
    return this.inquiries.list(
      userId,
      organizationId,
      Number(page) || 1,
      Number(limit) || 20,
      status,
    );
  }

  @Get('organizations/:organizationId/:inquiryId')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER', 'STAFF')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a single inquiry' })
  getOne(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('inquiryId', ParseUUIDPipe) inquiryId: string,
  ) {
    return this.inquiries.getOne(userId, organizationId, inquiryId);
  }

  @Patch('organizations/:organizationId/:inquiryId/status')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER', 'STAFF')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update inquiry status (contacted/interested/converted/closed/spam)' })
  updateStatus(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('inquiryId', ParseUUIDPipe) inquiryId: string,
    @Body() dto: UpdateInquiryStatusDto,
  ) {
    return this.inquiries.updateStatus(userId, organizationId, inquiryId, dto);
  }
}
