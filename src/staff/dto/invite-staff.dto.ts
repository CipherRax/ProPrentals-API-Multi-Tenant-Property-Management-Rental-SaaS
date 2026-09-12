import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class InviteStaffDto {
  @ApiProperty({ example: 'jane.doe@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiProperty({
    enum: [OrgRole.CARETAKER, OrgRole.ACCOUNTANT, OrgRole.PROPERTY_MANAGER, OrgRole.STAFF],
    example: OrgRole.CARETAKER,
  })
  @IsEnum(OrgRole)
  role: OrgRole;

  @ApiPropertyOptional({ default: 7, description: 'Invitation validity in days' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays?: number;
}
