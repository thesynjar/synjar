# Security Implementation Plan - Synjar

**Status:** Proposed
**Created:** 2025-12-25
**Target:** MVP + Post-MVP phases

---

## Executive Summary

Ten dokument definiuje konkretny plan wdrożenia mechanizmów bezpieczeństwa dla Synjar, podzielony na fazy MVP i Post-MVP. Plan jest zgodny z research report i security guidelines.

---

## Phase 1: MVP Security (P0 - Fundament)

**Timeline:** Sprint 1-2 (2 tygodnie)
**Goal:** Minimum viable security dla public launch

### 1.1 Row-Level Security (RLS)

**Owner:** Backend team
**Effort:** 3 days

#### Tasks

- [ ] **Migracja SQL z RLS policies** (1 day)
  - Enable RLS na tabelach: Workspace, WorkspaceMember, Document, Chunk, DocumentTag, PublicLink
  - FORCE RLS dla app role
  - Create policies (już w SPEC-001)
  - Helper function `get_user_workspace_ids()`

  ```sql
  -- apps/api/prisma/migrations/YYYYMMDDHHMMSS_enable_rls/migration.sql

  -- Enable RLS
  ALTER TABLE "Workspace" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "Workspace" FORCE ROW LEVEL SECURITY;
  -- ... (rest from SPEC-001)
  ```

- [ ] **RLS Middleware** (0.5 day)
  - Implement `RlsMiddleware` (SET LOCAL app.current_user_id)
  - Apply globally w main.ts
  - Handle public API (bypass dla token-based access)

  ```typescript
  // src/infrastructure/persistence/rls/rls.middleware.ts
  // Implementation from SPEC-001
  ```

- [ ] **Transaction wrapper** (0.5 day)
  - `PrismaService.withRls(userId, fn)` helper
  - `PrismaService.withBypass(fn)` dla Public API

- [ ] **Tests** (1 day)
  - Cross-tenant isolation tests
  - SQL injection prevention test
  - Public API bypass test

**Deliverable:** RLS enabled, tested, deployed

---

### 1.2 Authentication & Authorization

**Owner:** Backend team
**Effort:** 2 days

#### Tasks

- [ ] **JwtAuthGuard** (0.5 day)
  - Passport JWT strategy
  - Extract user.sub from token
  - Global guard w main.ts

  ```typescript
  // src/application/auth/guards/jwt-auth.guard.ts

  @Injectable()
  export class JwtAuthGuard extends AuthGuard('jwt') {
    handleRequest(err, user, info) {
      if (err || !user) {
        throw new UnauthorizedException('Invalid token');
      }
      return user;
    }
  }
  ```

- [ ] **WorkspaceAccessGuard** (0.5 day)
  - Check workspace membership
  - Uniform error responses (404, nie 403)
  - Cache membership check (Redis - optional)

- [ ] **Apply guards** (0.5 day)
  - All workspace-scoped controllers
  - Document controllers
  - Search endpoints

- [ ] **Tests** (0.5 day)
  - Authorization bypass tests
  - IDOR prevention tests

**Deliverable:** Guards implemented, all endpoints protected

---

### 1.3 Input Validation

**Owner:** Backend team
**Effort:** 2 days

#### Tasks

- [ ] **DTOs with class-validator** (1 day)
  - CreateDocumentDto
  - UpdateDocumentDto
  - CreateWorkspaceDto
  - SearchQueryDto
  - UploadFileDto

  ```typescript
  // Example: SearchQueryDto
  export class SearchQueryDto {
    @IsString()
    @MinLength(2)
    @MaxLength(200)
    @Matches(/^[a-zA-Z0-9\s\-_\.]+$/)
    query: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number = 10;
  }
  ```

- [ ] **Global validation pipe** (0.5 day)
  - Enable whitelist (strip unknown properties)
  - Transform to class instances

  ```typescript
  // src/main.ts
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  ```

- [ ] **File upload validation** (0.5 day)
  - MIME type whitelist
  - File size validation (per plan)
  - Magic bytes check (FileType library)

**Deliverable:** All inputs validated, malicious payloads rejected

---

### 1.4 Rate Limiting

**Owner:** Backend team
**Effort:** 1 day

#### Tasks

- [ ] **Global rate limit** (0.5 day)
  - ThrottlerModule config
  - 100 req/min per IP

  ```typescript
  @Module({
    imports: [
      ThrottlerModule.forRoot({
        ttl: 60,
        limit: 100,
      }),
    ],
  })
  ```

- [ ] **Endpoint-specific limits** (0.5 day)
  - Search: 10 req/min
  - Upload: 5 req/min
  - Auth (login): 5 req/min (brute-force protection)

**Deliverable:** DoS protection enabled

---

### 1.5 Security Testing

**Owner:** Backend team + QA
**Effort:** 2 days

#### Tasks

- [ ] **Multi-tenant isolation tests** (1 day)
  - User A cannot access User B resources
  - RLS enforcement tests
  - Public API isolation

- [ ] **Authorization tests** (0.5 day)
  - IDOR prevention
  - Workspace manipulation
  - Document ID guessing

- [ ] **Input validation tests** (0.5 day)
  - XSS payload rejection
  - SQL injection attempts
  - File upload malicious payloads

**Deliverable:** 90%+ security test coverage

---

### 1.6 CI/CD Security Scans

**Owner:** DevOps
**Effort:** 1 day

#### Tasks

- [ ] **GitHub Actions workflow** (0.5 day)
  - npm audit (fail on HIGH+)
  - Snyk scan
  - CodeQL analysis

  ```yaml
  # .github/workflows/security.yml
  name: Security Scan
  on: [push, pull_request]

  jobs:
    audit:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v3
        - run: pnpm install --frozen-lockfile
        - run: pnpm audit --audit-level=high

    snyk:
      runs-on: ubuntu-latest
      steps:
        - uses: snyk/actions/node@master
          env:
            SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
  ```

- [ ] **Pre-commit hooks** (0.5 day)
  - ESLint security rules
  - Secrets detection (git-secrets)

**Deliverable:** Automated security scans w CI/CD

---

### 1.7 Secrets Management

**Owner:** DevOps
**Effort:** 1 day

#### Tasks

- [ ] **Environment variables** (0.5 day)
  - .env.example with placeholders
  - ConfigService dla wszystkich secrets
  - Validation: fail fast jeśli brak required secrets

- [ ] **Production secrets** (0.5 day)
  - Use cloud provider secrets manager (AWS Secrets Manager / GCP Secret Manager)
  - Rotate DATABASE_URL, JWT_SECRET

**Deliverable:** Zero hardcoded secrets, secure production config

---

## Phase 1 Summary

**Total effort:** 12 days (2 sprints)

| Task | Effort | Priority |
|------|--------|----------|
| RLS | 3 days | P0 |
| Auth/Authz | 2 days | P0 |
| Input validation | 2 days | P0 |
| Rate limiting | 1 day | P0 |
| Security tests | 2 days | P0 |
| CI/CD scans | 1 day | P0 |
| Secrets mgmt | 1 day | P0 |

**Deliverables:**

- RLS enforced na wszystkich tenant tables
- Guards na wszystkich endpoints
- Input validation via DTOs
- Rate limiting (DoS protection)
- Security tests (90%+ coverage)
- CI/CD security scans
- Zero hardcoded secrets

---

## Phase 2: Post-MVP Security (P1 - Enhancement)

**Timeline:** Sprint 3-5 (3 tygodnie)
**Goal:** Enterprise-grade security

### 2.1 Enterprise Plugin Architecture

**Owner:** Backend team
**Effort:** 5 days

#### Tasks

- [ ] **Plugin API interfaces** (1 day)
  - ITenantManager
  - IBillingProvider
  - ILicenseValidator
  - IAuditLogger

  ```typescript
  // packages/plugins-api/src/interfaces/tenant-manager.interface.ts

  export interface ITenantManager {
    createTenant(dto: CreateTenantDto): Promise<Tenant>;
    deleteTenant(tenantId: string): Promise<void>;
    provisionWorkspace(tenantId: string, ownerId: string): Promise<Workspace>;
    getCrosstenantAnalytics(): Promise<TenantAnalytics[]>;
  }
  ```

- [ ] **Plugin loading mechanism** (1 day)
  - Dynamic import based on ENABLE_ENTERPRISE env var
  - Graceful degradation (brak enterprise module = community mode)

- [ ] **Enterprise module (closed-source)** (3 days)
  - Private npm package: `@synjar/enterprise`
  - TenantAdminModule
  - LicenseValidationModule
  - BillingModule (stub)

  ```typescript
  // @synjar/enterprise/src/enterprise.module.ts

  @Module({
    imports: [
      TenantAdminModule,
      LicenseValidationModule,
      BillingModule,
    ],
  })
  export class EnterpriseModule {}
  ```

**Deliverable:** Separacja open-source core od enterprise features

---

### 2.2 License Validation

**Owner:** Backend team
**Effort:** 3 days

#### Tasks

- [ ] **License server** (2 days)
  - Standalone service (NestJS)
  - REST API: POST /validate
  - Database: licenses table
  - JWT response z features list

  ```typescript
  // license-server/src/license/license.controller.ts

  @Post('validate')
  async validate(@Body() dto: ValidateLicenseDto) {
    const license = await this.licenseService.findByKey(dto.key);

    if (!license || license.expiresAt < new Date()) {
      return { valid: false };
    }

    return {
      valid: true,
      features: license.features,  // ['TENANT_MANAGEMENT', 'ADVANCED_ANALYTICS']
      expiresAt: license.expiresAt,
    };
  }
  ```

- [ ] **Client-side validation** (1 day)
  - LicenseService w aplikacji
  - Walidacja przy starcie (initialize())
  - Cache features in memory
  - Re-validate co 24h

  ```typescript
  @Injectable()
  export class LicenseService {
    private features: Set<string> = new Set(['CORE']);

    async initialize() {
      const key = this.configService.get('LICENSE_KEY');
      if (!key) return;

      const response = await this.httpService.post(
        `${this.licenseServerUrl}/validate`,
        { key, instanceId: await this.getInstanceId() }
      );

      if (response.data.valid) {
        this.features = new Set(response.data.features);
      }
    }

    hasFeature(feature: string): boolean {
      return this.features.has(feature);
    }
  }
  ```

**Deliverable:** License enforcement dla enterprise features

---

### 2.3 Audit Logging

**Owner:** Backend team
**Effort:** 4 days

#### Tasks

- [ ] **AuditLog model** (1 day)
  - Prisma schema: userId, action, resource, metadata, timestamp
  - Separate table (nie workspace-scoped)

  ```prisma
  model AuditLog {
    id         String   @id @default(uuid())
    userId     String
    workspaceId String?

    action     String   // "document.created", "workspace.deleted"
    resource   String   // "Document:abc-123"
    metadata   Json?    // Extra context

    ipAddress  String?
    userAgent  String?

    createdAt  DateTime @default(now()) @db.Timestamptz

    @@index([userId])
    @@index([workspaceId])
    @@index([action])
    @@index([createdAt])
  }
  ```

- [ ] **AuditInterceptor** (1 day)
  - Log all state-changing operations (POST, PUT, DELETE)
  - Extract user, action, resource from context
  - Async write (non-blocking)

  ```typescript
  @Injectable()
  export class AuditInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler) {
      const request = context.switchToHttp().getRequest();
      const user = request.user;
      const method = request.method;
      const path = request.path;

      if (['POST', 'PUT', 'DELETE'].includes(method)) {
        // Log after response (async)
        return next.handle().pipe(
          tap(async (response) => {
            await this.auditService.log({
              userId: user?.sub,
              action: `${method} ${path}`,
              resource: this.extractResource(request, response),
              ipAddress: request.ip,
              userAgent: request.headers['user-agent'],
            });
          })
        );
      }

      return next.handle();
    }
  }
  ```

- [ ] **Audit query API** (1 day)
  - GET /workspaces/:id/audit-log
  - Filter by action, date range
  - Pagination

- [ ] **Retention policy** (1 day)
  - Cron job: delete logs older than 90 days
  - Configurable per plan (future)

**Deliverable:** Audit trail dla compliance (GDPR, SOC2)

---

### 2.4 Advanced Rate Limiting

**Owner:** Backend team
**Effort:** 2 days

#### Tasks

- [ ] **Per-workspace rate limit** (1 day)
  - Redis-based counter
  - Different limits per plan (FREE: 100 req/hour, PRO: 1000 req/hour)

  ```typescript
  @Injectable()
  export class WorkspaceRateLimitGuard implements CanActivate {
    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest();
      const workspaceId = request.params.workspaceId;

      const key = `ratelimit:workspace:${workspaceId}:${Date.now() / 3600000}`;
      const count = await this.redis.incr(key);
      await this.redis.expire(key, 3600);

      const limit = await this.getWorkspaceLimit(workspaceId);

      if (count > limit) {
        throw new TooManyRequestsException(
          `Workspace rate limit exceeded (${limit}/hour)`
        );
      }

      return true;
    }
  }
  ```

- [ ] **Usage tracking** (1 day)
  - Track API calls per workspace (dla analytics)
  - Store w UsageMetrics table

**Deliverable:** Fair usage enforcement per workspace

---

### 2.5 Encryption

**Owner:** Backend team
**Effort:** 3 days

#### Tasks

- [ ] **Database encryption (at rest)** (1 day)
  - PostgreSQL TDE (Transparent Data Encryption)
  - Lub AWS RDS encryption

- [ ] **Column-level encryption** (1 day)
  - Encrypt sensitive fields (API keys, tokens)
  - Use crypto-js / node:crypto

  ```typescript
  // src/infrastructure/persistence/transformers/encryption.transformer.ts

  import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

  export class EncryptionTransformer implements ValueTransformer {
    private algorithm = 'aes-256-gcm';
    private key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

    to(value: string): string {
      const iv = randomBytes(16);
      const cipher = createCipheriv(this.algorithm, this.key, iv);
      let encrypted = cipher.update(value, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag().toString('hex');

      return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    }

    from(value: string): string {
      const [iv, authTag, encrypted] = value.split(':');
      const decipher = createDecipheriv(
        this.algorithm,
        this.key,
        Buffer.from(iv, 'hex')
      );
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    }
  }

  // Usage in Entity
  @Column({ type: 'text', transformer: new EncryptionTransformer() })
  apiKey: string;
  ```

- [ ] **HTTPS enforcement** (0.5 day)
  - Helmet middleware
  - Strict-Transport-Security header

  ```typescript
  // src/main.ts
  import helmet from 'helmet';

  app.use(helmet({
    hsts: { maxAge: 31536000, includeSubDomains: true },
    contentSecurityPolicy: true,
  }));
  ```

- [ ] **Database SSL connection** (0.5 day)
  - PostgreSQL connection with SSL
  - Verify server certificate

  ```typescript
  // DATABASE_URL with SSL
  postgresql://user:pass@host:5432/db?sslmode=require&sslrootcert=/path/to/ca.pem
  ```

**Deliverable:** Encryption at rest and in transit

---

### 2.6 Security Monitoring

**Owner:** DevOps + Backend
**Effort:** 3 days

#### Tasks

- [ ] **Sentry integration** (1 day)
  - Error tracking
  - Security events (auth failures, unauthorized access)

- [ ] **Alerting** (1 day)
  - Slack webhook dla critical security events
  - Threshold alerts (e.g., 10+ auth failures w 1 min)

  ```typescript
  @Injectable()
  export class SecurityAlerter {
    async alertSuspiciousActivity(event: SecurityEvent) {
      if (event.severity === 'CRITICAL') {
        await this.slackService.send({
          channel: '#security-alerts',
          text: `🚨 CRITICAL: ${event.description}`,
          fields: [
            { title: 'User', value: event.userId },
            { title: 'Action', value: event.action },
            { title: 'IP', value: event.ipAddress },
          ],
        });
      }
    }
  }
  ```

- [ ] **Metrics dashboard** (1 day)
  - Grafana dashboard
  - Metrics: auth failures, rate limit hits, RLS violations

**Deliverable:** Real-time security monitoring

---

## Phase 2 Summary

**Total effort:** 20 days (4 sprints)

| Task | Effort | Priority |
|------|--------|----------|
| Enterprise plugin | 5 days | P1 |
| License validation | 3 days | P1 |
| Audit logging | 4 days | P1 |
| Advanced rate limiting | 2 days | P1 |
| Encryption | 3 days | P1 |
| Monitoring | 3 days | P1 |

**Deliverables:**

- Enterprise features w closed-source plugin
- License enforcement
- Audit trail dla compliance
- Per-workspace rate limiting
- Encryption at rest and in transit
- Real-time security monitoring

---

## Phase 3: Scale & Compliance (P2 - Future)

**Timeline:** Q2 2026 (gdy będzie 100+ active users)

### 3.1 Admin Microservice

**Effort:** 10 days

- [ ] Separate service dla admin operations
- [ ] Cross-tenant analytics
- [ ] Tenant provisioning automation
- [ ] Database backup/restore per workspace

### 3.2 Secrets Management (Vault)

**Effort:** 5 days

- [ ] HashiCorp Vault deployment
- [ ] Dynamic secrets (DB credentials)
- [ ] Automatic rotation
- [ ] Audit trail

### 3.3 SOC2 Compliance

**Effort:** 15 days

- [ ] Access control reviews (quarterly)
- [ ] Penetration testing (quarterly)
- [ ] Security awareness training
- [ ] Incident response drills

### 3.4 Bug Bounty Program

**Effort:** 3 days setup, ongoing

- [ ] HackerOne program
- [ ] Scope definition
- [ ] Rewards structure
- [ ] Disclosure policy

---

## Implementation Checklist

### Pre-MVP

- [ ] Security guidelines document reviewed by team
- [ ] Threat model workshop (identify attack vectors)
- [ ] Security champion assigned (owner)

### MVP (Phase 1)

- [ ] RLS enabled and tested
- [ ] Guards on all endpoints
- [ ] Input validation via DTOs
- [ ] Rate limiting configured
- [ ] Security tests (90%+ coverage)
- [ ] CI/CD scans passing
- [ ] Zero hardcoded secrets

### Post-MVP (Phase 2)

- [ ] Enterprise plugin architecture
- [ ] License validation
- [ ] Audit logging
- [ ] Per-workspace rate limiting
- [ ] Encryption enabled
- [ ] Monitoring dashboard

### Scale (Phase 3)

- [ ] Admin microservice
- [ ] Vault integration
- [ ] SOC2 audit
- [ ] Bug bounty program

---

## Success Metrics

| Metric | Target | Tracking |
|--------|--------|----------|
| Security test coverage | > 90% | Jest coverage report |
| Critical vulnerabilities | 0 | Snyk dashboard |
| RLS enforcement | 100% tenant tables | Manual audit |
| Auth/authz coverage | 100% protected endpoints | Code review |
| Incident response time | < 24h for critical | Incident logs |
| Security training | 100% eng team | Quarterly |

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| RLS performance degradation | Medium | High | Index on workspaceId, cache user workspaces |
| License server downtime | Low | Medium | Grace period (24h offline mode) |
| Secrets leak in git | Low | Critical | Pre-commit hook (git-secrets) |
| Dependency vulnerabilities | Medium | High | Automated Snyk scans, monthly updates |
| Insider threat | Low | Critical | Audit logging, least privilege access |

---

## Timeline Overview

```
Sprint 1-2 (2 weeks):  Phase 1 - MVP Security
├─ RLS
├─ Auth/Authz
├─ Input validation
├─ Rate limiting
├─ Security tests
└─ CI/CD scans

Sprint 3-5 (3 weeks):  Phase 2 - Post-MVP
├─ Enterprise plugin
├─ License validation
├─ Audit logging
├─ Advanced rate limiting
├─ Encryption
└─ Monitoring

Q2 2026:  Phase 3 - Scale & Compliance
├─ Admin microservice
├─ Vault
├─ SOC2
└─ Bug bounty
```

---

## Questions & Decisions

### Open questions

1. **License server hosting:** AWS Lambda vs dedicated EC2?
   - **Decision:** Lambda (auto-scaling, pay-per-use)

2. **Audit log retention:** 90 days vs 1 year?
   - **Decision:** 90 days for FREE, 1 year for PREMIUM

3. **Rate limiting backend:** In-memory vs Redis?
   - **Decision:** Redis (shared state across instances)

4. **Encryption key rotation:** Manual vs automatic?
   - **Decision:** Manual for MVP, automatic with Vault in Phase 3

---

## Appendix: Code Review Template

```markdown
## Security Review Checklist

- [ ] **Authentication**
  - [ ] JwtAuthGuard applied?
  - [ ] Token validation tested?

- [ ] **Authorization**
  - [ ] WorkspaceAccessGuard applied?
  - [ ] IDOR prevention verified?

- [ ] **RLS**
  - [ ] New tables have policies?
  - [ ] Isolation tests added?

- [ ] **Input Validation**
  - [ ] DTOs use class-validator?
  - [ ] Query params validated?

- [ ] **SQL Safety**
  - [ ] No $queryRawUnsafe with user input?
  - [ ] Prisma used for queries?

- [ ] **Secrets**
  - [ ] No hardcoded credentials?
  - [ ] ConfigService used?

- [ ] **Error Handling**
  - [ ] No internal details leaked?
  - [ ] Uniform error responses?

- [ ] **Logging**
  - [ ] No PII logged?
  - [ ] Security events logged?

- [ ] **Tests**
  - [ ] Isolation tests added?
  - [ ] Authorization tests added?
```

---

**Last updated:** 2025-12-25
**Next review:** 2026-01-25 (monthly)
