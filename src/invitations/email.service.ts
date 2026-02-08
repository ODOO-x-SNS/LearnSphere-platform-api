import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    const smtpUser = this.config.get<string>('SMTP_USER');
    const smtpPass = this.config.get<string>('SMTP_PASS');

    if (!smtpUser || !smtpPass) {
      this.logger.warn('SMTP_USER or SMTP_PASS not configured — emails will not be sent');
    }

    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST', 'smtp.gmail.com'),
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
  }

  async sendInvitationEmail(
    to: string,
    courseTitle: string,
    inviteToken: string,
  ): Promise<void> {
    const frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:5174',
    );
    const inviteLink = `${frontendUrl}/invite/accept?token=${inviteToken}`;
    // Gmail ignores arbitrary "from" — use the authenticated SMTP_USER as sender
    const smtpUser = this.config.get<string>('SMTP_USER');

    try {
      await this.transporter.sendMail({
        from: `"LearnSphere" <${smtpUser}>`,
        to,
        subject: `You're invited to join a course on LearnSphere`,
        html: `
          <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #1a1a2e;">You've been invited!</h2>
            <p style="color: #444; line-height: 1.6;">
              You have been invited to join the course <strong>${courseTitle}</strong> on LearnSphere.
            </p>
            <p style="color: #444; line-height: 1.6;">
              Click the link below to accept the invitation:
            </p>
            <div style="margin: 24px 0;">
              <a href="${inviteLink}"
                 style="display: inline-block; background: #4f46e5; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                Accept Invitation
              </a>
            </div>
            <p style="color: #888; font-size: 13px;">
              This invitation will expire in 7 days. If you don't have an account, you'll be prompted to sign up first.
            </p>
          </div>
        `,
      });
      this.logger.log(`Invitation email sent to ${to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send invitation email to ${to}: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Don't throw — invitation is still created, email failure shouldn't block the flow
    }
  }
}
