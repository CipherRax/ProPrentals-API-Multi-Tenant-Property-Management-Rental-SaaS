import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { InquiryStatus } from '@prisma/client';

export class UpdateInquiryStatusDto {
  @IsEnum(InquiryStatus)
  status: InquiryStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  response?: string;
}
