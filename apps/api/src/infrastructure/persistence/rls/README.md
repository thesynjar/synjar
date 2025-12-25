# Row Level Security (RLS) Infrastructure

This directory contains the backend infrastructure for implementing Row Level Security in Synjar. RLS ensures workspace isolation at the database level, providing defense-in-depth security.

## Architecture

The RLS implementation follows Clean Architecture principles and uses AsyncLocalStorage to maintain user context throughout the request lifecycle.

### Components

#### 1. UserContext (`user.context.ts`)

Manages the current user's ID using Node.js AsyncLocalStorage. This ensures each HTTP request maintains its own isolated user context.

**Key Methods:**
- `getCurrentUserId()` - Gets current user ID, throws if not set
- `getCurrentUserIdOrNull()` - Gets current user ID or null
- `setUserId(userId)` - Sets user ID in current context (used by middleware)
- `runWithUser(userId, callback)` - Executes callback with specific user context (for background jobs)

**Usage Example:**
```typescript
// In background jobs
await userContext.runWithUser(userId, async () => {
  // All DB queries here use this userId for RLS
  await processDocument(docId);
});
```

#### 2. RlsMiddleware (`rls.middleware.ts`)

NestJS middleware that extracts the user ID from the JWT token and sets it in UserContext. Runs after authentication but before business logic.

**Registration:**
```typescript
// Registered in AppModule
consumer.apply(RlsMiddleware).forRoutes('*');
```

**Flow:**
1. Request comes in with JWT token
2. Authentication extracts user payload
3. RlsMiddleware sets `user.sub` in UserContext
4. All subsequent DB queries use this context

#### 3. PrismaService Extensions (`../prisma/prisma.service.ts`)

Extended PrismaService with RLS-aware transaction methods.

**Key Methods:**

**`forUser(userId, callback)`** - Execute queries for a specific user
```typescript
await prisma.forUser(userId, async (tx) => {
  const documents = await tx.document.findMany({
    where: { workspaceId }
  });
  // Only returns documents from user's workspaces
  return documents;
});
```

**`withCurrentUser(callback)`** - Execute queries using current user from context
```typescript
async getDocuments(workspaceId: string) {
  return this.prisma.withCurrentUser(async (tx) => {
    return tx.document.findMany({
      where: { workspaceId }
    });
    // RLS automatically filters by user's workspace membership
  });
}
```

**`withoutRls(callback)`** - Bypass RLS (DANGEROUS - use with caution)
```typescript
// Only for Public API with token validation
async searchPublic(token: string, query: string) {
  // First validate token
  const publicLink = await this.validateToken(token);

  // Then bypass RLS for public access
  return this.prisma.withoutRls(async (tx) => {
    return tx.document.findMany({
      where: { workspaceId: publicLink.workspaceId }
    });
  });
}
```

#### 4. RlsBypassService (`rls-bypass.service.ts`)

Dedicated service for bypassing RLS in controlled scenarios. Provides explicit documentation about when bypass is appropriate.

**Use Cases:**
- Public API endpoints (with token-based authorization)
- System background jobs requiring full access
- Administrative operations (with proper authorization)

**Security Warning:** This service should NEVER be used in regular user-facing endpoints as it bypasses workspace isolation.

## Database Integration

The RLS implementation works with PostgreSQL Row Level Security policies. The user context is set using the `set_config()` function:

```sql
SELECT set_config('app.current_user_id', 'user-id', true);
```

The `true` parameter ensures the setting is transaction-scoped, preventing context leakage between requests.

## Request Flow

### Regular HTTP Request
```
1. Client → HTTP Request with JWT
2. JwtAuthGuard → Validates JWT, sets req.user
3. RlsMiddleware → Extracts user.sub, sets in UserContext
4. Controller → Calls service method
5. Service → Uses prisma.withCurrentUser(...)
6. Prisma → Sets user ID in DB session
7. Database → Applies RLS policies
8. Response → Only user's workspace data returned
```

### Background Job
```
1. Job Trigger → No HTTP request
2. Job Service → Uses userContext.runWithUser(userId, ...)
3. Nested Services → Use prisma.withCurrentUser(...)
4. Prisma → Sets user ID in DB session
5. Database → Applies RLS policies
```

### Public API
```
1. Client → HTTP Request with public token
2. PublicController → Validates token
3. Service → Uses prisma.withoutRls(...)
4. Database → RLS bypassed (token provides authorization)
```

## Testing

All components have comprehensive unit tests:

- `user.context.spec.ts` - AsyncLocalStorage isolation tests
- `rls.middleware.spec.ts` - Middleware JWT extraction tests
- `prisma.service.spec.ts` - Transaction wrapper tests
- `rls-bypass.service.spec.ts` - Bypass service tests

**Run tests:**
```bash
pnpm test -- --testPathPattern="rls"
```

## Security Considerations

### Defense in Depth
RLS provides a second layer of security after application-level authorization. Even if there's a bug in the application code, the database will enforce workspace isolation.

### Context Isolation
AsyncLocalStorage ensures each request maintains its own user context, preventing context leakage between concurrent requests.

### Transaction Scoped
Using `set_config(..., true)` ensures the user context is transaction-scoped and doesn't persist beyond the current transaction.

### Bypass Controls
The `withoutRls()` method is clearly marked as DANGEROUS and should only be used in specific, well-documented scenarios with proper authorization checks.

## Common Patterns

### Service Layer (Recommended)
```typescript
@Injectable()
export class DocumentService {
  constructor(private prisma: PrismaService) {}

  async getDocument(id: string) {
    // Always use withCurrentUser in services
    // This automatically uses the user from RlsMiddleware
    return this.prisma.withCurrentUser(async (tx) => {
      return tx.document.findUnique({ where: { id } });
    });
  }
}
```

### Background Jobs
```typescript
@Injectable()
export class DocumentProcessorService {
  constructor(
    private prisma: PrismaService,
    private userContext: UserContext,
  ) {}

  async processDocument(docId: string, userId: string) {
    // Explicitly set user context for background job
    return this.userContext.runWithUser(userId, async () => {
      // Services called here can use withCurrentUser
      await this.documentService.process(docId);
    });
  }
}
```

### Public API (Use with Caution)
```typescript
@Controller('public')
export class PublicController {
  constructor(private prisma: PrismaService) {}

  @Get(':token/search')
  async search(@Param('token') token: string) {
    // MUST validate token first
    const publicLink = await this.validateToken(token);

    // Then bypass RLS with validated authorization
    return this.prisma.withoutRls(async (tx) => {
      return tx.document.findMany({
        where: {
          workspaceId: publicLink.workspaceId,
          // Apply public link restrictions
        },
      });
    });
  }

  private async validateToken(token: string) {
    const link = await this.prisma.publicLink.findUnique({
      where: { token },
    });
    if (!link) throw new UnauthorizedException();
    return link;
  }
}
```

## Troubleshooting

### "User context not set" Error
**Cause:** RlsMiddleware not applied or `withCurrentUser()` called outside HTTP request context.

**Solution:**
- Ensure RlsMiddleware is registered in AppModule
- For background jobs, use `userContext.runWithUser()` or `prisma.forUser()`

### RLS Not Filtering Results
**Cause:** Database RLS policies not enabled or user context not set properly.

**Solution:**
- Verify RLS migration has been applied
- Check that `set_config()` is being called in transaction
- Verify RLS policies are enabled: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'`

### Context Leakage Between Requests
**Cause:** Not using AsyncLocalStorage properly or sharing context across requests.

**Solution:**
- Always use the provided methods (`withCurrentUser`, `forUser`, `runWithUser`)
- Never store user context in class properties or global variables

## Migration Notes

When migrating existing code to use RLS:

1. Wrap all database queries in `withCurrentUser()` in service methods
2. Use `forUser()` for background jobs and system operations
3. Use `withoutRls()` only for Public API with proper token validation
4. Test thoroughly to ensure RLS policies are working correctly

## Future Enhancements

- [ ] Integration tests with actual PostgreSQL RLS policies
- [ ] Performance benchmarks (RLS overhead)
- [ ] Monitoring/alerting for RLS bypass usage
- [ ] Audit logging for all RLS bypass operations
