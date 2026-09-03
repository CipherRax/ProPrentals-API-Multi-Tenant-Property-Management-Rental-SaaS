import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, Min } from 'class-validator';

export class InitiateStkPushDto {
  @ApiProperty({ example: '0712345678' })
  @IsString()
  phoneNumber: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  amount: number;
}
