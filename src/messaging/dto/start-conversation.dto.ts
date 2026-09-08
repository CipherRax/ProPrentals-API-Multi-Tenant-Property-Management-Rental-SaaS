import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class StartConversationDto {
  @ApiProperty({ description: 'The tenant profile to start (or resume) a conversation with' })
  @IsUUID()
  tenantProfileId: string;
}
