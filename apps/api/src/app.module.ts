import { Module, DynamicModule, Logger, Type, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './infrastructure/persistence/prisma/prisma.module';
import { AuthModule } from './application/auth/auth.module';
import { WorkspaceModule } from './application/workspace/workspace.module';
import { DocumentModule } from './application/document/document.module';
import { SearchModule } from './application/search/search.module';
import { PublicLinkModule } from './application/public-link/public-link.module';
import { WorkspaceLookupModule } from './application/workspace-lookup/workspace-lookup.module';
import { EmbeddingsModule } from './infrastructure/embeddings/embeddings.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { LLMModule } from './infrastructure/llm/llm.module';
import { EventsModule } from './infrastructure/events/events.module';
import { RlsMiddleware } from './infrastructure/persistence/rls/rls.middleware';

const logger = new Logger('AppModule');

/**
 * Core modules always loaded (community edition)
 */
const CORE_MODULES = [
  ConfigModule.forRoot({
    isGlobal: true,
  }),
  ThrottlerModule.forRoot([
    {
      ttl: 60000,
      limit: 100,
    },
  ]),
  PrismaModule,
  EventsModule,
  EmbeddingsModule,
  StorageModule,
  LLMModule,
  AuthModule,
  WorkspaceModule,
  DocumentModule,
  SearchModule,
  PublicLinkModule,
  WorkspaceLookupModule,
];

/**
 * Enterprise module configuration
 */
interface EnterpriseModuleConfig {
  packageName: string;
  moduleName: string;
  envFlag?: string;
}

const ENTERPRISE_MODULES: EnterpriseModuleConfig[] = [
  { packageName: '@kuklatech/kf-license', moduleName: 'LicenseModule' },
  { packageName: '@kuklatech/kf-billing', moduleName: 'BillingModule' },
  { packageName: '@kuklatech/kf-admin', moduleName: 'AdminModule' },
  { packageName: '@kuklatech/kf-analytics', moduleName: 'AnalyticsModule' },
];

/**
 * Dynamically loads enterprise modules if available and enabled
 */
async function loadEnterpriseModules(): Promise<Type<unknown>[]> {
  if (process.env.ENABLE_ENTERPRISE !== 'true') {
    logger.log('Running in Community mode');
    return [];
  }

  logger.log('Enterprise mode enabled, loading modules...');
  const loadedModules: Type<unknown>[] = [];

  for (const config of ENTERPRISE_MODULES) {
    try {
      const modulePackage = await import(config.packageName);
      const module = modulePackage[config.moduleName];

      if (module) {
        loadedModules.push(module);
        logger.log(`Loaded: ${config.packageName}`);
      }
    } catch {
      logger.debug(`Optional module not available: ${config.packageName}`);
    }
  }

  if (loadedModules.length > 0) {
    logger.log(`Enterprise modules loaded: ${loadedModules.length}`);
  } else {
    logger.warn('Enterprise mode enabled but no modules found. Install @kuklatech/kf-* packages.');
  }

  return loadedModules;
}

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply RLS middleware to all routes
    // This ensures user context is set from JWT for Row Level Security
    consumer.apply(RlsMiddleware).forRoutes('*');
  }

  static async forRoot(): Promise<DynamicModule> {
    const enterpriseModules = await loadEnterpriseModules();

    return {
      module: AppModule,
      imports: [...CORE_MODULES, ...enterpriseModules],
      providers: [
        RlsMiddleware,
        {
          provide: APP_GUARD,
          useClass: ThrottlerGuard,
        },
      ],
    };
  }
}
