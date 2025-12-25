import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from './email.service';
import { MailerService } from '@nestjs-modules/mailer';

describe('EmailService', () => {
  let service: EmailService;
  let mailerStub: Partial<MailerService>;

  beforeEach(async () => {
    // Create stub following CLAUDE.md guidelines (stub > mock)
    mailerStub = {
      sendMail: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        { provide: MailerService, useValue: mailerStub },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  describe('sendEmailVerification', () => {
    it('should send email verification with correct template', async () => {
      // Arrange
      const email = 'test@example.com';
      const token = 'verification-token-123';
      const verificationUrl = 'https://app.synjar.com/verify?token=verification-token-123';

      // Act
      await service.sendEmailVerification(email, token, verificationUrl);

      // Assert - test behavior: correct template is used
      expect(mailerStub.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: email,
          template: 'email-verification',
        }),
      );
    });

    it('should use correct subject', async () => {
      // Arrange
      const email = 'test@example.com';
      const token = 'verification-token-123';
      const verificationUrl = 'https://app.synjar.com/verify?token=verification-token-123';

      // Act
      await service.sendEmailVerification(email, token, verificationUrl);

      // Assert - test behavior: correct subject is used
      expect(mailerStub.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Verify your email - Synjar',
        }),
      );
    });

    it('should include verification URL in template context', async () => {
      // Arrange
      const email = 'test@example.com';
      const token = 'verification-token-123';
      const verificationUrl = 'https://app.synjar.com/verify?token=verification-token-123';

      // Act
      await service.sendEmailVerification(email, token, verificationUrl);

      // Assert - test behavior: context includes verificationUrl
      expect(mailerStub.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            verificationUrl,
            token,
          }),
        }),
      );
    });

    it('should send email to correct recipient', async () => {
      // Arrange
      const email = 'user@example.com';
      const token = 'abc123';
      const verificationUrl = 'https://app.synjar.com/verify?token=abc123';

      // Act
      await service.sendEmailVerification(email, token, verificationUrl);

      // Assert - test behavior: email is sent to the correct recipient
      expect(mailerStub.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
        }),
      );
    });
  });
});
