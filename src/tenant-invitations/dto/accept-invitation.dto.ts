import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class AcceptInvitationDto {
  @ApiPropertyOptional({
    description:
      'Required only if no account exists yet for the invited email. Omit if you already have a ProPrentals account with this email — log in instead and the invitation is linked automatically the next time this endpoint is called while authenticated in a future revision.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must include upper, lower, and a number',
  })
  password?: string;
}
