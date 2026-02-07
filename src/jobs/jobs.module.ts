import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from './constants';
import { EmailProcessor } from './processors/email.processor';
import { BadgeCheckProcessor } from './processors/badge-check.processor';
import { VirusScanProcessor } from './processors/virus-scan.processor';
import { BadgesModule } from '../badges/badges.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EMAIL },
      { name: QUEUE_NAMES.BADGE_CHECK },
      { name: QUEUE_NAMES.VIRUS_SCAN },
      { name: QUEUE_NAMES.REPORT_AGGREGATION },
      { name: QUEUE_NAMES.COURSE_EXPORT },
    ),
    BadgesModule,
  ],
  providers: [EmailProcessor, BadgeCheckProcessor, VirusScanProcessor],
  exports: [BullModule],
})
export class JobsModule {}
