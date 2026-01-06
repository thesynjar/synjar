# Synjar - System Ecosystem

## Overview

Synjar is a multi-tenant RAG (Retrieval Augmented Generation) system for knowledge base management. The system uses Clean Architecture with Row Level Security (RLS) integration at the database level, ensuring data isolation between workspaces.

### Key Features

- **Multi-tenancy**: Workspace-based isolation with PostgreSQL RLS
- **Semantic Search**: RAG using OpenAI embeddings + pgvector
- **Security-first**: Defense in depth (code + database)
- **Clean Architecture**: DDD, SOLID, Dependency Injection
- **Type-safe**: TypeScript + Prisma ORM

---

## Bounded Contexts

The system consists of 6 main Bounded Contexts:

```
┌────────────────────────────────────────────────────────────────────────┐
│                           SYNJAR SYSTEM                                 │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌────────────────┐  ┌──────────────────┐  ┌─────────────────────────┐│
│  │  Auth Context  │  │ Workspace Context│  │   Document Context      ││
│  ├────────────────┤  ├──────────────────┤  ├─────────────────────────┤│
│  │ - User         │  │ - Workspace      │  │ - Document              ││
│  │ - Session      │  │ - WorkspaceMember│  │ - Chunk                 ││
│  │ - JWT          │  │ - Role           │  │ - Tag, DocumentTag      ││
│  └────────────────┘  └──────────────────┘  └─────────────────────────┘│
│                                                                         │
│  ┌─────────────────────┐  ┌─────────────────────┐                     │
│  │  Public API Context │  │ InstructionSet Ctx  │                     │
│  ├─────────────────────┤  ├─────────────────────┤                     │
│  │ - PublicLink        │  │ - InstructionSet    │                     │
│  │ - Token validation  │  │ - InstructionSetDoc │                     │
│  │ - SECURITY DEFINER  │  │ - Public access     │                     │
│  └─────────────────────┘  └─────────────────────┘                     │
│                                                                         │
│  ┌──────────────────────────────────┐                                  │
│  │   Tenant Lookup Context          │                                  │
│  ├──────────────────────────────────┤                                  │
│  │ - TenantUserEmailLookup          │                                  │
│  │ - Email hashing, Workspace disc. │                                  │
│  └──────────────────────────────────┘                                  │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

### Auth Context

**Responsibility**: User authentication and authorization

**Entities**:
- `User` - system user (email, password hash)
- `Session` - JWT-based session management

**Use Cases**:
- User registration
- Login (JWT token generation)
- Token validation

**Infrastructure**:
- `JwtStrategy` - Passport.js JWT authentication
- `BcryptService` - password hashing

### Workspace Context

**Responsibility**: Multi-tenancy, workspace management, access control

**Entities**:
- `Workspace` - logical container for documents (tenant)
- `WorkspaceMember` - User ↔ Workspace relationship with role
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
- Workspace must have at least one OWNER
- Workspace creator automatically becomes OWNER
- RLS enforcement: user sees only workspaces they are a member of

### Document Context

**Responsibility**: Document management, chunking, tagging

**Entities**:
- `Document` - text document or file
- `Chunk` - document fragment with embedding (vector)
- `Tag` - workspace-scoped label (unique per workspace)
- `DocumentTag` - Document ↔ Tag relationship

**Use Cases**:
- Upload document (text or file)
- Process document (chunking + embeddings)
- Tag documents
- Search by tags

**Infrastructure**:
- `DocumentRepository` - persistence
- `EmbeddingsService` - OpenAI API integration
- `StorageService` - Backblaze B2 file storage

**Invariants**:
- Document belongs to exactly one Workspace
- Chunk belongs to exactly one Document
- RLS enforcement: user sees only documents from their workspaces
- Tag belongs to exactly one Workspace

### Public API Context

**Responsibility**: Public access to workspaces via token

**Entities**:
- `PublicLink` - token-based access to workspace
- `Token` - unique UUID for public link

**Use Cases**:
- Create public link (with optional constraints: tags, expiry)
- Semantic search via public link
- Revoke public link

**Infrastructure**:
- `PublicController` - HTTP endpoints
- SQL SECURITY DEFINER function `lookup_public_link_by_token()` - secure token lookup
- `PrismaService.forWorkspace()` - RLS-protected queries after validation

**Security**:
- Token validation via SECURITY DEFINER function (validates isActive, expiresAt)
- After validation: `forWorkspace(workspaceId)` for RLS-protected queries
- Optional tag filtering (only documents with specified tags)
- Optional expiry date
- isActive flag (soft delete)

### Tenant Lookup Context

**Responsibility**: Lookup user's workspaces by email (hashed)

**Entities**:
- `TenantUserEmailLookup` - hashed email → workspaceId mapping

**Use Cases**:
- Find workspaces by user email (for invite flow)
- Sync lookup entries on workspace membership changes

**Infrastructure**:
- `TenantLookupService` - domain logic
- `CryptoService` - SHA-256 email hashing

**Privacy**:
- Email stored as SHA-256 hash (irreversible)
- Lookup possible only if you know the exact email
- RLS enforcement: user sees only entries from their workspaces

### Instruction Set Context

**Responsibility**: Aggregation of documents into instruction sets for LLM agents

**Entities**:
- `InstructionSet` - collection of documents to pass to LLM (isPublic, name, description)
- `InstructionSetDocument` - junction table with order

**Use Cases**:
- Create/Update/Delete instruction sets
- Add/Remove documents while preserving order
- Toggle public access (isPublic flag)
- Public access for LLM agents (without authentication)

**Infrastructure**:
- `InstructionSetService` - domain logic, orchestration
- `PrismaInstructionSetRepository` - persistence with RLS
- SQL SECURITY DEFINER functions:
  - `lookup_public_instruction_set(id)` - metadata lookup
  - `get_public_instruction_set_documents(id)` - documents (VERIFIED only)

**Public Access Security** (SECURITY DEFINER pattern):
```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Function-level validation (isPublic = true)        │
├─────────────────────────────────────────────────────────────┤
│ Layer 2: Data filtering (VERIFIED documents only)           │
├─────────────────────────────────────────────────────────────┤
│ Layer 3: Anti-enumeration (returns empty, not error)        │
└─────────────────────────────────────────────────────────────┘
```

**Limits**:
- Max 20 documents per set
- Max 100 KB total content size
- Max 50 sets per workspace

**Related ADRs**:
- [ADR-2026-01-05: SECURITY DEFINER Pattern](adr/ADR-2026-01-05-security-definer-pattern.md)

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

### 3. Public API Flow (SECURITY DEFINER)

```
┌────────────┐  token   ┌──────────────────┐
│   Client   │─────────>│ PublicController │
└────────────┘          └────────┬─────────┘
                                 │ validate token
                                 v
                        ┌─────────────────────────────┐
                        │ lookup_public_link_by_token │
                        │ (SECURITY DEFINER function) │
                        │ - token exists?             │
                        │ - isActive = true?          │
                        │ - expiresAt > NOW()?        │
                        └────────┬────────────────────┘
                                 │ if valid: returns workspaceId
                                 │ if invalid: returns empty
                                 v
                        ┌──────────────────────────┐
                        │    forWorkspace(id)      │
                        │  set_config(..., true)   │
                        │  RLS context enabled     │
                        └────────┬─────────────────┘
                                 │ execute queries
                                 v
                        ┌──────────────────────────┐
                        │      PostgreSQL          │
                        │ workspaceId = context_id │
                        │    RLS ENFORCED          │
                        └────────┬─────────────────┘
                                 │ filters by workspace
                                 │ optional: filter by allowedTags
                                 v
                        [ Return workspace data ]
```

**Key Security Improvements (2025-12-29):**
- `withoutRls()` - REMOVED (dangerous, could bypass all RLS)
- SECURITY DEFINER function - limited scope (token lookup only)
- Validation at database level (isActive, expiresAt)
- After validation: RLS enforced via `forWorkspace()`

---

## RLS Architecture

### What is Row Level Security (RLS)?

PostgreSQL Row Level Security is a database mechanism that automatically filters query results based on security policies. In Synjar, RLS ensures that:

1. User sees **only** documents from their workspaces
2. Even if the application code has a bug, the database **will not return** other users' data
3. Defense in depth - second layer of security

### RLS Implementation

#### 1. Database Setup

**Database Users**:
```
postgres (superuser)
├─ Usage: migrations only
├─ Characteristics: bypasses RLS (always!)
└─ Connection: DATABASE_URL_MIGRATE

synjar_app (non-superuser)
├─ Usage: application runtime
├─ Characteristics: RLS enforced
└─ Connection: DATABASE_URL
```

**RLS Policies** (for each table):
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

**AsyncLocalStorage** ensures request isolation - each HTTP request has its own context, even with concurrent requests.

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
3. Controller/Service can use `prisma.withCurrentUser()`

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

  // NOTE: withoutRls() has been REMOVED (2025-12-29)
  // For public API token lookups, use SQL SECURITY DEFINER function
  // lookup_public_link_by_token() via $queryRaw
  // See: migrations/20251229100000_add_public_link_token_lookup_function
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

#### Pattern 3: Public API (SECURITY DEFINER + forWorkspace)

```typescript
// In PublicController
async search(token: string, query: string) {
  // 1. Validate token via SECURITY DEFINER function
  // This bypasses RLS safely for token lookup only
  const publicLink = await this.publicLinkService.validateToken(token);
  // validateToken() uses lookup_public_link_by_token() SQL function
  // which validates isActive=true and expiresAt > NOW()

  // 2. Use forWorkspace() for RLS-protected queries
  return this.prisma.forWorkspace(publicLink.workspaceId, async (tx) => {
    const results = await tx.chunk.findMany({
      where: {
        document: {
          // RLS automatically filters by workspaceId context
          // Optional: filter by allowedTags
          ...(publicLink.allowedTags?.length > 0 && {
            tags: { some: { tag: { name: { in: publicLink.allowedTags } } } }
          })
        }
      }
    });
    return results;
  });
}
```

### Security Guarantees

1. **Database-level isolation**: PostgreSQL enforces RLS - even SQL injection won't return other users' data
2. **Transaction-scoped context**: `SET LOCAL` is active only within the transaction
3. **Request isolation**: AsyncLocalStorage ensures concurrent requests don't mix contexts
4. **Non-superuser enforcement**: `synjar_app` role cannot bypass RLS
5. **SECURITY DEFINER limited scope**: Token lookup via SQL function, RLS enforced after validation

---

## Key Components

### 1. PrismaService

**Location**: `apps/api/src/infrastructure/persistence/prisma/prisma.service.ts`

**Responsibility**: ORM client with RLS wrappers

**Key methods**:

| Method | Use Case | RLS Context |
|--------|----------|-------------|
| `forUser(userId, callback)` | Background jobs with user context | Explicit user ID |
| `forWorkspace(workspaceId, callback)` | Background jobs, Public API after validation | Explicit workspace ID |
| `withCurrentUser(callback)` | HTTP request handlers | From AsyncLocalStorage |
| `$queryRaw` | SECURITY DEFINER function calls | SQL function context |

**Best Practices**:
- HTTP handlers: **always** use `withCurrentUser()`
- Background jobs: **always** use `forUser(userId, ...)` or `forWorkspace(workspaceId, ...)`
- Public API: `$queryRaw` for token lookup, then `forWorkspace()` for queries
- Migrations/Seeds: use `PrismaSystemService` (superuser)

**REMOVED (2025-12-29):**
- `withoutRls()` - replaced by SECURITY DEFINER function

### 2. UserContext (AsyncLocalStorage)

**Location**: `apps/api/src/infrastructure/persistence/rls/user.context.ts`

**Responsibility**: Per-request user context isolation

**Key methods**:

| Method | Caller | Purpose |
|--------|--------|---------|
| `setUserId(userId)` | RlsMiddleware | Set context for current request |
| `getCurrentUserId()` | PrismaService.withCurrentUser() | Retrieve current user |
| `runWithUser(userId, callback)` | Background jobs | Execute with specific user context |

**How AsyncLocalStorage works**:
```typescript
// Request 1 (User A)
UserContext.setUserId('user-a-id')
  -> storage.enterWith({ userId: 'user-a-id' })
  -> all async calls in this request see 'user-a-id'

// Request 2 (User B) - concurrent with Request 1
UserContext.setUserId('user-b-id')
  -> storage.enterWith({ userId: 'user-b-id' })
  -> isolated from Request 1 - sees only 'user-b-id'
```

### 3. RlsMiddleware

**Location**: `apps/api/src/infrastructure/persistence/rls/rls.middleware.ts`

**Responsibility**: Extract user from JWT → set in UserContext

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

**Location**: `apps/api/src/infrastructure/persistence/prisma/prisma-system.service.ts`

**Responsibility**: Superuser client for migrations, seeds, tests

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

**CRITICAL**: PrismaSystemService **MUST NOT** be used in production code (only migrations/seeds/tests).

### 5. Database Users

**postgres (superuser)**:
```sql
-- Created by: Docker/PostgreSQL initialization
-- Purpose: Migrations, DDL changes, RLS policy creation
-- Connection: DATABASE_URL_MIGRATE
-- Characteristics:
--   - Bypasses ALL RLS policies (even with FORCE ROW LEVEL SECURITY)
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

**Location**: `apps/api/src/domain/`

**Contains**:
- Entities (business logic, invariants)
- Value Objects (Email, Token, Embedding)
- Repository Interfaces (IWorkspaceRepository, IDocumentRepository)
- Domain Events (WorkspaceMemberAdded, DocumentProcessed)

**Example - Entity**:
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

**Example - Repository Interface**:
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

**Location**: `apps/api/src/application/`

**Contains**:
- Use Cases (CreateWorkspaceUseCase)
- Application Services (WorkspaceService, DocumentService)
- DTOs (CreateWorkspaceDto)
- Event Handlers (TenantLookupListener)

**Example - Service**:
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

**Location**: `apps/api/src/infrastructure/`

**Contains**:
- Prisma repositories (PrismaWorkspaceRepository implements IWorkspaceRepository)
- External service adapters (OpenAI, Backblaze B2)
- Persistence (PrismaService, migrations)
- RLS components (UserContext, RlsMiddleware)

**Example - Repository Implementation**:
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

**Location**: `apps/api/src/interfaces/http/`

**Contains**:
- Controllers (WorkspaceController)
- DTOs (CreateWorkspaceDto, WorkspaceResponseDto)
- Guards (JwtAuthGuard)
- Decorators (@CurrentUser)

**Example - Controller**:
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

Knowledge Forge uses **EventEmitter2** (in-memory event bus) for communication between bounded contexts.

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
- Events are lost if listener throws an exception
- No retry mechanism
- No guaranteed delivery
- Events are not persisted

**Recommended for production**: Outbox Pattern or inline handlers (see SPEC-001 Implementation Notes).

---

## Security Best Practices

### 1. ALWAYS use RLS context

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

### 2. Public API: validate via SECURITY DEFINER THEN use forWorkspace

```typescript
// GOOD - SECURITY DEFINER for validation, forWorkspace for queries
async search(token: string) {
  // 1. Validate token via SECURITY DEFINER function (validates isActive, expiresAt)
  const publicLink = await this.publicLinkService.validateToken(token);

  // 2. Use forWorkspace for RLS-protected queries
  return this.prisma.forWorkspace(publicLink.workspaceId, async (tx) => {
    return tx.document.findMany(); // RLS filters by workspace context
  });
}

// BAD - raw $queryRaw without proper validation!
async search(token: string) {
  // Missing validation - should use lookup_public_link_by_token()
  const link = await this.prisma.$queryRaw`SELECT * FROM "PublicLink" WHERE token = ${token}`;
  // No isActive/expiresAt check at database level!
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

**Cause**: RlsMiddleware did not set UserContext

**Solution**:
1. Check if middleware is registered in AppModule
2. Check if endpoint is protected by JwtAuthGuard
3. Check if JWT token is valid

### Problem: Queries return empty results

**Cause**: Missing RLS context or user doesn't have access to workspace

**Debug**:
```sql
-- Check current_setting
SELECT current_setting('app.current_user_id', true);

-- Check workspace membership
SELECT * FROM "WorkspaceMember" WHERE "userId" = 'current-user-id';
```

### Problem: Tests fail with "permission denied"

**Cause**: Test uses application user instead of superuser to clean DB

**Solution**:
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

- [SPEC-001: Row Level Security](specifications/SPEC-001-row-level-security.md) - Full RLS specification
- [SPEC-020: Tenant User Lookup](specifications/SPEC-020-tenant-user-lookup.md) - Email hashing for workspace discovery
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) - Robert C. Martin
- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [AsyncLocalStorage](https://nodejs.org/api/async_context.html#class-asynclocalstorage) - Node.js docs

---

**Last updated**: 2025-12-25
**Version**: 1.0
**Author**: Synjar Team
