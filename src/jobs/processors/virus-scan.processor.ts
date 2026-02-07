import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../constants';

@Processor(QUEUE_NAMES.VIRUS_SCAN)
export class VirusScanProcessor extends WorkerHost {
  private readonly logger = new Logger(VirusScanProcessor.name);

  async process(job: Job<{ fileId: string }>): Promise<void> {
    this.logger.log(`Running virus scan for file ${job.data.fileId}`);

    // TODO: Integrate ClamAV or cloud virus scanning service
    // For now, this is a stub.

    this.logger.log(`Virus scan complete for file ${job.data.fileId} (stub — clean)`);
  }
}
