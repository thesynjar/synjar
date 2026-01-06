import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const appModule = await AppModule.forRoot();
  const app = await NestFactory.create(appModule);

  // Security: HTTP security headers (X-Content-Type-Options, X-Frame-Options, etc.)
  app.use(helmet());

  // CORS for MCP endpoints - allow all origins (ChatGPT, Claude, any client)
  // MCP uses token-based auth, not origin-based, so wildcard is safe
  app.use('/mcp', (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, MCP-Protocol-Version',
    );
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  });

  // Security: Limit MCP request body size to prevent DoS attacks (10KB)
  // Must exclude MCP from the general 10MB limit below
  app.use('/mcp', json({ limit: '10kb' }));

  // Increase body size limits for document uploads (excludes /mcp routes)
  app.use((req: Request, res: Response, next: () => void) => {
    if (req.path.startsWith('/mcp')) {
      return next();
    }
    return json({ limit: '10mb' })(req, res, next);
  });
  app.use(urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

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
    'http://localhost:6210', // dev web
    'http://localhost:6310', // test web (E2E tests)
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
