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

#### 4. Public API Token Lookup (SQL SECURITY DEFINER)

For public API endpoints that need to validate tokens without user context, we use
a PostgreSQL SECURITY DEFINER function that safely bypasses RLS for the specific
token lookup operation.

```typescript
// In PublicLinkRepository - uses lookup_public_link_by_token() function
async findByTokenWithWorkspace(token: string): Promise<PublicLinkWithWorkspace | null> {
  const results = await this.prisma.$queryRaw<Array<{...}>>`
    SELECT * FROM lookup_public_link_by_token(${token})
  `;
  // Map results to domain model...
}
```

**Security Notes:**
- The SECURITY DEFINER function runs with elevated privileges
- The function only allows lookup by cryptographically secure token (not enumerable)
- After token validation, subsequent queries use `forWorkspace()` with the resolved workspaceId

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
2. PublicController → Calls service.validateToken(token)
3. Repository → Uses $queryRaw with lookup_public_link_by_token() (SECURITY DEFINER)
4. Database → Function bypasses RLS to find token
5. Service → Uses forWorkspace(workspaceId) for subsequent queries
6. Database → RLS enforced with resolved workspace context
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

### Secure Public Access
For public API endpoints (like PublicLink token validation), we use PostgreSQL SECURITY DEFINER functions
instead of application-level RLS bypass. This provides a more controlled, auditable approach where the
bypass is limited to a specific operation (token lookup) rather than arbitrary queries.

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

### Public API (Token-Based Access)
```typescript
@Controller('public')
export class PublicController {
  constructor(
    private prisma: PrismaService,
    private publicLinkService: PublicLinkService,
  ) {}

  @Get(':token/search')
  async search(@Param('token') token: string, @Query() dto: PublicSearchDto) {
    // validateToken uses SECURITY DEFINER function to lookup token
    // This safely bypasses RLS for the specific token lookup operation
    const publicLink = await this.publicLinkService.validateToken(token);

    // After validation, use forWorkspace() for RLS-protected queries
    return this.prisma.forWorkspace(publicLink.workspaceId, async (tx) => {
      return tx.document.findMany({
        where: {
          // Apply public link restrictions
          processingStatus: 'COMPLETED',
          verificationStatus: 'VERIFIED',
        },
      });
    });
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
2. Use `forUser()` for background jobs with user context
3. Use `forWorkspace()` for scheduler/background jobs per workspace
4. For public API token lookups, use SQL SECURITY DEFINER functions (see `lookup_public_link_by_token()`)
5. Test thoroughly to ensure RLS policies are working correctly

## Future Enhancements

- [x] Integration tests with actual PostgreSQL RLS policies
- [x] Performance benchmarks (RLS overhead)
- [x] Removed withoutRls() in favor of SECURITY DEFINER functions
- [ ] Monitoring/alerting for privileged function usage
