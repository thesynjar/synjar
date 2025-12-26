import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { existsSync, readdirSync } from 'fs';
import { EmailService } from './email.service';
import { EmailQueueService } from './email-queue.service';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        // SMTP port defaults: Test: 6212, Dev: 6202
        const isTest = process.env.NODE_ENV === 'test';
        const defaultSmtpPort = isTest ? 6212 : 6202;

        const smtpHost = configService.get('SMTP_HOST', 'localhost');
        const smtpPortConfig = configService.get('SMTP_PORT');
        const smtpPort = smtpPortConfig ? parseInt(smtpPortConfig, 10) : defaultSmtpPort;

        // DEBUG: Log template directory resolution
        const templateDir = join(__dirname, 'templates');
        console.log('🔍 [EmailModule] Template directory resolution:');
        console.log('  __dirname:', __dirname);
        console.log('  templateDir:', templateDir);
        console.log('  exists?', existsSync(templateDir));
        if (existsSync(templateDir)) {
          console.log('  files:', readdirSync(templateDir));
        } else {
          console.log('  ❌ Directory does not exist!');
          // Check parent directory
          const parentDir = join(__dirname, '..');
          console.log('  parent dir:', parentDir, 'exists?', existsSync(parentDir));
          if (existsSync(parentDir)) {
            console.log('  parent contents:', readdirSync(parentDir));
          }
        }

        return {
        transport: {
          host: smtpHost,
          port: smtpPort,
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
          dir: templateDir,
          adapter: new HandlebarsAdapter(),
          options: {
            strict: true,
          },
        },
      };},
      inject: [ConfigService],
    }),
  ],
  providers: [EmailService, EmailQueueService],
  exports: [EmailService, EmailQueueService],
})
export class EmailModule {}
