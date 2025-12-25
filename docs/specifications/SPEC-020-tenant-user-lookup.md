# SPEC-020: Tenant User Email Lookup

**Status:** In Progress
**Priority:** P0
**Complexity:** M
**Created:** 2025-12-25

## Overview

Mechanizm lookup dla multi-tenant authentication przez cloud.synjar.com. Pozwala użytkownikom logującym się przez chmurę na znalezienie workspace'ów, do których mają dostęp.

## Problem

Gdy user loguje się przez cloud.synjar.com:
1. Nie znamy hostname (multi-tenant)
2. User może mieć dostęp do wielu workspace'ów
3. Potrzebujemy bezpiecznego sposobu mapowania email → workspaces

## Solution

### Hybrid Resolution Order
```
1. hostname (subdomain.synjar.com) → workspace_id
2. localStorage (last used workspace) → workspace_id
3. tenant_user_email_lookup (email hash) → workspace_id[]
```

### Database Schema

```sql
CREATE TABLE "TenantUserEmailLookup" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- SHA-256 hash of lowercase email
  email_hash TEXT NOT NULL,

  -- Reference to workspace (tenant)
  workspace_id UUID NOT NULL REFERENCES "Workspace"(id) ON DELETE CASCADE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint: one entry per email+workspace
  UNIQUE(email_hash, workspace_id)
);

-- Index for fast lookup by email hash
CREATE INDEX idx_tenant_lookup_email_hash ON "TenantUserEmailLookup"(email_hash);
```

### Security

1. **Email Hashing**: SHA-256 hash of lowercase email
   - `sha256(email.toLowerCase())` → hex string
   - Prevents email leak if table is compromised
   - Consistent hashing for lookups

2. **RLS Policy**:
   - No RLS on this table (public lookup)
   - Only returns workspace_ids, not sensitive data
   - Actual auth happens via normal login flow

### API Endpoints

```typescript
// POST /api/v1/auth/resolve-workspaces
// Request: { email: string }
// Response: { workspaces: { id: string, name: string }[] }

// Called before login to show user their available workspaces
// Uses email hash to lookup, then returns public workspace info
```

### Lifecycle

1. **On WorkspaceMember.create**: Add lookup entry
2. **On WorkspaceMember.delete**: Remove lookup entry
3. **On User email change**: Update all lookup entries

## Implementation Progress

### Tasks

- [x] **TASK-1**: Create Prisma schema and migration
- [x] **TASK-2**: Implement hashing utility
- [x] **TASK-3**: Create lookup service
- [x] **TASK-4**: Add event handlers for sync
- [x] **TASK-5**: Create resolve-workspaces endpoint
- [ ] **TASK-6**: Write integration tests

### Agent Progress Log

```
[Timestamp] [Agent] [Task] Status/Notes
-------------------------------------------
[2025-12-25 13:00] [Claude] [TASK-1] COMPLETED
  - Added TenantUserEmailLookup model to schema.prisma
  - Created migration 20251225130000_add_tenant_user_lookup
  - Schema includes: id (UUID), emailHash (TEXT), workspaceId (UUID FK)
  - Added unique constraint on (emailHash, workspaceId)
  - Added index on emailHash for fast lookups
  - Added relation to Workspace model with CASCADE delete
  - Ran prisma generate successfully

[2025-12-25 13:15] [Claude] [TASK-5] COMPLETED
  - Created TenantLookupService at /apps/api/src/application/tenant-lookup/tenant-lookup.service.ts
  - Service includes resolveWorkspaces() method with email hashing
  - Service includes helper methods: addLookupEntry(), removeLookupEntry(), updateEmailLookup()
  - Created TenantLookupModule at /apps/api/src/application/tenant-lookup/tenant-lookup.module.ts
  - Created DTOs at /apps/api/src/interfaces/http/tenant-lookup/dto/resolve-workspaces.dto.ts
  - Created TenantLookupController at /apps/api/src/interfaces/http/tenant-lookup/tenant-lookup.controller.ts
  - Endpoint: POST /api/v1/auth/resolve-workspaces (PUBLIC, no auth required)
  - Added rate limiting: @Throttle({ default: { limit: 10, ttl: 60000 } })
  - Added comprehensive Swagger documentation with ApiOperation, ApiResponse
  - Registered TenantLookupModule in AppModule CORE_MODULES

[2025-12-25 14:00] [Claude Sonnet 4.5] [TASK-2] COMPLETED
  - Hashing utility already exists at /apps/api/src/infrastructure/crypto/hash.util.ts
  - Exports hashEmail(email: string): string function
  - Uses SHA-256 with lowercase + trim normalization
  - Updated TenantLookupService to use centralized hashEmail utility

[2025-12-25 14:00] [Claude Sonnet 4.5] [TASK-3] COMPLETED
  - TenantLookupService already created (see TASK-5)
  - Updated service methods to align with event handler interface
  - Service provides: resolveWorkspaces(), addLookupEntry(), removeLookupEntry(), syncUserLookups()

[2025-12-25 14:00] [Claude Sonnet 4.5] [TASK-4] COMPLETED
  - Created domain event classes at /apps/api/src/application/tenant-lookup/events/
    * WorkspaceMemberAddedEvent (userId, workspaceId)
    * WorkspaceMemberRemovedEvent (userId, workspaceId)
    * UserEmailChangedEvent (userId, oldEmail, newEmail)
  - Created TenantLookupListener at /apps/api/src/application/tenant-lookup/tenant-lookup.listener.ts
    * @OnEvent('workspace.member.added') → addLookupEntry()
    * @OnEvent('workspace.member.removed') → removeLookupEntry()
    * @OnEvent('user.email.changed') → syncUserLookups()
  - Updated WorkspaceService to emit events:
    * Emits workspace.member.added in create() (for owner)
    * Emits workspace.member.added in addMember()
    * Emits workspace.member.removed in removeMember()
  - Registered TenantLookupListener in TenantLookupModule providers
  - Event handlers include error logging and graceful degradation
  - Listeners fetch user email from database before calling service methods
```

## Technical Details

### Hash Function
```typescript
import { createHash } from 'crypto';

function hashEmail(email: string): string {
  return createHash('sha256')
    .update(email.toLowerCase().trim())
    .digest('hex');
}
```

### Lookup Flow
```typescript
async resolveWorkspaces(email: string): Promise<Workspace[]> {
  const emailHash = hashEmail(email);

  const lookups = await prisma.tenantUserEmailLookup.findMany({
    where: { emailHash },
    include: { workspace: { select: { id: true, name: true } } }
  });

  return lookups.map(l => l.workspace);
}
```

### Event Sync
```typescript
// On member added
@OnEvent('workspace.member.added')
async handleMemberAdded(event: { userId: string, workspaceId: string }) {
  const user = await prisma.user.findUnique({ where: { id: event.userId } });
  await prisma.tenantUserEmailLookup.upsert({
    where: { emailHash_workspaceId: { emailHash: hashEmail(user.email), workspaceId: event.workspaceId } },
    create: { emailHash: hashEmail(user.email), workspaceId: event.workspaceId },
    update: {}
  });
}

// On member removed
@OnEvent('workspace.member.removed')
async handleMemberRemoved(event: { userId: string, workspaceId: string }) {
  const user = await prisma.user.findUnique({ where: { id: event.userId } });
  await prisma.tenantUserEmailLookup.delete({
    where: { emailHash_workspaceId: { emailHash: hashEmail(user.email), workspaceId: event.workspaceId } }
  });
}
```

## Dependencies

- Prisma ORM
- Node.js crypto module
- NestJS Event Emitter

## Testing

1. Hash consistency test
2. Lookup returns correct workspaces
3. Sync on member add/remove
4. No email leak in database
5. Multi-workspace user scenario

[2025-12-25 14:30] [Claude] [TASK-2] COMPLETED
  - Created hash utility at /apps/api/src/infrastructure/crypto/hash.util.ts
  - Implements hashEmail(email: string): string using SHA-256
  - Normalizes email (lowercase + trim) before hashing
  - Created comprehensive unit tests at /apps/api/src/infrastructure/crypto/hash.util.spec.ts
  - All 5 tests passing: consistency, normalization, trimming, uniqueness, format

[2025-12-25 14:35] [Claude] [TASK-3] COMPLETED
  - Updated TenantLookupService to match specification exactly
  - Fixed method signatures to use email instead of userId for addLookupEntry/removeLookupEntry
  - Updated syncUserLookups(userId: string) to sync all entries based on current memberships
  - Service now uses imported hashEmail utility instead of private method
  - Added comprehensive JSDoc documentation for all methods
  - Service correctly bypasses RLS (uses direct PrismaService, not forUser())
