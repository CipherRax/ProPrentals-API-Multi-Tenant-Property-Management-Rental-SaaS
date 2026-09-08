import { ApiProperty } from '@nestjs/swagger';
import { NotificationCategory } from '@prisma/client';
import { IsBoolean, IsEnum } from 'class-validator';

export class UpdatePreferenceDto {
  @ApiProperty({ enum: NotificationCategory })
  @IsEnum(NotificationCategory)
  category: NotificationCategory;

  @ApiProperty()
  @IsBoolean()
  inAppEnabled: boolean;

  @ApiProperty()
  @IsBoolean()
  emailEnabled: boolean;

  @ApiProperty()
  @IsBoolean()
  smsEnabled: boolean;
}
