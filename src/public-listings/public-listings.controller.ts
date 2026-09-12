import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PublicListingsService } from './public-listings.service';
import { NlSearchService } from './nl-search.service';
import { PublicListingsQueryDto } from './dto/public-listings-query.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Public Marketplace')
@Public()
@Controller('public')
export class PublicListingsController {
  constructor(
    private readonly listings: PublicListingsService,
    private readonly nl: NlSearchService,
  ) {}

  @Post('listings/ai/parse')
  @ApiOperation({
    summary:
      'AI natural-language search: translate free text into the structured marketplace filters (works alongside the manual filter panel).',
  })
  async aiParse(@Body('query') query: string) {
    return this.nl.parse(typeof query === 'string' ? query : '');
  }

  @Get('listings')
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'county', required: false })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'neighborhood', required: false })
  @ApiQuery({ name: 'propertyType', required: false })
  @ApiQuery({ name: 'unitType', required: false })
  @ApiQuery({ name: 'minPrice', required: false })
  @ApiQuery({ name: 'maxPrice', required: false })
  @ApiQuery({ name: 'bedrooms', required: false })
  @ApiQuery({ name: 'bathrooms', required: false })
  @ApiQuery({ name: 'amenities', required: false })
  @ApiQuery({
    name: 'includeUnavailable',
    required: false,
    description: '1/true also returns fully-booked unit types (greyed out)',
  })
  @ApiQuery({ name: 'sortOrder', enum: ['asc', 'desc'], required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOperation({
    summary: 'Public marketplace: one listing per unit type with live vacancy (no auth required)',
  })
  search(@Query() query: PublicListingsQueryDto) {
    return this.listings.search(query);
  }

  @Get('listings/summary')
  @ApiOperation({ summary: 'Marketplace quick stats (available unit types, distinct counties)' })
  summary() {
    return this.listings.getMarketSummary();
  }

  @Get('listings/:unitTypeId')
  @ApiOperation({ summary: 'Public unit-type listing detail (no auth required)' })
  detail(@Param('unitTypeId', ParseUUIDPipe) unitTypeId: string) {
    return this.listings.getListing(unitTypeId);
  }
}
