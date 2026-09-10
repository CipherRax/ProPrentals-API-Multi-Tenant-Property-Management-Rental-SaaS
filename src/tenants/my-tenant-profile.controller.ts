import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { UpdateMyTenantProfileDto } from './dto/update-my-tenant-profile.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// Tenant self-service — deliberately NOT nested under /organizations/:id
// because a tenant is not an OrganizationMember and shouldn't need to
// know or pass an organizationId to see their own data.
@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('tenants/me')
export class MyTenantProfileController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('profiles')
  getMyProfiles(@CurrentUser('userId') userId: string) {
    return this.tenantsService.getMyProfiles(userId);
  }

  @Patch('profiles/:tenantProfileId')
  updateMyProfile(
    @CurrentUser('userId') userId: string,
    @Param('tenantProfileId') tenantProfileId: string,
    @Body() dto: UpdateMyTenantProfileDto,
  ) {
    return this.tenantsService.updateMyProfile(userId, tenantProfileId, dto);
  }

  @Post('profiles/:tenantProfileId/avatar')
  @UseInterceptors(FileInterceptor('files', { storage: memoryStorage() }))
  uploadMyAvatar(
    @CurrentUser('userId') userId: string,
    @Param('tenantProfileId') tenantProfileId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.tenantsService.uploadMyProfileAvatar(userId, tenantProfileId, file);
  }
}
