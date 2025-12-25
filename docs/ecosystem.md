# Synjar - System Ecosystem

## Overview

Synjar to multi-tenant RAG (Retrieval Augmented Generation) system do zarządzania bazą wiedzy. System wykorzystuje Clean Architecture z integracją Row Level Security (RLS) na poziomie bazy danych, zapewniając izolację danych między workspace'ami.

### Kluczowe cechy

- **Multi-tenancy**: Workspace-based isolation z PostgreSQL RLS
- **Semantic Search**: RAG wykorzystujący OpenAI embeddings + pgvector
- **Security-first**: Defense in depth (kod + baza danych)
- **Clean Architecture**: DDD, SOLID, Dependency Injection
- **Type-safe**: TypeScript + Prisma ORM

---

## Bounded Contexts

System składa się z 5 głównych Bounded Contexts:

```
┌──────────────────────────────────────────────────────────────────┐
│                         SYNJAR SYSTEM                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────┐  ┌──────────────────┐  ┌─────────────────┐ │
│  │  Auth Context  │  │ Workspace Context│  │Document Context │ │
│  ├────────────────┤  ├──────────────────┤  ├─────────────────┤ │
│  │ - User         │  │ - Workspace      │  │ - Document      │ │
│  │ - Session      │  │ - WorkspaceMember│  │ - Chunk         │ │
│  │ - JWT          │  │ - Role           │  │ - Tag           │ │
│  └────────────────┘  └──────────────────┘  │ - DocumentTag   │ │
│                                             └─────────────────┘ │
│                                                                   │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐ │
│  │  Public API Context │  │   Tenant Lookup Context          │ │
│  ├─────────────────────┤  ├──────────────────────────────────┤ │
│  │ - PublicLink        │  │ - TenantUserEmailLookup          │ │
│  │ - Token validation  │  │ - Email hashing                  │ │
│  │ - RLS bypass        │  │ - Workspace discovery            │ │
│  └─────────────────────┘  └──────────────────────────────────┘ │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Auth Context

**Odpowiedzialność**: Autentykacja i autoryzacja użytkowników

**Entities**:
- `User` - użytkownik systemu (email, password hash)
- `Session` - JWT-based session management

**Use Cases**:
- Rejestracja użytkownika
- Login (JWT token generation)
- Token validation

**Infrastructure**:
- `JwtStrategy` - Passport.js JWT authentication
- `BcryptService` - password hashing

### Workspace Context

**Odpowiedzialność**: Multi-tenancy, workspace management, access control

**Entities**:
- `Workspace` - logiczny kontener dla dokumentów (tenant)
- `WorkspaceMember` - relacja User ↔ Workspace z rolą
- `Role` - OWNER | MEMBER

**Use Cases**:
- Create workspace (auto-add creator as OWNER)
- Add/remove members
- List user's workspaces
- Change member role

**Infrastructure**:
- `WorkspaceRepository` - persistence
- `WorkspaceService` - domain logic

**Invariants**:
- Workspace musi mieć co najmniej jednego OWNER
- Creator workspace'a automatycznie staje się OWNER
- RLS enforcement: user widzi tylko workspace'y, których jest członkiem

### Document Context

**Odpowiedzialność**: Zarządzanie dokumentami, chunking, tagging

**Entities**:
- `Document` - dokument tekstowy lub plik
- `Chunk` - fragment dokumentu z embedding (vector)
- `Tag` - globalna etykieta (współdzielona między workspace'ami)
- `DocumentTag` - relacja Document ↔ Tag

**Use Cases**:
- Upload document (text lub file)
- Process document (chunking + embeddings)
- Tag documents
- Search by tags

**Infrastructure**:
- `DocumentRepository` - persistence
- `EmbeddingsService` - OpenAI API integration
- `StorageService` - Backblaze B2 file storage

**Invariants**:
- Document należy do dokładnie jednego Workspace
- Chunk należy do dokładnie jednego Document
- RLS enforcement: user widzi tylko dokumenty ze swoich workspace'ów

### Public API Context

**Odpowiedzialność**: Public access do workspace'ów przez token

**Entities**:
- `PublicLink` - token-based access do workspace
- `Token` - unikalny UUID dla public link

**Use Cases**:
- Create public link (z opcjonalnymi ograniczeniami: tags, expiry)
- Semantic search przez public link
- Revoke public link

**Infrastructure**:
- `PublicController` - HTTP endpoints
- `PrismaService.withoutRls()` - bypass RLS dla validated tokens

**Security**:
- Token validation PRZED bypass RLS
- Optional tag filtering (tylko dokumenty z określonymi tagami)
- Optional expiry date
- isActive flag (soft delete)

### Tenant Lookup Context

**Odpowiedzialność**: Lookup workspace'ów użytkownika przez email (hashed)

**Entities**:
- `TenantUserEmailLookup` - hashed email → workspaceId mapping

**Use Cases**:
- Find workspaces by user email (dla invite flow)
- Sync lookup entries on workspace membership changes

**Infrastructure**:
- `TenantLookupService` - domain logic
- `CryptoService` - SHA-256 email hashing

**Privacy**:
- Email przechowywany jako SHA-256 hash (irreversible)
- Lookup możliwy tylko jeśli znasz exact email
- RLS enforcement: user widzi tylko entries swoich workspace'ów

---

## Data Flow

### 1. HTTP Request Flow (Authenticated)

```
┌────────────┐   JWT    ┌──────────────┐
│   Client   │─────────>│ JwtAuthGuard │
└────────────┘          └──────┬───────┘
                               │ validate JWT
                               │ attach user to request
                               v
                        ┌──────────────┐
                        │ RlsMiddleware│
                        └──────┬───────┘
                               │ extract user.sub
                               │ UserContext.setUserId()
                               v
                        ┌──────────────┐
                        │  Controller  │
                        └──────┬───────┘
                               │ call service
                               v
                        ┌──────────────────┐
                        │  Service/UseCase │
                        └──────┬───────────┘
                               │ prisma.withCurrentUser()
                               v
                        ┌──────────────────┐
                        │  PrismaService   │
                        └──────┬───────────┘
                               │ SET LOCAL app.current_user_id = 'userId'
                               │ execute queries
                               v
                        ┌──────────────────┐
                        │   PostgreSQL     │
                        │   + RLS policies │
                        └──────────────────┘
                               │ USING (workspaceId IN (SELECT ...))
                               │ filter results by user's workspaces
                               v
                        [ Only user's data returned ]
```

### 2. Background Job Flow

```
┌───────────────┐
│ Scheduled Job │
└───────┬───────┘
        │ forUser(userId)
        v
┌──────────────────┐
│  PrismaService   │
│  forUser(userId, │
│    callback)     │
└───────┬──────────┘
        │ SET LOCAL app.current_user_id = 'userId'
        │ execute callback
        v
┌──────────────────┐
│   PostgreSQL     │
│   + RLS policies │
└──────────────────┘
        │ filter by userId's workspaces
        v
[ Scoped to specific user ]
```

### 3. Public API Flow (RLS Bypass)

```
┌────────────┐  token   ┌──────────────────┐
│   Client   │─────────>│ PublicController │
└────────────┘          └────────┬─────────┘
                                 │ validate token
                                 │ find PublicLink
                                 v
                        ┌────────────────────┐
                        │ withoutRls() check │
                        │ - valid token?     │
                        │ - not expired?     │
                        │ - isActive?        │
                        └────────┬───────────┘
                                 │ if valid:
                                 │ prisma.withoutRls()
                                 v
                        ┌──────────────────┐
                        │  PrismaService   │
                        │  withoutRls()    │
                        └────────┬─────────┘
                                 │ SET LOCAL app.current_user_id = 'SYSTEM'
                                 │ execute queries
                                 v
                        ┌──────────────────┐
                        │   PostgreSQL     │
                        │   RLS bypassed   │
                        └────────┬─────────┘
                                 │ USING (current_setting(...) = 'SYSTEM')
                                 │ returns all rows
                                 v
                        [ Apply filters in code ]
                                 │ workspaceId = publicLink.workspaceId
                                 │ optional: filter by allowedTags
                                 v
                        [ Return filtered data ]
```

---

## RLS Architecture

### Czym jest Row Level Security (RLS)?

PostgreSQL Row Level Security to mechanizm bazy danych, który automatycznie filtruje wyniki zapytań na podstawie polityk bezpieczeństwa. W Synjar RLS zapewnia, że:

1. User widzi **tylko** dokumenty ze swoich workspace'ów
2. Nawet jeśli kod aplikacji ma bug, baza danych **nie zwróci** obcych danych
3. Defense in depth - druga warstwa zabezpieczeń

### Implementacja RLS

#### 1. Database Setup

**Database Users**:
```
postgres (superuser)
├─ Użycie: migrations only
├─ Charakterystyka: bypasses RLS (zawsze!)
└─ Connection: DATABASE_URL_MIGRATE

synjar_app (non-superuser)
├─ Użycie: application runtime
├─ Charakterystyka: RLS enforced
└─ Connection: DATABASE_URL
```

**RLS Policies** (dla każdej tabeli):
```sql
-- Enable RLS
ALTER TABLE "Workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Workspace" FORCE ROW LEVEL SECURITY; -- enforce even for table owner

-- SELECT policy
CREATE POLICY workspace_select ON "Workspace"
  FOR SELECT
  TO PUBLIC
  USING (id IN (SELECT * FROM get_user_workspace_ids()));

-- INSERT policy (createdById pattern)
CREATE POLICY workspace_insert ON "Workspace"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ("createdById" = get_current_user_id());

-- UPDATE policy
CREATE POLICY workspace_update ON "Workspace"
  FOR UPDATE
  TO PUBLIC
  USING (id IN (SELECT * FROM get_user_workspace_ids()))
  WITH CHECK (id IN (SELECT * FROM get_user_workspace_ids()));

-- DELETE policy
CREATE POLICY workspace_delete ON "Workspace"
  FOR DELETE
  TO PUBLIC
  USING (id IN (SELECT * FROM get_user_workspace_ids()));
```

**Helper Functions**:
```sql
-- Get current user ID from session variable
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_user_id', true), '')::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get workspace IDs accessible to current user
CREATE OR REPLACE FUNCTION get_user_workspace_ids()
RETURNS SETOF UUID AS $$
DECLARE
  v_current_user_id UUID;
BEGIN
  v_current_user_id := get_current_user_id();

  -- SYSTEM bypass
  IF current_setting('app.current_user_id', true) = 'SYSTEM' THEN
    RETURN QUERY SELECT id FROM "Workspace";
    RETURN;
  END IF;

  -- Regular user - return only their workspaces
  IF v_current_user_id IS NOT NULL THEN
    RETURN QUERY
      SELECT wm."workspaceId"
      FROM "WorkspaceMember" wm
      WHERE wm."userId" = v_current_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

#### 2. User Context (AsyncLocalStorage)

```typescript
// apps/api/src/infrastructure/persistence/rls/user.context.ts

@Injectable()
export class UserContext {
  private readonly storage = new AsyncLocalStorage<{ userId: string }>();

  // Set user ID for current request (called by RlsMiddleware)
  setUserId(userId: string): void {
    this.storage.enterWith({ userId });
  }

  // Get current user ID (used by PrismaService.withCurrentUser)
  getCurrentUserId(): string {
    const store = this.storage.getStore();
    if (!store?.userId) {
      throw new Error('User context not set');
    }
    return store.userId;
  }

  // Execute callback with specific user context (for background jobs)
  async runWithUser<T>(userId: string, callback: () => Promise<T>): Promise<T> {
    return this.storage.run({ userId }, callback);
  }
}
```

**AsyncLocalStorage** zapewnia izolację requestów - każdy HTTP request ma swój własny context, nawet przy concurrent requests.

#### 3. RlsMiddleware

```typescript
// apps/api/src/infrastructure/persistence/rls/rls.middleware.ts

@Injectable()
export class RlsMiddleware implements NestMiddleware {
  constructor(private readonly userContext: UserContext) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const user = req.user as JwtPayload | undefined;

    // After JwtAuthGuard, user is attached to request
    if (user?.sub) {
      this.userContext.setUserId(user.sub); // Set for current request
    }

    next();
  }
}
```

**Middleware order**:
1. JwtAuthGuard validates token → attaches `user` to request
2. RlsMiddleware extracts `user.sub` → sets in AsyncLocalStorage
3. Controller/Service może używać `prisma.withCurrentUser()`

#### 4. PrismaService Methods

```typescript
// apps/api/src/infrastructure/persistence/prisma/prisma.service.ts

@Injectable()
export class PrismaService extends PrismaClient {
  constructor(private readonly userContext: UserContext) {
    super();
  }

  /**
   * Execute with explicit user context (for background jobs)
   */
  async forUser<T>(
    userId: string,
    callback: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      // Set user ID in database session
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}::text, true)`;
      return callback(tx);
    });
  }

  /**
   * Execute with current request's user (from UserContext)
   */
  async withCurrentUser<T>(
    callback: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    const userId = this.userContext.getCurrentUserId();
    return this.forUser(userId, callback);
  }

  /**
   * DANGEROUS: Bypass RLS (tylko dla Public API z token validation!)
   */
  async withoutRls<T>(
    callback: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      // Set SYSTEM context - bypasses all RLS policies
      await tx.$executeRaw`SELECT set_config('app.current_user_id', 'SYSTEM', true)`;
      return callback(tx);
    });
  }
}
```

### RLS Usage Patterns

#### Pattern 1: HTTP Request Handler

```typescript
// In WorkspaceService
async findAllForUser(): Promise<Workspace[]> {
  // UserContext already set by RlsMiddleware
  return this.prisma.withCurrentUser(async (tx) => {
    // RLS automatically filters by user's workspaces
    return tx.workspace.findMany({
      include: { members: true }
    });
  });
}
```

#### Pattern 2: Background Job

```typescript
// In scheduled task
async processUserDocuments(userId: string) {
  await this.prisma.forUser(userId, async (tx) => {
    const documents = await tx.document.findMany({
      where: { processingStatus: 'PENDING' }
    });
    // Only documents from userId's workspaces

    for (const doc of documents) {
      await this.processDocument(doc);
    }
  });
}
```

#### Pattern 3: Public API (with validation)

```typescript
// In PublicController
async search(token: string, query: string) {
  // 1. Validate token FIRST
  const publicLink = await this.validatePublicLink(token);

  // 2. Then bypass RLS with filters
  return this.prisma.withoutRls(async (tx) => {
    const results = await tx.chunk.findMany({
      where: {
        document: {
          workspaceId: publicLink.workspaceId, // Filter by validated workspace
          // Optional: filter by allowedTags
        }
      }
    });
    return results;
  });
}
```

### Security Guarantees

1. **Database-level isolation**: PostgreSQL enforces RLS - nawet SQL injection nie zwróci obcych danych
2. **Transaction-scoped context**: `SET LOCAL` jest aktywny tylko w ramach transakcji
3. **Request isolation**: AsyncLocalStorage zapewnia, że concurrent requests nie mieszają context'ów
4. **Non-superuser enforcement**: `knowledge_forge_app` role nie może ominąć RLS
5. **SYSTEM bypass audited**: Public API używa `withoutRls()` tylko po walidacji tokena

---

## Key Components

### 1. PrismaService

**Lokalizacja**: `apps/api/src/infrastructure/persistence/prisma/prisma.service.ts`

**Odpowiedzialność**: ORM client z RLS wrappers

**Kluczowe metody**:

| Method | Use Case | RLS Context |
|--------|----------|-------------|
| `forUser(userId, callback)` | Background jobs, system operations | Explicit user ID |
| `withCurrentUser(callback)` | HTTP request handlers | From AsyncLocalStorage |
| `withoutRls(callback)` | Public API (after token validation) | SYSTEM bypass |

**Best Practices**:
- HTTP handlers: **zawsze** używaj `withCurrentUser()`
- Background jobs: **zawsze** używaj `forUser(userId, ...)`
- Public API: **tylko** `withoutRls()` po walidacji tokena
- Migrations/Seeds: użyj `PrismaSystemService` (superuser)

### 2. UserContext (AsyncLocalStorage)

**Lokalizacja**: `apps/api/src/infrastructure/persistence/rls/user.context.ts`

**Odpowiedzialność**: Per-request user context isolation

**Kluczowe metody**:

| Method | Caller | Purpose |
|--------|--------|---------|
| `setUserId(userId)` | RlsMiddleware | Set context for current request |
| `getCurrentUserId()` | PrismaService.withCurrentUser() | Retrieve current user |
| `runWithUser(userId, callback)` | Background jobs | Execute with specific user context |

**Jak działa AsyncLocalStorage**:
```typescript
// Request 1 (User A)
UserContext.setUserId('user-a-id')
  -> storage.enterWith({ userId: 'user-a-id' })
  -> wszystkie async calls w tym request widzą 'user-a-id'

// Request 2 (User B) - concurrent z Request 1
UserContext.setUserId('user-b-id')
  -> storage.enterWith({ userId: 'user-b-id' })
  -> izolowane od Request 1 - widzi tylko 'user-b-id'
```

### 3. RlsMiddleware

**Lokalizacja**: `apps/api/src/infrastructure/persistence/rls/rls.middleware.ts`

**Odpowiedzialność**: Extract user from JWT → set in UserContext

**Lifecycle**:
```
1. JwtAuthGuard validates token → req.user = { sub: 'userId', email: '...' }
2. RlsMiddleware runs → userContext.setUserId(req.user.sub)
3. Controller/Service calls prisma.withCurrentUser()
4. PrismaService reads userId from userContext
5. Database query executed with RLS context
```

**Registration** (AppModule):
```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RlsMiddleware).forRoutes('*');
  }
}
```

### 4. PrismaSystemService

**Lokalizacja**: `apps/api/src/infrastructure/persistence/prisma/prisma-system.service.ts`

**Odpowiedzialność**: Superuser client for migrations, seeds, tests

**Connection**: `DATABASE_URL_MIGRATE` (postgres superuser)

**Usage**:
```typescript
// Migrations (npx prisma migrate deploy)
// Uses postgres superuser - bypasses RLS

// Seed script
@Injectable()
export class SeedService {
  constructor(
    private readonly prismaSystem: PrismaSystemService // superuser
  ) {}

  async seed() {
    // Can create records without RLS restrictions
    await this.prismaSystem.workspace.create({ ... });
  }
}

// Integration tests
beforeEach(async () => {
  // Clean DB using superuser
  await prismaSuperuser.workspace.deleteMany();
});
```

**CRITICAL**: PrismaSystemService **NIE MOŻE** być używany w production code (tylko migrations/seeds/tests).

### 5. Database Users

**postgres (superuser)**:
```sql
-- Created by: Docker/PostgreSQL initialization
-- Purpose: Migrations, DDL changes, RLS policy creation
-- Connection: DATABASE_URL_MIGRATE
-- Characteristics:
--   - Bypasses ALL RLS policies (nawet z FORCE ROW LEVEL SECURITY)
--   - Full permissions (CREATE, ALTER, DROP)
--   - Used by: prisma migrate, prisma db push

-- NEVER use in application code!
```

**synjar_app (application user)**:
```sql
CREATE ROLE synjar_app LOGIN PASSWORD 'strong-password';

-- Permissions (DML only)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO synjar_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO synjar_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO synjar_app;

-- RLS enforcement
-- Because synjar_app is NOT superuser, all RLS policies are enforced
```

**Connection setup**:
```bash
# .env
DATABASE_URL="postgresql://synjar_app:password@localhost:6201/synjar"
DATABASE_URL_MIGRATE="postgresql://postgres:postgres@localhost:6201/synjar"

# Application uses DATABASE_URL (RLS enforced)
# Migrations use DATABASE_URL_MIGRATE (RLS bypassed)
```

---

## Architecture Layers

### Domain Layer

**Lokalizacja**: `apps/api/src/domain/`

**Zawiera**:
- Entities (business logic, invariants)
- Value Objects (Email, Token, Embedding)
- Repository Interfaces (IWorkspaceRepository, IDocumentRepository)
- Domain Events (WorkspaceMemberAdded, DocumentProcessed)

**Przykład - Entity**:
```typescript
// domain/workspace/workspace.entity.ts
export class Workspace {
  constructor(
    public readonly id: string,
    public name: string,
    public readonly createdById: string,
  ) {}

  // Business logic
  canUserEdit(userId: string, role: Role): boolean {
    return role === 'OWNER' || this.createdById === userId;
  }
}
```

**Przykład - Repository Interface**:
```typescript
// domain/workspace/workspace.repository.interface.ts
export interface IWorkspaceRepository {
  findById(id: string): Promise<Workspace | null>;
  findByUserId(userId: string): Promise<Workspace[]>;
  create(workspace: Workspace): Promise<Workspace>;
  update(workspace: Workspace): Promise<Workspace>;
  delete(id: string): Promise<void>;
}
```

### Application Layer

**Lokalizacja**: `apps/api/src/application/`

**Zawiera**:
- Use Cases (CreateWorkspaceUseCase)
- Application Services (WorkspaceService, DocumentService)
- DTOs (CreateWorkspaceDto)
- Event Handlers (TenantLookupListener)

**Przykład - Service**:
```typescript
// application/workspace/workspace.service.ts
@Injectable()
export class WorkspaceService {
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly repository: IWorkspaceRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(userId: string, dto: CreateWorkspaceDto): Promise<Workspace> {
    // Use repository interface (infrastructure-agnostic)
    const workspace = await this.repository.create({
      id: uuidv4(),
      name: dto.name,
      createdById: userId,
    });

    // Emit domain event
    this.eventEmitter.emit('workspace.created', {
      workspaceId: workspace.id,
      userId,
    });

    return workspace;
  }
}
```

### Infrastructure Layer

**Lokalizacja**: `apps/api/src/infrastructure/`

**Zawiera**:
- Prisma repositories (PrismaWorkspaceRepository implements IWorkspaceRepository)
- External service adapters (OpenAI, Backblaze B2)
- Persistence (PrismaService, migrations)
- RLS components (UserContext, RlsMiddleware)

**Przykład - Repository Implementation**:
```typescript
// infrastructure/persistence/repositories/workspace.repository.impl.ts
@Injectable()
export class PrismaWorkspaceRepository implements IWorkspaceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<Workspace[]> {
    // Use RLS context
    return this.prisma.forUser(userId, async (tx) => {
      const workspaces = await tx.workspace.findMany({
        where: { members: { some: { userId } } },
        include: { members: true },
      });

      // Map Prisma model to Domain entity
      return workspaces.map(w => new Workspace(w.id, w.name, w.createdById));
    });
  }
}
```

### Interface Layer (Controllers)

**Lokalizacja**: `apps/api/src/interfaces/http/`

**Zawiera**:
- Controllers (WorkspaceController)
- DTOs (CreateWorkspaceDto, WorkspaceResponseDto)
- Guards (JwtAuthGuard)
- Decorators (@CurrentUser)

**Przykład - Controller**:
```typescript
// interfaces/http/workspace/workspace.controller.ts
@Controller('workspaces')
@UseGuards(JwtAuthGuard) // Middleware sets UserContext
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Post()
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateWorkspaceDto,
  ): Promise<WorkspaceResponseDto> {
    // Service uses prisma.withCurrentUser() - RLS enforced
    const workspace = await this.workspaceService.create(user.sub, dto);
    return WorkspaceResponseDto.fromDomain(workspace);
  }
}
```

---

## Event Bus

Knowledge Forge używa **EventEmitter2** (in-memory event bus) do komunikacji między bounded contexts.

### Published Events

| Event | Publisher | Payload | Listeners |
|-------|-----------|---------|-----------|
| `workspace.created` | WorkspaceService | `{ workspaceId, userId }` | - |
| `workspace.member.added` | WorkspaceService | `{ workspaceId, userId, role }` | TenantLookupListener |
| `workspace.member.removed` | WorkspaceService | `{ workspaceId, userId }` | TenantLookupListener |
| `user.email.changed` | UserService | `{ userId, oldEmail, newEmail }` | TenantLookupListener |
| `document.processed` | DocumentService | `{ documentId, chunkCount }` | - |

### Event Handlers

```typescript
// application/tenant-lookup/tenant-lookup.listener.ts
@Injectable()
export class TenantLookupListener {
  constructor(
    private readonly tenantLookup: TenantLookupService,
    private readonly crypto: CryptoService,
  ) {}

  @OnEvent('workspace.member.added')
  async handleMemberAdded(payload: { workspaceId: string; userId: string }) {
    const user = await this.userRepo.findById(payload.userId);
    const emailHash = this.crypto.hashEmail(user.email);

    await this.tenantLookup.addEntry(emailHash, payload.workspaceId);
  }

  @OnEvent('workspace.member.removed')
  async handleMemberRemoved(payload: { workspaceId: string; userId: string }) {
    const user = await this.userRepo.findById(payload.userId);
    const emailHash = this.crypto.hashEmail(user.email);

    await this.tenantLookup.removeEntry(emailHash, payload.workspaceId);
  }
}
```

### Current Limitations

**In-memory events** (EventEmitter2):
- Events są zgubione jeśli listener rzuci exception
- Brak retry mechanism
- Brak guaranteed delivery
- Events nie są persisted

**Recommended for production**: Outbox Pattern lub inline handlers (see SPEC-001 Implementation Notes).

---

## Security Best Practices

### 1. ZAWSZE używaj RLS context

```typescript
// GOOD
async getDocuments() {
  return this.prisma.withCurrentUser(async (tx) => {
    return tx.document.findMany();
  });
}

// BAD - bypasses RLS!
async getDocuments() {
  return this.prisma.document.findMany(); // No RLS context!
}
```

### 2. Public API: validate THEN bypass

```typescript
// GOOD
async search(token: string) {
  const publicLink = await this.validateToken(token); // FIRST

  return this.prisma.withoutRls(async (tx) => { // THEN
    return tx.document.findMany({
      where: { workspaceId: publicLink.workspaceId } // Filter by validated workspace
    });
  });
}

// BAD - bypasses without validation!
async search(token: string) {
  return this.prisma.withoutRls(async (tx) => {
    // No validation - can access all workspaces!
    return tx.document.findMany();
  });
}
```

### 3. Background jobs: explicit user context

```typescript
// GOOD
@Cron('0 0 * * *')
async dailyReport() {
  const users = await this.getActiveUsers();

  for (const user of users) {
    await this.prisma.forUser(user.id, async (tx) => {
      const stats = await this.calculateStats(tx);
      await this.sendEmail(user, stats);
    });
  }
}

// BAD - no RLS context!
@Cron('0 0 * * *')
async dailyReport() {
  // No user context - RLS policies will return empty results
  const stats = await this.prisma.document.count();
}
```

### 4. Migrations: use superuser, but minimize

```sql
-- GOOD - migration creates RLS policy (requires superuser)
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_isolation ON "Document" ...;

-- AVOID - inserting data in migration
INSERT INTO "Document" (...) VALUES (...); -- Use seed instead
```

---

## Testing Strategy

### 1. Unit Tests (Domain/Application)

```typescript
describe('WorkspaceService', () => {
  let service: WorkspaceService;
  let mockRepository: jest.Mocked<IWorkspaceRepository>;

  beforeEach(() => {
    mockRepository = {
      create: jest.fn(),
      findByUserId: jest.fn(),
    } as any;

    service = new WorkspaceService(mockRepository, new EventEmitter2());
  });

  it('should create workspace with creator as OWNER', async () => {
    // Test business logic without database
    mockRepository.create.mockResolvedValue(workspace);

    const result = await service.create('user-123', { name: 'Test' });

    expect(result.createdById).toBe('user-123');
  });
});
```

### 2. Integration Tests (RLS enforcement)

```typescript
describe('RLS Integration', () => {
  let prisma: PrismaService;
  let prismaSuperuser: PrismaSystemService;

  beforeEach(async () => {
    // Clean DB with superuser
    await prismaSuperuser.workspace.deleteMany();
  });

  it('should enforce workspace isolation', async () => {
    // Arrange
    const userA = await createUser('user-a');
    const userB = await createUser('user-b');
    const workspaceA = await createWorkspace(userA.id);
    const workspaceB = await createWorkspace(userB.id);

    // Act - User A queries workspaces
    const result = await prisma.forUser(userA.id, async (tx) => {
      return tx.workspace.findMany();
    });

    // Assert - User A only sees their workspace
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(workspaceA.id);
  });
});
```

### 3. E2E Tests (Full HTTP flow)

```typescript
describe('Workspace E2E', () => {
  it('should return 404 for workspace from different user', async () => {
    // Arrange
    const userAToken = await getJwtToken(userA);
    const workspaceB = await createWorkspace(userB.id);

    // Act
    const response = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceB.id}`)
      .set('Authorization', `Bearer ${userAToken}`)
      .expect(404); // RLS makes it invisible

    // Assert - not 403 Forbidden, but 404 Not Found (via RLS)
  });
});
```

---

## Troubleshooting

### Problem: "User context not set"

**Przyczyna**: RlsMiddleware nie ustawił UserContext

**Rozwiązanie**:
1. Sprawdź czy middleware jest zarejestrowany w AppModule
2. Sprawdź czy endpoint jest protected przez JwtAuthGuard
3. Sprawdź czy JWT token jest valid

### Problem: Queries zwracają puste wyniki

**Przyczyna**: Brak RLS context lub user nie ma dostępu do workspace

**Debug**:
```sql
-- Sprawdź current_setting
SELECT current_setting('app.current_user_id', true);

-- Sprawdź workspace membership
SELECT * FROM "WorkspaceMember" WHERE "userId" = 'current-user-id';
```

### Problem: Tests failują z "permission denied"

**Przyczyna**: Test używa application user zamiast superuser do clean DB

**Rozwiązanie**:
```typescript
// Use PrismaSystemService for test setup
beforeEach(async () => {
  await prismaSuperuser.workspace.deleteMany(); // superuser
});

// Use regular PrismaService for tests
it('should ...', async () => {
  await prisma.forUser(userId, async (tx) => { ... }); // app user + RLS
});
```

---

## References

- [SPEC-001: Row Level Security](specifications/SPEC-001-row-level-security.md) - Pełna specyfikacja RLS
- [SPEC-020: Tenant User Lookup](specifications/SPEC-020-tenant-user-lookup.md) - Email hashing dla workspace discovery
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) - Robert C. Martin
- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [AsyncLocalStorage](https://nodejs.org/api/async_context.html#class-asynclocalstorage) - Node.js docs

---

**Ostatnia aktualizacja**: 2025-12-25
**Wersja**: 1.0
**Autor**: Synjar Team
