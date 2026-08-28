import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RentChargesService } from './rent-charges.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('rent-charges')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('tenants/me/rent-charges')
export class MyRentChargesController {
  constructor(private readonly rentChargesService: RentChargesService) {}

  @Get()
  getMine(@CurrentUser('userId') userId: string) {
    return this.rentChargesService.getMyCharges(userId);
  }
}
