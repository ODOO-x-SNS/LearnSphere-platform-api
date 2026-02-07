import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../constants';
import { BadgesService } from '../../badges/badges.service';

@Processor(QUEUE_NAMES.BADGE_CHECK)
export class BadgeCheckProcessor extends WorkerHost {
  private readonly logger = new Logger(BadgeCheckProcessor.name);

  constructor(private readonly badgesService: BadgesService) {
    super();
  }

  async process(job: Job<{ userId: string }>): Promise<void> {
    this.logger.log(`Checking badges for user ${job.data.userId}`);
    const result = await this.badgesService.checkAndAwardBadges(job.data.userId);
    this.logger.log(`Badge check result: ${JSON.stringify(result)}`);
  }
}
