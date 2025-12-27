import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { Request, Response } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const appModule = await AppModule.forRoot();
  const app = await NestFactory.create(appModule);

  app.use(cookieParser());

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const allowedOrigins = [
    ...(process.env.CORS_ORIGINS?.split(',') || []),
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    'http://localhost:3100',
    'http://localhost:5173',
    'http://localhost:6210',
    'http://localhost:6211',
  ].filter(Boolean) as string[];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const config = new DocumentBuilder()
    .setTitle('Synjar API')
    .setDescription('Knowledge Base with RAG capabilities')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Security: Prevent signed URLs leak in Referer header
  app.use((_req: Request, res: Response, next: () => void) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  const port = process.env.PORT || 6200;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
