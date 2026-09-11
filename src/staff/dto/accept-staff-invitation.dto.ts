import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class AcceptStaffInvitationDto {
  @ApiProperty({ example: 'Jane' })
  @IsString()
  @MinLength(2, { message: 'First name is required' })
  @MaxLength(80)
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @MinLength(2, { message: 'Last name is required' })
  @MaxLength(80)
  lastName: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must include upper, lower, and a number',
  })
  password: string;
}
