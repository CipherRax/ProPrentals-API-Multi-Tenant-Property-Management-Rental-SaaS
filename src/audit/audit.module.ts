import { Module } from '@nestjs/common';
import { AuditQueryService } from './audit-query.service';
import { AuditController } from './audit.controller';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [OrganizationsModule],
  controllers: [AuditController],
  providers: [AuditQueryService],
  exports: [AuditQueryService],
})
export class AuditModule {}
