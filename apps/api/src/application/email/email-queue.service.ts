import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from './email.service';

/**
 * Simple in-memory email queue for MVP
 *
 * Purpose: Prevent timing-based user enumeration attacks
 * - Registration endpoint MUST NOT wait for email sending
 * - Email failures MUST NOT affect registration success
 * - All registration responses MUST have constant time (±50ms)
 *
 * Implementation: In-memory queue (KISS principle for MVP)
 * - No Redis dependency (works for self-hosted without extra services)
 * - Process emails asynchronously in background
 * - Fire-and-forget pattern (don't await)
 *
 * Future: Migrate to BullMQ when Redis is available in production
 */
@Injectable()
export class EmailQueueService {
  private readonly logger = new Logger(EmailQueueService.name);
  private queue: Array<() => Promise<void>> = [];
  private processing = false;

  constructor(private readonly emailService: EmailService) {}

  /**
   * Queue email verification for background sending (non-blocking)
   * Returns immediately - does NOT wait for email to send
   */
  queueEmailVerification(email: string, token: string, verificationUrl: string): void {
    this.queue.push(async () => {
      try {
        await this.emailService.sendEmailVerification(email, token, verificationUrl);
        this.logger.log(`Email verification sent to ${email}`);
      } catch (error) {
        this.logger.error(`Failed to send verification email to ${email}`, error);
        // Don't throw - registration should succeed even if email fails
      }
    });

    this.processQueue();
  }

  /**
   * Queue workspace invitation for background sending (non-blocking)
   * Returns immediately - does NOT wait for email to send
   */
  queueWorkspaceInvitation(email: string, workspaceName: string, inviteUrl: string): void {
    this.queue.push(async () => {
      try {
        await this.emailService.sendWorkspaceInvitation(email, workspaceName, inviteUrl);
        this.logger.log(`Workspace invitation sent to ${email}`);
      } catch (error) {
        this.logger.error(`Failed to send workspace invitation to ${email}`, error);
        // Don't throw - invitation creation should succeed even if email fails
      }
    });

    this.processQueue();
  }

  /**
   * Process queue in background (fire-and-forget)
   * Multiple calls are safe - only one processor runs at a time
   */
  private processQueue(): void {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    // Process next job asynchronously (don't await)
    setImmediate(async () => {
      while (this.queue.length > 0) {
        const job = this.queue.shift();
        if (job) {
          await job();
        }
      }
      this.processing = false;
    });
  }
}
