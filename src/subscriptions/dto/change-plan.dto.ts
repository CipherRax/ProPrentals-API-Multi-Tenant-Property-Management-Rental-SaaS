import { IsEnum } from 'class-validator';
import { SubscriptionPlanTier } from '@prisma/client';

export class ChangePlanDto {
  @IsEnum(SubscriptionPlanTier)
  tier: SubscriptionPlanTier;
}
