import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { EmailService } from './email.service';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        transport: {
          host: configService.get('SMTP_HOST', 'mailpit'),
          port: configService.get<number>('SMTP_PORT', 1025),
          secure: configService.get('SMTP_SECURE', 'false') === 'true',
          auth:
            configService.get('SMTP_USER') && configService.get('SMTP_PASSWORD')
              ? {
                  user: configService.get('SMTP_USER'),
                  pass: configService.get('SMTP_PASSWORD'),
                }
              : undefined,
        },
        defaults: {
          from: `"${configService.get('SMTP_FROM_NAME', 'Synjar')}" <${configService.get('SMTP_FROM_EMAIL', 'help@synjar.com')}>`,
        },
        template: {
          dir: join(__dirname, 'templates'),
          adapter: new HandlebarsAdapter(),
          options: {
            strict: true,
          },
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
