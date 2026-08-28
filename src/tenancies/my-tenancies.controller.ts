import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenanciesService } from './tenancies.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('tenancies')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('tenants/me/tenancies')
export class MyTenanciesController {
  constructor(private readonly tenanciesService: TenanciesService) {}

  @Get()
  getMine(@CurrentUser('userId') userId: string) {
    return this.tenanciesService.getMyTenancies(userId);
  }
}
