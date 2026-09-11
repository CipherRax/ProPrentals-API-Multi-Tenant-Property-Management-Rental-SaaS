import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, Matches, Max, Min } from 'class-validator';

export class InitiateStkPushDto {
  @ApiProperty({ example: '0712345678' })
  @IsString()
  @Matches(/^(\+?254|0)?[17]\d{8}$/, {
    message: 'Provide a valid Kenyan Safaricom/Airtel phone number',
  })
  phoneNumber: string;

  @ApiProperty({ example: 9000 })
  @IsNumber()
  @Min(1)
  @Max(999999) // per-transaction cap for rent/deposit M-Pesa payments
  amount: number;
}