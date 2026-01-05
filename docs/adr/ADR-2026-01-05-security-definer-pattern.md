# ADR-2026-01-05: SECURITY DEFINER Pattern for Public Access

## Status

**Accepted**

## Context

### Problem: Public Access to RLS-Protected Data

Row-Level Security (RLS) policies require `app.current_workspace_id` context for all queries. However, some features require **public access** without authentication:

1. **Public Instruction Sets** - LLM agents fetch instruction sets via `/s/{id}` without auth
2. **Public Links** - Token-based document search via `/api/v1/public/{token}` without auth

### Why Raw Queries Don't Bypass RLS

A common misconception is that Prisma's `$queryRaw` bypasses RLS:

```typescript
// INCORRECT - Raw queries still respect RLS!
const data = await prisma.$queryRaw`
  SELECT * FROM "InstructionSet"
  WHERE id = ${id} AND "isPublic" = true
`;
// Returns NULL if app.current_workspace_id not set
```

RLS policies are enforced at the database level for **all queries** from non-superuser connections. The `synjar_app` role has `NOBYPASSRLS`.

### Existing Pattern: PublicLink Token Lookup

The `PublicLink` feature already solves this with `SECURITY DEFINER`:

```sql
CREATE FUNCTION lookup_public_link_by_token(p_token TEXT)
RETURNS TABLE (...)
LANGUAGE plpgsql
SECURITY DEFINER  -- Runs with function owner (postgres) privileges
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT ... FROM "PublicLink" pl
  WHERE pl.token = p_token AND pl."isActive" = true;
END;
$$;
```

`SECURITY DEFINER` functions run with the **privileges of the function owner** (postgres superuser), effectively bypassing RLS.

## Decision

**Use SECURITY DEFINER functions for all public access patterns.**

### Security Model

All SECURITY DEFINER functions MUST implement defense-in-depth:

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Function-level validation                          │
│   - isPublic = true (for instruction sets)                  │
│   - isActive = true AND expiresAt > NOW() (for public links)│
├─────────────────────────────────────────────────────────────┤
│ Layer 2: Data filtering                                     │
│   - Only VERIFIED documents in public instruction sets      │
│   - Only allowed tags in public links                       │
├─────────────────────────────────────────────────────────────┤
│ Layer 3: Anti-enumeration                                   │
│   - Return empty (not error) for non-existent/private data  │
│   - Generic 404 in application layer                        │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Pattern

```sql
CREATE OR REPLACE FUNCTION lookup_public_X(p_id TEXT)
RETURNS TABLE (...)
LANGUAGE plpgsql
SECURITY DEFINER  -- Bypasses RLS
STABLE            -- Pure read, no side effects
AS $$
BEGIN
  -- Layer 1: Validate public access
  IF NOT EXISTS (
    SELECT 1 FROM "X" WHERE id = p_id AND "isPublic" = true
  ) THEN
    RETURN;  -- Empty result, not error (anti-enumeration)
  END IF;

  -- Layer 2: Return filtered data
  RETURN QUERY
  SELECT ... FROM "X"
  WHERE ... AND verification_status = 'VERIFIED';
END;
$$;

-- Grant to PUBLIC for unauthenticated access
GRANT EXECUTE ON FUNCTION lookup_public_X(TEXT) TO PUBLIC;
```

### Current SECURITY DEFINER Functions

| Function | Table | Purpose | Validation |
|----------|-------|---------|------------|
| `lookup_public_link_by_token(token)` | PublicLink | Token-based search | isActive, expiresAt |
| `lookup_public_instruction_set(id)` | InstructionSet | Public set metadata | isPublic |
| `get_public_instruction_set_documents(id)` | Document | Set documents | isPublic, VERIFIED |

## Alternatives Considered

### Alt 1: Separate Connection Pool with Superuser

```typescript
const superuserPrisma = new PrismaClient({ url: SUPERUSER_URL });
const data = await superuserPrisma.instructionSet.findUnique(...);
```

**Rejected:**
- All queries bypass RLS (too permissive)
- Security depends on application code filtering
- Credential management complexity

### Alt 2: RLS Policies with isPublic Condition

```sql
CREATE POLICY instruction_set_public_select ON "InstructionSet"
  FOR SELECT
  USING ("isPublic" = true);
```

**Rejected:**
- Migration failed: `permission denied for schema public`
- Creating policies requires table ownership
- Would make all public sets visible in all queries (noisy)

### Alt 3: Disable RLS on Public Tables

**Rejected:**
- Destroys multi-tenancy for all operations
- Security by application code only
- Against our defense-in-depth principle

## Consequences

### Positive

1. **Consistent pattern** - All public access uses same mechanism
2. **Defense in depth** - Multiple validation layers
3. **Explicit** - Easy to audit which data is publicly accessible
4. **SQL injection safe** - Parameterized queries within functions

### Negative

1. **Function proliferation** - Each public access needs dedicated function
2. **Raw queries in repository** - `$queryRaw` instead of Prisma methods
3. **Dual ownership** - Functions owned by postgres, called by synjar_app

### Risks

| Risk | Mitigation |
|------|------------|
| Missing isPublic check in function | Code review checklist, integration tests |
| SQL injection via function parameter | Parameterized queries, type safety |
| Overly permissive function access | GRANT only what's needed, audit logs |
| Performance (function call overhead) | STABLE caching, minimal queries |

## Security Checklist for New Functions

When creating a new SECURITY DEFINER function:

- [ ] **Layer 1:** Validate access condition (isPublic, isActive, token, etc.)
- [ ] **Layer 2:** Filter returned data (VERIFIED documents, allowed tags, etc.)
- [ ] **Layer 3:** Return empty for invalid access (anti-enumeration)
- [ ] **STABLE:** Function is pure read with no side effects
- [ ] **Types:** Parameters are typed (TEXT, UUID, etc.)
- [ ] **GRANT:** Only PUBLIC if truly unauthenticated, else specific role
- [ ] **Test:** Integration test for SQL injection, workspace isolation
- [ ] **Audit:** Log access events in application layer

## Related

- [SPEC-001: Row Level Security](../specifications/SPEC-001-row-level-security.md) - RLS fundamentals
- [ADR-2025-12-28: RLS Workspace Context](./ADR-2025-12-28-rls-workspace-context-refactor.md) - Context propagation
- [Migration: 20251229100000_add_public_link_token_lookup_function](../../../apps/api/prisma/migrations/20251229100000_add_public_link_token_lookup_function/migration.sql) - First SECURITY DEFINER function
- [Migration: 20260105100000_add_public_instruction_set_access](../../../apps/api/prisma/migrations/20260105100000_add_public_instruction_set_access/migration.sql) - InstructionSet functions
