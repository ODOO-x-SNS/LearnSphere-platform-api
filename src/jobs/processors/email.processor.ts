import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../constants';

@Processor(QUEUE_NAMES.EMAIL)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  async process(job: Job<{ to: string; subject: string; body: string }>): Promise<void> {
    this.logger.log(`Processing email job ${job.id} -> ${job.data.to}`);

    // TODO: Integrate SendGrid / SES / Postmark
    // const sgMail = require('@sendgrid/mail');
    // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    // await sgMail.send({ to: job.data.to, from: 'noreply@learnsphere.io', subject: job.data.subject, html: job.data.body });

    this.logger.log(`Email sent to ${job.data.to} (stub)`);
  }
}
