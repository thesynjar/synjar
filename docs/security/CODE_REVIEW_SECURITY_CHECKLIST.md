# Security Code Review Checklist

**Purpose:** Mandatory security review dla wszystkich pull requests
**Owner:** Engineering team
**Updated:** 2025-12-25

---

## How to Use

1. Przed merge do `main`, reviewer wykonuje ten checklist
2. Wszystkie punkty MUSZĄ być zaznaczone (checked)
3. Jeśli jakiś punkt nie ma zastosowania, napisz "N/A" + uzasadnienie
4. W razie wątpliwości, oznacz `security` label i zapytaj security champion

---

## 1. Authentication & Authorization

### 1.1 Authentication

- [ ] **Wszystkie protected endpoints używają `@UseGuards(JwtAuthGuard)`**
  - Check: Czy każdy controller ma guard?
  - Exception: Public endpoints (explicitly documented)

- [ ] **JWT token jest poprawnie walidowany**
  - Check: Passport strategy weryfikuje signature
  - Check: Token expiration jest sprawdzany
  - Check: Refresh token flow jest secure (if implemented)

- [ ] **Sensitive operations wymagają re-authentication** (if applicable)
  - Example: Zmiana passwordu, usunięcie workspace'a
  - Check: User musi potwierdzić password

### 1.2 Authorization

- [ ] **Workspace-scoped endpoints używają `WorkspaceAccessGuard`**
  - Check: Controller sprawdza membership
  - Pattern: `/workspaces/:workspaceId/*` → guard required

- [ ] **Role-based access control (RBAC) jest enforced** (if applicable)
  - Check: OWNER vs MEMBER permissions
  - Example: Tylko OWNER może delete workspace

- [ ] **Uniform error responses (nie leakują resource existence)**
  - BAD: 403 Forbidden (ujawnia że workspace istnieje)
  - GOOD: 404 Not Found (uniform response)

**Example pass:**

```typescript
@Controller('workspaces/:workspaceId')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)  ✅
export class WorkspaceController {
  @Delete()
  async delete(@Param('workspaceId') id: string) {
    // Guard already validated membership
    return this.service.delete(id);
  }
}
```

**Example fail:**

```typescript
@Controller('workspaces/:workspaceId')
@UseGuards(JwtAuthGuard)  ❌ Missing WorkspaceAccessGuard
export class WorkspaceController {
  @Delete()
  async delete(@Param('workspaceId') id: string) {
    // No membership check - IDOR vulnerability!
    return this.service.delete(id);
  }
}
```

---

## 2. Multi-Tenant Isolation (RLS)

### 2.1 RLS Policies

- [ ] **Nowe tenant-scoped tables mają RLS enabled**
  - Check: `ALTER TABLE "X" ENABLE ROW LEVEL SECURITY`
  - Check: `ALTER TABLE "X" FORCE ROW LEVEL SECURITY`
  - Check: Policy created with `get_user_workspace_ids()`

- [ ] **Migracja SQL jest reviewed**
  - Check: Policy logic poprawna (nie za szeroka, nie za wąska)
  - Check: Performance: indeksy na `workspaceId`, `userId`

**Example:**

```sql
-- ✅ GOOD
CREATE POLICY document_isolation ON "Document"
  FOR ALL
  USING (
    "workspaceId" IN (SELECT get_user_workspace_ids())
  );

-- ❌ BAD (brak RLS)
-- No policy = anyone can see all documents!
```

### 2.2 RLS Testing

- [ ] **Integration test dla cross-tenant isolation**
  - Test: User A nie widzi resources User B
  - Test: RLS blokuje nawet przy SQL injection

**Example test:**

```typescript
it('prevents cross-tenant access', async () => {
  const docB = await createDocument(userB, 'Secret');

  // Set RLS context as User A
  await prisma.$executeRawUnsafe(
    `SET LOCAL app.current_user_id = '${userA.id}'`
  );

  const result = await prisma.document.findUnique({
    where: { id: docB.id },
  });

  expect(result).toBeNull();  ✅ RLS blocked access
});
```

---

## 3. Input Validation

### 3.1 DTOs

- [ ] **Wszystkie request body/query używają DTOs z `class-validator`**
  - Check: `@IsString()`, `@IsInt()`, `@MaxLength()`, etc.
  - Check: `whitelist: true` w ValidationPipe (strip unknown props)

**Example pass:**

```typescript
// ✅ GOOD
export class CreateDocumentDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(1000000)
  content: string;

  @IsOptional()
  @IsEnum(ContentType)
  contentType?: ContentType;
}
```

**Example fail:**

```typescript
// ❌ BAD (brak validation)
export class CreateDocumentDto {
  title: string;  // Any string, unlimited length!
  content: string;
}
```

### 3.2 Special Characters

- [ ] **Search queries są sanityzowane**
  - Check: Whitelist allowed characters: `[a-zA-Z0-9\s\-_\.]`
  - Check: Reject SQL/XSS payloads

**Example:**

```typescript
@Get('search')
async search(@Query('q') query: string) {
  if (!/^[a-zA-Z0-9\s\-_\.]+$/.test(query)) {
    throw new BadRequestException('Invalid characters in query');
  }
  // ...
}
```

### 3.3 File Uploads

- [ ] **MIME type whitelist enforced**
  - Check: `allowedMimeTypes` array
  - Check: Magic bytes verification (nie tylko extension)

- [ ] **File size limit enforced**
  - Check: Per-plan limit (FREE: 50MB, PRO: 200MB)
  - Check: Validation przed upload do B2

**Example:**

```typescript
@Post('upload')
async upload(@UploadedFile() file: Express.Multer.File) {
  const allowed = ['application/pdf', 'text/plain'];

  if (!allowed.includes(file.mimetype)) {
    throw new BadRequestException('File type not allowed');
  }

  const fileType = await FileType.fromBuffer(file.buffer);
  if (fileType?.mime !== file.mimetype) {
    throw new BadRequestException('File content mismatch');
  }
  // ...
}
```

---

## 4. SQL Injection Prevention

### 4.1 Prisma Usage

- [ ] **Wszystkie queries używają Prisma query builder** (nie raw SQL)
  - Preferred: `prisma.document.findMany({ where: { ... } })`
  - Avoid: `$queryRawUnsafe` z user input

- [ ] **Jeśli raw SQL, to TYLKO z parametryzacją**
  - Check: Tagged template literals `$queryRaw\`...\``
  - Never: String interpolation `$queryRawUnsafe(\`... ${userInput} ...\`)`

**Example pass:**

```typescript
// ✅ GOOD
async search(query: string) {
  return this.prisma.document.findMany({
    where: {
      title: { contains: query },  // Prisma escapes
    },
  });
}
```

**Example fail:**

```typescript
// ❌ BAD (SQL injection!)
async search(query: string) {
  return this.prisma.$queryRawUnsafe(`
    SELECT * FROM "Document" WHERE title LIKE '%${query}%'
  `);
}
```

### 4.2 Dynamic Queries

- [ ] **Dynamic `where` conditions są bezpieczne**
  - Check: Nie concatenate strings
  - Use: Prisma conditional builders

**Example:**

```typescript
// ✅ GOOD
const where: Prisma.DocumentWhereInput = {
  workspaceId,
};

if (filters.verified) {
  where.verificationStatus = 'VERIFIED';
}

return this.prisma.document.findMany({ where });
```

---

## 5. Secrets Management

### 5.1 Hardcoded Secrets

- [ ] **Zero hardcoded secrets w kodzie**
  - Check: Grep przez kod: `password`, `secret`, `api_key`, `token`
  - Example: `const apiKey = "sk-xxx"` ❌

- [ ] **Wszystkie secrets z `ConfigService` / env vars**
  - Check: `this.configService.get('OPENAI_API_KEY')`
  - Check: Brak defaultów dla production secrets

**Example pass:**

```typescript
// ✅ GOOD
@Injectable()
export class OpenAIService {
  private apiKey: string;

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }
  }
}
```

**Example fail:**

```typescript
// ❌ BAD
const OPENAI_API_KEY = 'sk-proj-abc123...';  // Hardcoded!
```

### 5.2 Env Files

- [ ] **`.env` jest w `.gitignore`**
- [ ] **`.env.example` jest up-to-date** (placeholder values tylko)

---

## 6. Error Handling & Logging

### 6.1 Error Messages

- [ ] **Error messages nie leakają internal details**
  - BAD: `Database connection failed: host 10.0.1.5 unreachable`
  - GOOD: `An error occurred. Please try again.`

**Example:**

```typescript
// ✅ GOOD
catch (error) {
  this.logger.error('DB query failed', error.stack);
  throw new InternalServerErrorException('An error occurred');
}

// ❌ BAD
catch (error) {
  throw new InternalServerErrorException(error.message);  // Leaks!
}
```

### 6.2 Logging

- [ ] **PII nie jest logowane**
  - Never log: passwords, tokens, credit cards, SSN
  - OK to log: userId, workspaceId, timestamp

- [ ] **Security events są logowane**
  - Example: Auth failures, unauthorized access, rate limit hits

**Example:**

```typescript
// ✅ GOOD
this.logger.log(`User ${userId} logged in successfully`);

// ❌ BAD
this.logger.log(`User ${email} logged in with password ${password}`);
```

---

## 7. Rate Limiting & DoS Protection

### 7.1 Rate Limiting

- [ ] **Expensive operations mają rate limiting**
  - Example: Search, file upload, AI processing
  - Check: `@Throttle(limit, ttl)` decorator

**Example:**

```typescript
@Get('search')
@Throttle(10, 60)  // 10 req/min
async search(@Query('q') query: string) {
  // Expensive vector similarity search
}
```

### 7.2 Request Size Limits

- [ ] **Request body size jest ograniczony**
  - Check: NestJS `body-parser` limit config
  - Default: 1MB dla JSON, configurable dla file uploads

---

## 8. Dependencies & Packages

### 8.1 New Dependencies

- [ ] **Nowe dependencies są reviewed**
  - Check: npm downloads, GitHub stars, last update
  - Check: Known vulnerabilities (npm audit, Snyk)

- [ ] **License jest compatible** (MIT, Apache 2.0, BSD)
  - Avoid: GPL, AGPL (viral licenses)

### 8.2 Audit

- [ ] **`pnpm audit` nie pokazuje HIGH/CRITICAL**
  - Check: Przed merge, run `pnpm audit --audit-level=high`
  - Fix: Update lub find alternative

---

## 9. Tests

### 9.1 Security Tests

- [ ] **Integration tests dla isolation**
  - Test: Cross-tenant access prevention
  - Test: RLS enforcement

- [ ] **Unit tests dla guards**
  - Test: JwtAuthGuard rejects invalid token
  - Test: WorkspaceAccessGuard rejects non-member

- [ ] **E2E tests dla critical flows**
  - Test: Auth flow (register, login, refresh)
  - Test: Workspace creation (limit enforcement)

**Minimum coverage:** 80% overall, 100% dla security-critical code (guards, RLS, auth).

---

## 10. Specific Vulnerability Checks

### 10.1 OWASP Top 10

- [ ] **A01: Broken Access Control**
  - IDOR prevention: Guards enforced
  - Path traversal: Input validation

- [ ] **A02: Cryptographic Failures**
  - Passwords hashed (bcrypt, scrypt)
  - HTTPS enforced (production)
  - Sensitive data encrypted (if stored)

- [ ] **A03: Injection**
  - SQL injection: Prisma / parameterized queries
  - XSS: Input sanitization (DTOs)
  - Command injection: Avoid `exec()` with user input

- [ ] **A04: Insecure Design**
  - RLS jako Defense in Depth
  - Principle of least privilege

- [ ] **A05: Security Misconfiguration**
  - Debug mode OFF (production)
  - Error stack traces hidden (production)
  - Default credentials changed

- [ ] **A06: Vulnerable Components**
  - Dependencies up-to-date
  - No HIGH/CRITICAL vulns (npm audit)

- [ ] **A07: Authentication Failures**
  - JWT properly validated
  - Rate limiting on auth endpoints

- [ ] **A08: Data Integrity Failures**
  - File upload validation (magic bytes)
  - Checksum verification (if applicable)

- [ ] **A09: Logging Failures**
  - Security events logged
  - Log rotation configured
  - No PII in logs

- [ ] **A10: SSRF** (Server-Side Request Forgery)
  - User-provided URLs validated (whitelist)
  - Internal IPs blocked (10.x, 192.168.x, 127.x)

---

## 11. Frontend Security (if applicable)

### 11.1 XSS Prevention

- [ ] **User input jest sanityzowany przed render**
  - Use: React (auto-escapes), DOMPurify (dla raw HTML)
  - Never: `dangerouslySetInnerHTML` z user input

### 11.2 CSRF Protection

- [ ] **State-changing requests mają CSRF token**
  - Check: NestJS CSRF middleware (if applicable)
  - Check: SameSite cookies

---

## PR Checklist Summary

Przed approve PR, upewnij się że:

- [ ] Wszystkie security checks są ✅
- [ ] Testy security przechodzą (isolation, guards, input validation)
- [ ] `pnpm audit` nie pokazuje HIGH/CRITICAL
- [ ] Code review notes są addressed
- [ ] Dokumentacja security jest updated (jeśli nowa funkcjonalność)

---

## Red Flags (Automatic REJECT)

Jeśli którykolwiek z tych występuje, **natychmiastowy REJECT**:

1. **Hardcoded secrets** w kodzie
2. **`$queryRawUnsafe` z user input** bez parameterization
3. **Brak guards** na protected endpoints
4. **RLS disabled** na tenant table (bez uzasadnienia)
5. **Credentials w git history** (trzeba rewrite history)
6. **CRITICAL vulnerabilities** w `pnpm audit`

---

## Examples of Past Vulnerabilities (Lessons Learned)

### Example 1: IDOR w Document Access

**Vulnerable code:**

```typescript
@Get('documents/:id')
async getDocument(@Param('id') id: string) {
  return this.prisma.document.findUnique({ where: { id } });
}
```

**Issue:** Brak workspace membership check.

**Fix:**

```typescript
@Get('workspaces/:workspaceId/documents/:id')
@UseGuards(WorkspaceAccessGuard)
async getDocument(
  @Param('workspaceId') workspaceId: string,
  @Param('id') id: string,
) {
  return this.prisma.document.findFirst({
    where: { id, workspaceId },
  });
}
```

---

### Example 2: SQL Injection w Search

**Vulnerable code:**

```typescript
async search(query: string) {
  return this.prisma.$queryRawUnsafe(`
    SELECT * FROM "Document" WHERE title LIKE '%${query}%'
  `);
}
```

**Exploit:** `query = "' OR 1=1 --"` returns all documents.

**Fix:**

```typescript
async search(query: string) {
  return this.prisma.document.findMany({
    where: { title: { contains: query } },
  });
}
```

---

### Example 3: Tenant Enumeration

**Vulnerable code:**

```typescript
const workspace = await this.findById(id);
if (!workspace) {
  throw new NotFoundException('Workspace not found');
}

const member = await this.checkMembership(workspace.id, userId);
if (!member) {
  throw new ForbiddenException('Access denied');  ❌ Leaks existence
}
```

**Issue:** Różne error codes ujawniają czy workspace istnieje.

**Fix:**

```typescript
const workspace = await this.findForUser(id, userId);
if (!workspace) {
  throw new NotFoundException('Workspace not found');  ✅ Uniform
}
```

---

## Contact

**Questions?** Tag `@security-champion` w PR comments.

**Report vulnerability:** security@synjar.com (confidential).

---

**Last updated:** 2025-12-25
**Next review:** Monthly (1st of each month)
