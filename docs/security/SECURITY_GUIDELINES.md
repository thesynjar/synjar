# Security Guidelines - Synjar

**Status:** Living document
**Last updated:** 2025-12-25
**Owner:** Engineering team

---

## Overview

This document defines security requirements and best practices for Synjar development. All contributors MUST follow these guidelines.

**Core principle:** Defense in Depth - multiple security layers protect against attacks even if one layer fails.

---

## 1. Multi-Tenant Isolation

### 1.1 Row-Level Security (RLS)

**MANDATORY:** All tenant-scoped tables MUST have RLS enabled.

#### Checklist

- [ ] Table has RLS enabled: `ALTER TABLE "X" ENABLE ROW LEVEL SECURITY`
- [ ] FORCE RLS for app role: `ALTER TABLE "X" FORCE ROW LEVEL SECURITY`
- [ ] Policy created: `CREATE POLICY x_isolation ON "X" USING (...)`
- [ ] Integration test added (see section 7)

#### Example

```sql
-- Enable RLS
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" FORCE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY document_isolation ON "Document"
  FOR ALL
  USING (
    "workspaceId" IN (
      SELECT wm."workspaceId"
      FROM "WorkspaceMember" wm
      WHERE wm."userId" = current_setting('app.current_user_id', true)::UUID
    )
  );
```

### 1.2 Session Context

**MANDATORY:** Set `app.current_user_id` at the start of every authenticated request.

```typescript
// src/infrastructure/persistence/rls/rls.middleware.ts

@Injectable()
export class RlsMiddleware implements NestMiddleware {
  constructor(private prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const userId = req.user?.sub;

    if (userId) {
      await this.prisma.$executeRawUnsafe(
        `SET LOCAL app.current_user_id = '${userId}'`
      );
    }

    next();
  }
}
```

**Apply globally:**

```typescript
// src/main.ts

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(RlsMiddleware);  // Apply to all routes

  await app.listen(6200);
}
```

---

## 2. Authorization

### 2.1 Authentication Guard

**MANDATORY:** All protected endpoints MUST use `JwtAuthGuard`.

```typescript
@Controller('workspaces')
@UseGuards(JwtAuthGuard)  // Enforce authentication
export class WorkspaceController {
  // All methods require JWT
}
```

### 2.2 Workspace Access Guard

**MANDATORY:** Workspace-scoped endpoints MUST validate membership.

```typescript
@Controller('workspaces/:workspaceId')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class WorkspaceDocumentController {

  @Get('documents')
  async listDocuments(
    @Param('workspaceId') workspaceId: string,
  ) {
    // WorkspaceAccessGuard already validated membership
    return this.documentService.findAll(workspaceId);
  }
}
```

**Implementation:**

```typescript
// src/application/workspace/guards/workspace-access.guard.ts

@Injectable()
export class WorkspaceAccessGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user.sub;
    const workspaceId = request.params.workspaceId;

    const member = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId, userId },
    });

    if (!member) {
      throw new ForbiddenException('Access denied to this workspace');
    }

    return true;
  }
}
```

### 2.3 Uniform Error Responses

**MANDATORY:** Do NOT leak resource existence through different error codes.

**BAD:**

```typescript
// Leaks workspace existence
if (!workspace) {
  throw new NotFoundException('Workspace not found');
}
if (!member) {
  throw new ForbiddenException('Access denied');
}
```

**GOOD:**

```typescript
// Always returns 404 (uniform response)
const workspace = await this.findWorkspaceForUser(workspaceId, userId);
if (!workspace) {
  throw new NotFoundException('Workspace not found');
}
```

---

## 3. Input Validation

### 3.1 DTOs with class-validator

**MANDATORY:** All request DTOs MUST use `class-validator`.

```typescript
// src/interfaces/http/dto/create-document.dto.ts

import { IsString, IsOptional, MaxLength, IsEnum } from 'class-validator';

export class CreateDocumentDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(1000000)  // 1MB text limit
  content: string;

  @IsOptional()
  @IsEnum(ContentType)
  contentType?: ContentType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceDescription?: string;
}
```

### 3.2 Query Parameters

**MANDATORY:** Validate all query parameters.

```typescript
@Get('search')
async search(
  @Query('q') query: string,
  @Query('limit') limit: number = 10,
) {
  // Validate query
  if (!query || query.length < 2 || query.length > 200) {
    throw new BadRequestException('Invalid query length (2-200 chars)');
  }

  // Sanitize: allow only safe characters
  if (!/^[a-zA-Z0-9\s\-_\.]+$/.test(query)) {
    throw new BadRequestException('Query contains invalid characters');
  }

  // Validate limit
  if (limit < 1 || limit > 100) {
    throw new BadRequestException('Limit must be 1-100');
  }

  return this.searchService.search(query, limit);
}
```

### 3.3 File Uploads

**MANDATORY:** Validate file type, size, and content.

```typescript
@Post('upload')
@UseInterceptors(FileInterceptor('file'))
async uploadFile(
  @UploadedFile() file: Express.Multer.File,
  @CurrentUser() user: JwtPayload,
) {
  // Validate file exists
  if (!file) {
    throw new BadRequestException('No file uploaded');
  }

  // Validate MIME type (whitelist)
  const allowedMimeTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
  ];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    throw new BadRequestException(
      `File type not allowed. Allowed: ${allowedMimeTypes.join(', ')}`
    );
  }

  // Validate file size
  const maxSizeMb = await this.getMaxFileSize(user.sub);
  if (file.size > maxSizeMb * 1024 * 1024) {
    throw new BadRequestException(`File size exceeds ${maxSizeMb}MB limit`);
  }

  // Validate file content (magic bytes)
  const fileType = await FileType.fromBuffer(file.buffer);
  if (!fileType || !allowedMimeTypes.includes(fileType.mime)) {
    throw new BadRequestException('File content does not match extension');
  }

  return this.fileService.upload(file, user.sub);
}
```

---

## 4. SQL Injection Prevention

### 4.1 Use Prisma (Parameterized Queries)

**MANDATORY:** Always use Prisma query builder. NEVER use `$queryRawUnsafe` with user input.

**BAD:**

```typescript
// VULNERABLE TO SQL INJECTION
async search(query: string) {
  return this.prisma.$queryRawUnsafe(`
    SELECT * FROM "Document" WHERE title LIKE '%${query}%'
  `);
}
```

**GOOD:**

```typescript
// Safe: Prisma escapes automatically
async search(query: string) {
  return this.prisma.document.findMany({
    where: {
      title: {
        contains: query,
      },
    },
  });
}
```

### 4.2 Raw SQL (exceptional cases)

If raw SQL is absolutely necessary, use parameterized queries:

```typescript
// GOOD: Parameterized
async search(query: string) {
  return this.prisma.$queryRaw`
    SELECT * FROM "Document"
    WHERE title LIKE ${`%${query}%`}
  `;
}
```

**Code review:** All `$queryRaw` / `$executeRaw` usages MUST be reviewed by security team.

---

## 5. Secrets Management

### 5.1 Environment Variables

**MANDATORY:** NEVER hardcode secrets in code.

**BAD:**

```typescript
const openaiApiKey = 'sk-xxx...';  // NEVER DO THIS
```

**GOOD:**

```typescript
@Injectable()
export class OpenAIService {
  private apiKey: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }
  }
}
```

### 5.2 .env Files

**MANDATORY:**

- `.env` MUST be in `.gitignore`
- Provide `.env.example` with placeholder values
- Document all env vars in README

```bash
# .env.example (committed)

DATABASE_URL="postgresql://user:password@localhost:5432/synjar"
JWT_SECRET="your-secret-here-change-in-production"
OPENAI_API_KEY="sk-..."
BACKBLAZE_KEY_ID="..."
BACKBLAZE_APPLICATION_KEY="..."
```

### 5.3 Production Secrets

**MANDATORY:** Production secrets MUST be managed via secure vault.

**Recommended:** HashiCorp Vault, AWS Secrets Manager, or cloud provider KMS.

```typescript
// Future: Vault integration
@Injectable()
export class VaultService {
  async getSecret(path: string): Promise<string> {
    const response = await this.httpService.get(
      `${this.vaultUrl}/v1/secret/data/${path}`,
      {
        headers: {
          'X-Vault-Token': this.vaultToken,
        },
      }
    );

    return response.data.data.data.value;
  }
}
```

---

## 6. Rate Limiting

### 6.1 Global Rate Limit

**MANDATORY:** Apply rate limiting to prevent DoS.

```typescript
// src/main.ts

import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      ttl: 60,       // 60 seconds window
      limit: 100,    // max 100 requests per window
    }),
  ],
})
export class AppModule {}
```

### 6.2 Per-Endpoint Rate Limit

```typescript
@Controller('search')
export class SearchController {

  @Get()
  @Throttle(10, 60)  // 10 requests per 60 seconds
  async search(@Query('q') query: string) {
    return this.searchService.search(query);
  }
}
```

### 6.3 Per-Workspace Rate Limit (Future)

```typescript
@Injectable()
export class WorkspaceRateLimitGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const workspaceId = request.params.workspaceId;

    const usage = await this.usageService.getHourlyRequests(workspaceId);

    const limit = await this.getWorkspaceLimit(workspaceId);

    if (usage >= limit) {
      throw new TooManyRequestsException(
        `Workspace rate limit exceeded (${limit} req/hour)`
      );
    }

    return true;
  }
}
```

---

## 7. Security Testing

### 7.1 Multi-Tenant Isolation Tests

**MANDATORY:** Every workspace-scoped feature MUST have isolation test.

```typescript
// tests/security/isolation.spec.ts

describe('Workspace isolation', () => {
  let userA: User;
  let userB: User;
  let workspaceA: Workspace;
  let workspaceB: Workspace;

  beforeEach(async () => {
    userA = await createUser('a@test.com');
    userB = await createUser('b@test.com');

    workspaceA = await createWorkspace(userA, 'Workspace A');
    workspaceB = await createWorkspace(userB, 'Workspace B');
  });

  it('prevents User A from accessing User B documents', async () => {
    const docB = await createDocument(userB, workspaceB, 'Secret doc');

    const response = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceB.id}/documents/${docB.id}`)
      .set('Authorization', `Bearer ${await getToken(userA)}`);

    expect(response.status).toBe(403);
  });

  it('RLS prevents cross-tenant queries', async () => {
    await createDocument(userA, workspaceA, 'Doc A');
    await createDocument(userB, workspaceB, 'Doc B');

    // Set RLS context as User A
    await prisma.$executeRawUnsafe(
      `SET LOCAL app.current_user_id = '${userA.id}'`
    );

    const documents = await prisma.document.findMany();

    // User A should only see their own documents
    expect(documents).toHaveLength(1);
    expect(documents[0].workspaceId).toBe(workspaceA.id);
  });
});
```

### 7.2 Authorization Bypass Tests

```typescript
describe('Authorization bypass attempts', () => {
  it('prevents workspace ID manipulation in URL', async () => {
    const { userA, workspaceB } = await setupUsers();

    const response = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceB.id}/documents`)
      .set('Authorization', `Bearer ${await getToken(userA)}`)
      .send({ title: 'Hacked', content: 'test' });

    expect(response.status).toBe(403);
  });

  it('prevents document ID guessing', async () => {
    const { userA, userB } = await setupUsers();
    const docB = await createDocument(userB, 'Secret');

    const response = await request(app.getHttpServer())
      .get(`/workspaces/${userA.workspaceId}/documents/${docB.id}`)
      .set('Authorization', `Bearer ${await getToken(userA)}`);

    expect(response.status).toBe(404);  // Not 403 (uniform response)
  });
});
```

### 7.3 Input Validation Tests

```typescript
describe('Input validation', () => {
  it('rejects invalid characters in search query', async () => {
    const response = await request(app.getHttpServer())
      .get('/search?q=<script>alert(1)</script>')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
  });

  it('rejects oversized file uploads', async () => {
    const largeFile = Buffer.alloc(100 * 1024 * 1024);  // 100MB

    const response = await request(app.getHttpServer())
      .post('/workspaces/ws1/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', largeFile, 'large.pdf');

    expect(response.status).toBe(400);
  });
});
```

### 7.4 CI/CD Security Scans

**MANDATORY:** GitHub Actions MUST run security scans on every commit.

```yaml
# .github/workflows/security.yml

name: Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run npm audit
        run: pnpm audit --audit-level=high

      - name: Run Snyk test
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

  codeql:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v2
        with:
          languages: typescript

      - name: Autobuild
        uses: github/codeql-action/autobuild@v2

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v2
```

---

## 8. Logging and Monitoring

### 8.1 Security Events

**MANDATORY:** Log all security-relevant events.

```typescript
// src/infrastructure/logging/security-logger.service.ts

@Injectable()
export class SecurityLogger {
  private logger = new Logger('Security');

  logAuthSuccess(userId: string, ip: string) {
    this.logger.log({
      event: 'auth.success',
      userId,
      ip,
      timestamp: new Date(),
    });
  }

  logAuthFailure(email: string, ip: string, reason: string) {
    this.logger.warn({
      event: 'auth.failure',
      email,
      ip,
      reason,
      timestamp: new Date(),
    });
  }

  logUnauthorizedAccess(userId: string, resource: string, action: string) {
    this.logger.warn({
      event: 'authorization.denied',
      userId,
      resource,
      action,
      timestamp: new Date(),
    });
  }

  logSuspiciousActivity(userId: string, description: string, metadata?: any) {
    this.logger.error({
      event: 'suspicious.activity',
      userId,
      description,
      metadata,
      timestamp: new Date(),
    });
  }
}
```

### 8.2 PII Protection

**MANDATORY:** DO NOT log sensitive data.

**NEVER log:**
- Passwords (even hashed)
- API keys / tokens
- Credit card numbers
- Personal identifiable information (PII)

**BAD:**

```typescript
this.logger.log(`User ${user.email} logged in with password ${password}`);
```

**GOOD:**

```typescript
this.logger.log(`User ${user.id} logged in successfully`);
```

### 8.3 Error Messages

**MANDATORY:** DO NOT leak internal details in error messages.

**BAD:**

```typescript
catch (error) {
  throw new InternalServerErrorException(error.message);  // Leaks stack trace
}
```

**GOOD:**

```typescript
catch (error) {
  this.logger.error('Database query failed', error.stack);
  throw new InternalServerErrorException('An error occurred');
}
```

---

## 9. Dependency Management

### 9.1 Regular Updates

**MANDATORY:** Review and update dependencies monthly.

```bash
# Check for outdated packages
pnpm outdated

# Update dependencies
pnpm update

# Audit for vulnerabilities
pnpm audit
```

### 9.2 Vulnerability Scanning

**MANDATORY:** Use Snyk or Dependabot for automated vulnerability alerts.

```yaml
# .github/dependabot.yml

version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: weekly
    open-pull-requests-limit: 10
```

### 9.3 Lock Files

**MANDATORY:** Commit `pnpm-lock.yaml` to ensure reproducible builds.

---

## 10. Code Review Checklist

**Before merging to main, ensure:**

- [ ] **Authentication:** All protected endpoints use `JwtAuthGuard`
- [ ] **Authorization:** Workspace-scoped endpoints use `WorkspaceAccessGuard`
- [ ] **RLS:** New tables have RLS policies + tests
- [ ] **Input validation:** All DTOs use `class-validator`
- [ ] **SQL safety:** No `$queryRawUnsafe` with user input
- [ ] **Secrets:** No hardcoded credentials
- [ ] **Error messages:** No internal details leaked
- [ ] **Logging:** No PII logged
- [ ] **Tests:** Security tests added (isolation, authorization)
- [ ] **Dependencies:** No new critical vulnerabilities (`pnpm audit`)

---

## 11. Incident Response

### 11.1 Security Issue Reporting

**Internal:** `#security` Slack channel
**External:** security@synjar.com (PGP key available)

### 11.2 Severity Levels

| Level | Description | SLA |
|-------|-------------|-----|
| **Critical** | Data breach, RCE, auth bypass | Fix within 24h |
| **High** | Privilege escalation, SQL injection | Fix within 7 days |
| **Medium** | XSS, CSRF, weak crypto | Fix within 30 days |
| **Low** | Info disclosure, minor config | Next release |

### 11.3 Response Process

1. **Triage** (2h): Assess severity, assign owner
2. **Investigation** (24h): Reproduce issue, identify scope
3. **Fix** (SLA): Develop patch, test thoroughly
4. **Deploy** (urgent): Hotfix to production
5. **Disclosure** (7 days): Publish security advisory
6. **Postmortem** (14 days): Root cause analysis, prevention

---

## 12. Compliance

### 12.1 GDPR

- [ ] User data deletion endpoint
- [ ] Data export endpoint
- [ ] Consent tracking
- [ ] Privacy policy

### 12.2 SOC2 (Future)

- [ ] Audit logging
- [ ] Access control reviews
- [ ] Penetration testing (quarterly)
- [ ] Security awareness training

---

## 13. Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Multi-Tenancy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multitenant_Security_Cheat_Sheet.html)
- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [NestJS Security Best Practices](https://docs.nestjs.com/security/helmet)

---

**Questions?** Contact security team or open discussion in `#engineering`.
