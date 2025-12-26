import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class EmailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendEmailVerification(
    email: string,
    token: string,
    verificationUrl: string,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Verify your email - Synjar',
      template: 'email-verification',
      context: {
        token,
        verificationUrl,
      },
    });
  }

  async sendWorkspaceInvitation(
    email: string,
    workspaceName: string,
    inviteUrl: string,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: `You've been invited to join ${workspaceName} on Synjar`,
      template: 'workspace-invitation',
      context: {
        workspaceName,
        inviteUrl,
      },
    });
  }
}
