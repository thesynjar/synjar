# Security Review Report - 2025-12-24

## Kontekst

- Przeanalizowane moduły: Auth, Workspace, Document, PublicLink, Search, Chunking, Infrastructure (Storage, Embeddings, LLM)
- Powiązane dokumenty: CLAUDE.md, docs/specifications/2025-12-24-knowledge-forge.md
- Typ review: Początkowy commit całego MVP (Knowledge Forge)

## Executive Summary

Przeanalizowano kod pod kątem OWASP Top 10 i standardowych zagrożeń bezpieczeństwa. Znaleziono **3 CRITICAL**, **4 HIGH**, **5 MEDIUM** i **3 LOW** podatności. Większość krytycznych problemów dotyczy SQL Injection w raw queries oraz braku rate limiting na publicznych endpointach.

---

## 🔴 CRITICAL (wymaga natychmiastowej naprawy)

### 1. SQL Injection w public-link.service.ts (linie 200, 217-233)

**Kategoria:** A03:2021 - Injection

**Opis:**
Raw SQL query używa string interpolacji dla user-controlled input (tags, workspaceId, embeddings), co prowadzi bezpośrednio do SQL Injection.

**Kod:**
```typescript
// apps/api/src/application/public-link/public-link.service.ts:200-233
const tagList = effectiveTags.map((t) => `'${t.replace(/'/g, "''")}'`).join(',');
tagFilter = `AND d.id IN (
  SELECT dt."documentId" FROM "DocumentTag" dt
  JOIN "Tag" t ON t.id = dt."tagId"
  WHERE t.name IN (${tagList})
)`;

const results = await this.prisma.$queryRawUnsafe<...>(`
  SELECT ...
  FROM "Chunk" c
  JOIN "Document" d ON d.id = c."documentId"
  WHERE d."workspaceId" = '${link.workspaceId}'
    AND d."processingStatus" = 'COMPLETED'
    AND d."verificationStatus" = 'VERIFIED'
    ${tagFilter}
  ORDER BY c.embedding <=> '${JSON.stringify(embedding)}'::vector
  LIMIT ${limit}
`);
```

**Jak naprawić:**
Użyj Prisma parameterized queries (`$queryRaw` zamiast `$queryRawUnsafe`):

```typescript
// Bezpieczna wersja
const results = await this.prisma.$queryRaw<...>`
  SELECT
    c.id as chunk_id,
    d.id as document_id,
    c.content as chunk_content,
    1 - (c.embedding <=> ${JSON.stringify(embedding)}::vector) as score,
    d.title,
    d."fileUrl" as file_url
  FROM "Chunk" c
  JOIN "Document" d ON d.id = c."documentId"
  WHERE d."workspaceId" = ${link.workspaceId}
    AND d."processingStatus" = 'COMPLETED'
    AND d."verificationStatus" = 'VERIFIED'
    ${effectiveTags && effectiveTags.length > 0
      ? Prisma.sql`AND d.id IN (
          SELECT dt."documentId" FROM "DocumentTag" dt
          JOIN "Tag" t ON t.id = dt."tagId"
          WHERE t.name = ANY(${effectiveTags})
        )`
      : Prisma.empty}
  ORDER BY c.embedding <=> ${JSON.stringify(embedding)}::vector
  LIMIT ${limit}
`;
```

---

### 2. SQL Injection w search.service.ts (linie 58-99)

**Kategoria:** A03:2021 - Injection

**Opis:**
Identyczny problem jak powyżej - `$queryRawUnsafe` z string interpolacją.

**Kod:**
```typescript
// apps/api/src/application/search/search.service.ts:58-99
const tagList = dto.tags.map((t) => `'${t.replace(/'/g, "''")}'`).join(',');
tagFilter = `AND d.id IN (
  SELECT dt."documentId" FROM "DocumentTag" dt
  JOIN "Tag" t ON t.id = dt."tagId"
  WHERE t.name IN (${tagList})
)`;

const results = await this.prisma.$queryRawUnsafe<...>(`
  SELECT ...
  WHERE d."workspaceId" = '${workspaceId}'
    AND d."processingStatus" = 'COMPLETED'
    ${tagFilter}
    ${verificationFilter}
  ORDER BY c.embedding <=> '${JSON.stringify(embedding)}'::vector
  LIMIT ${limit}
`);
```

**Jak naprawić:**
Jak w poprzednim punkcie - użyj `$queryRaw` z template literals (Prisma.sql).

---

### 3. Brak rate limiting na publicznych endpointach

**Kategoria:** A05:2021 - Security Misconfiguration

**Opis:**
Publiczne endpointy (`/public/:token`, `/public/:token/search`) nie wymagają autentykacji i nie mają rate limiting. Możliwy atak DoS, brute force tokenów, wyczerpanie OpenAI API quota.

**Pliki:**
- `apps/api/src/interfaces/http/public.controller.ts`
- `apps/api/src/application/public-link/public-link.service.ts`

**Jak naprawić:**
1. Dodaj `@nestjs/throttler`:
```bash
pnpm add @nestjs/throttler
```

2. Skonfiguruj w `app.module.ts`:
```typescript
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      ttl: 60,
      limit: 10, // 10 requests per minute
    }),
    // ...
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
```

3. Dla publicznych endpointów ustaw niższy limit:
```typescript
@ApiTags('Public API')
@Controller('public')
@Throttle(5, 60) // 5 requests per minute for public API
export class PublicController {
  // ...
}
```

---

## 🟠 HIGH (naprawić przed merge)

### 1. Słabe wymagania dotyczące hasła

**Kategoria:** A07:2021 - Identification and Authentication Failures

**Opis:**
Walidacja hasła wymaga tylko minimalnej długości 8 znaków, bez sprawdzenia złożoności (wielkie litery, cyfry, znaki specjalne).

**Kod:**
```typescript
// apps/api/src/interfaces/dto/auth.dto.ts:9-12
@ApiProperty({ example: 'password123', minLength: 8 })
@IsString()
@MinLength(8)
password: string;
```

**Jak naprawić:**
Dodaj niestandardową walidację:
```typescript
import { Matches } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    example: 'MyP@ssw0rd!',
    description: 'Password must contain at least 8 characters, including uppercase, lowercase, number and special character'
  })
  @IsString()
  @MinLength(8)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    { message: 'Password too weak' }
  )
  password: string;
}
```

---

### 2. Brak HTTP-only i Secure flag dla cookies (jeśli używane)

**Kategoria:** A05:2021 - Security Misconfiguration

**Opis:**
JWT zwracany jest w response body zamiast HttpOnly cookie, co czyni go podatnym na XSS.

**Kod:**
```typescript
// apps/api/src/application/auth/auth.service.ts:56-65
return {
  accessToken,
  user: { ... }
};
```

**Jak naprawić:**
Rozważ przekazywanie JWT przez HttpOnly cookie:
```typescript
// auth.controller.ts
@Post('login')
async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
  const result = await this.authService.login(dto);

  res.cookie('access_token', result.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  return { user: result.user };
}
```

**Alternatywa:** Jeśli pozostajesz przy Bearer token w body, upewnij się że frontend przechowuje token w memory (nie localStorage).

---

### 3. CORS włączony bez ograniczeń

**Kategoria:** A05:2021 - Security Misconfiguration

**Opis:**
CORS jest włączony globalnie bez whitelist origin.

**Kod:**
```typescript
// apps/api/src/main.ts:19
app.enableCors();
```

**Jak naprawić:**
```typescript
app.enableCors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

Dodaj do `.env.example`:
```
ALLOWED_ORIGINS="http://localhost:3000,https://yourdomain.com"
```

---

### 4. Brak validacji rozmiaru pliku na poziomie biznesowym

**Kategoria:** A04:2021 - Insecure Design

**Opis:**
Walidacja rozmiaru pliku (10MB) jest tylko na poziomie controllera (NestJS pipe), a w `document.service.ts` jest duplikowana (linia 79). Brakuje walidacji przeciwko DoS przez upload wielu małych plików.

**Kod:**
```typescript
// apps/api/src/interfaces/http/document.controller.ts:40
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// apps/api/src/application/document/document.service.ts:24
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
```

**Jak naprawić:**
1. Przenieś stałą do konfiguracji:
```typescript
// config/app.config.ts
export const APP_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024,
  MAX_FILES_PER_WORKSPACE: 1000,
  MAX_STORAGE_PER_WORKSPACE: 1024 * 1024 * 1024, // 1GB
};
```

2. Dodaj walidację w `document.service.ts`:
```typescript
async create(...) {
  // Check workspace limits
  const stats = await this.prisma.document.aggregate({
    where: { workspaceId },
    _sum: { fileSize: true },
    _count: true,
  });

  if (stats._count >= APP_CONFIG.MAX_FILES_PER_WORKSPACE) {
    throw new BadRequestException('Workspace file limit reached');
  }

  if (stats._sum.fileSize + file.size > APP_CONFIG.MAX_STORAGE_PER_WORKSPACE) {
    throw new BadRequestException('Workspace storage limit reached');
  }

  // ...
}
```

---

## 🟡 MEDIUM (naprawić w kolejnej iteracji)

### 1. Logowanie wrażliwych danych

**Kategoria:** A09:2021 - Security Logging and Monitoring Failures

**Opis:**
Używanie `console.error` i `console.log` może prowadzić do logowania wrażliwych informacji. Brak strukturalnego logowania.

**Kod:**
```typescript
// apps/api/src/application/document/document.service.ts:337
console.error('Document processing failed:', error);

// apps/api/src/application/chunking/chunking.service.ts:51
console.warn('LLM chunking failed, falling back to fixed-size:', error);
```

**Jak naprawić:**
Dodaj NestJS Logger:
```typescript
import { Logger } from '@nestjs/common';

export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  private async processDocument(documentId: string) {
    try {
      // ...
    } catch (error) {
      this.logger.error(
        `Document processing failed for document ${documentId}`,
        error instanceof Error ? error.stack : error
      );
      // NIE loguj: user data, file content, embeddings
    }
  }
}
```

---

### 2. Brak tokenów refresh dla JWT

**Kategoria:** A07:2021 - Identification and Authentication Failures

**Opis:**
JWT ma długi czas wygaśnięcia (7 dni), ale brak mechanizmu refresh token. Po skompromitowaniu tokena jest on ważny przez 7 dni.

**Kod:**
```typescript
// .env.example:6
JWT_EXPIRES_IN="7d"
```

**Jak naprawić:**
1. Zmniejsz czas życia access token:
```
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
```

2. Dodaj endpoint `/auth/refresh`:
```typescript
// auth.service.ts
async refresh(refreshToken: string) {
  try {
    const payload = this.jwtService.verify(refreshToken, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
    });

    const user = await this.validateUser(payload.sub);
    return {
      accessToken: this.generateToken(user.id, user.email),
    };
  } catch {
    throw new UnauthorizedException('Invalid refresh token');
  }
}
```

---

### 3. Brak walidacji MIME type dla uploadowanych plików

**Kategoria:** A03:2021 - Injection

**Opis:**
Walidacja MIME type polega tylko na regex w `FileTypeValidator`, który sprawdza header `Content-Type`. Atakujący może podmienić MIME type i wgrać złośliwy plik (np. PHP webshell z extension `.pdf`).

**Kod:**
```typescript
// apps/api/src/interfaces/http/document.controller.ts:76-78
new FileTypeValidator({
  fileType: /(application\/pdf|application\/vnd.openxmlformats-officedocument.wordprocessingml.document|text\/plain|text\/markdown)/,
}),
```

**Jak naprawić:**
Dodaj walidację magic bytes:
```bash
pnpm add file-type
```

```typescript
import { fileTypeFromBuffer } from 'file-type';

async create(..., file?: Express.Multer.File) {
  if (file) {
    // Validate actual file type (magic bytes)
    const detectedType = await fileTypeFromBuffer(file.buffer);

    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const allowedMimeTypes = ['application/pdf', 'text/plain'];

    if (detectedType && !allowedMimeTypes.includes(detectedType.mime)) {
      throw new BadRequestException('Invalid file type detected');
    }

    // Additional check for file extension
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (!['pdf', 'docx', 'txt', 'md'].includes(ext)) {
      throw new BadRequestException('Invalid file extension');
    }
  }

  // ...
}
```

---

### 4. Public link token używa UUID v4 zamiast cryptographically secure random

**Kategoria:** A02:2021 - Cryptographic Failures

**Opis:**
Tokeny dla public links generowane są przez Prisma `@default(uuid())`, co zwraca UUID v4. UUID v4 jest randomowy, ale nie jest zaprojektowany jako cryptographically secure token.

**Kod:**
```prisma
// apps/api/prisma/schema.prisma:154
model PublicLink {
  id          String @id @default(uuid())
  token       String @unique @default(uuid())
  // ...
}
```

**Jak naprawić:**
Generuj token w aplikacji:
```typescript
// public-link.service.ts
import { randomBytes } from 'crypto';

async create(workspaceId: string, userId: string, dto: CreatePublicLinkDto) {
  await this.workspaceService.ensureMember(workspaceId, userId);

  const token = randomBytes(32).toString('base64url'); // 256-bit entropy

  return this.prisma.publicLink.create({
    data: {
      workspaceId,
      token,
      name: dto.name,
      allowedTags: dto.allowedTags || [],
      expiresAt: dto.expiresAt,
    },
  });
}
```

Usuń `@default(uuid())` z Prisma schema dla `token`.

---

### 5. Brak walidacji expiresAt dla public links

**Kategoria:** A04:2021 - Insecure Design

**Opis:**
Nie ma walidacji czy `expiresAt` jest w przyszłości. User może ustawić datę w przeszłości lub bardzo dalekiej przyszłości.

**Kod:**
```typescript
// apps/api/src/application/public-link/public-link.service.ts:36-46
async create(workspaceId: string, userId: string, dto: CreatePublicLinkDto) {
  return this.prisma.publicLink.create({
    data: {
      workspaceId,
      name: dto.name,
      allowedTags: dto.allowedTags || [],
      expiresAt: dto.expiresAt, // No validation!
    },
  });
}
```

**Jak naprawić:**
```typescript
// dto/public-link.dto.ts
import { IsDate, MinDate } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePublicLinkDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @MinDate(new Date(), { message: 'expiresAt must be in the future' })
  expiresAt?: Date;

  // ...
}

// public-link.service.ts
async create(..., dto: CreatePublicLinkDto) {
  // Additional business logic validation
  if (dto.expiresAt) {
    const maxExpiry = new Date();
    maxExpiry.setFullYear(maxExpiry.getFullYear() + 1); // Max 1 year

    if (dto.expiresAt > maxExpiry) {
      throw new BadRequestException('expiresAt cannot be more than 1 year in the future');
    }
  }

  // ...
}
```

---

## 🟢 LOW (rekomendacja)

### 1. Brak helmet.js dla security headers

**Kategoria:** A05:2021 - Security Misconfiguration

**Opis:**
Aplikacja nie używa `helmet.js` do ustawienia security headers (CSP, X-Frame-Options, X-Content-Type-Options, etc.).

**Jak naprawić:**
```bash
pnpm add helmet
```

```typescript
// main.ts
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  }));

  // ...
}
```

---

### 2. Docker secrets w environment variables

**Kategoria:** A05:2021 - Security Misconfiguration

**Opis:**
Sekrety są przekazywane przez environment variables w docker-compose.yml. Lepiej użyć Docker secrets lub zewnętrznego vault.

**Kod:**
```yaml
# docker-compose.yml:26-37
environment:
  DATABASE_URL: postgresql://postgres:postgres@postgres:5432/knowledge_forge?schema=public
  JWT_SECRET: ${JWT_SECRET}
  OPENAI_API_KEY: ${OPENAI_API_KEY}
```

**Jak naprawić:**
W produkcji użyj Docker secrets:
```yaml
services:
  api:
    secrets:
      - jwt_secret
      - openai_api_key
    environment:
      JWT_SECRET_FILE: /run/secrets/jwt_secret
      OPENAI_API_KEY_FILE: /run/secrets/openai_api_key

secrets:
  jwt_secret:
    external: true
  openai_api_key:
    external: true
```

```typescript
// config.service helper
function getSecretOrEnv(key: string): string {
  const fileKey = `${key}_FILE`;
  const filePath = process.env[fileKey];

  if (filePath && fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8').trim();
  }

  return process.env[key];
}
```

---

### 3. Brak audit log dla krytycznych operacji

**Kategoria:** A09:2021 - Security Logging and Monitoring Failures

**Opis:**
Brak logowania krytycznych operacji: tworzenie/usuwanie workspace, dodawanie członków, tworzenie public links, usuwanie dokumentów.

**Jak naprawić:**
Dodaj audit log:
```prisma
model AuditLog {
  id        String   @id @default(uuid())
  userId    String?
  action    String   // "workspace.created", "member.added", "publiclink.created"
  resource  String   // "workspace", "document", "publiclink"
  resourceId String?
  metadata  Json?
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now()) @db.Timestamptz

  @@index([userId])
  @@index([action])
  @@index([createdAt])
}
```

```typescript
// audit.service.ts
async log(action: string, userId: string, resource: string, resourceId: string, metadata?: any) {
  await this.prisma.auditLog.create({
    data: { action, userId, resource, resourceId, metadata },
  });
}
```

Integruj w serwisach:
```typescript
async delete(workspaceId: string, userId: string) {
  await this.ensureOwner(workspaceId, userId);
  await this.prisma.workspace.delete({ where: { id: workspaceId } });

  await this.auditService.log('workspace.deleted', userId, 'workspace', workspaceId);
}
```

---

## ✅ Pozytywne aspekty

1. **Dobra separacja warstw** - Clean Architecture zapewnia izolację domeny od infrastruktury
2. **Używanie Prisma ORM** - w większości miejsc zapobiega SQL Injection (poza raw queries)
3. **Walidacja input** - używanie `class-validator` w DTO
4. **JWT strategy** - poprawna implementacja Passport JWT
5. **Bcrypt dla haseł** - używanie bcrypt z odpowiednim salt rounds (10)
6. **Cascade delete** - Prisma zapewnia integralność danych (onDelete: Cascade)
7. **Timestamptz** - wszystkie timestampy używają timezone-aware typu
8. **Indeksy bazodanowe** - odpowiednie indeksy na foreign keys i często używanych polach
9. **Secrets w .gitignore** - `.env` i `.env.seed` są ignorowane przez git
10. **File size validation** - walidacja rozmiaru pliku przed uploadem

---

## Podsumowanie

### Statystyki
- 🔴 CRITICAL: 3
- 🟠 HIGH: 4
- 🟡 MEDIUM: 5
- 🟢 LOW: 3

### Priorytet napraw (przed merge)
1. **SQL Injection** (CRITICAL #1, #2) - natychmiast
2. **Rate limiting** (CRITICAL #3) - przed deployem do produkcji
3. **Silniejsze hasła** (HIGH #1) - przed otwarciem rejestracji
4. **CORS whitelist** (HIGH #3) - przed deployem do produkcji

### Rekomendacje długoterminowe
- Dodać penetration testing przed wejściem na produkcję
- Wdrożyć SIEM/monitoring (np. Sentry, DataDog)
- Rozważyć zewnętrzny audit security przed public launch
- Dodać automated security scanning w CI/CD (npm audit, Snyk, OWASP Dependency Check)

---

**Przygotował:** Claude Opus 4.5 (Security Reviewer Agent)
**Data:** 2025-12-24
**Commit:** Initial MVP review (staged files)
