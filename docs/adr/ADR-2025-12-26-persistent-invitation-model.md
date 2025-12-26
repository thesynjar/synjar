# ADR-002: Persistent Invitation Model

**Date:** 2025-12-26
**Status:** ✅ Accepted
**Context:** Self-hosted Workspace Invitations
**Deciders:** Synjar Engineering Team

---

## Context and Problem Statement

Self-hosted Synjar instances disable public registration after the first user (admin) creates their account. Additional users must be invited by the admin to join the workspace.

The system needs a mechanism for workspace admins to invite new users via email.

**Problem:** Should invitations be stateless (JWT-only) or persistent (database records)?

---

## Decision Drivers

1. **Security:** Ability to revoke invitations before they're accepted
2. **Auditability:** Track invitation lifecycle (sent, accepted, expired, revoked)
3. **User Experience:** Support resending invitations, tracking status
4. **Analytics:** Gather metrics on invitation acceptance rates
5. **Simplicity:** Minimize complexity while meeting requirements

---

## Considered Options

### Option 1: Stateless JWT-Only Invitations

**Approach:** Generate signed JWT containing invitation data, send in email link

**Pros:**
- ✅ Simple implementation - no database table needed
- ✅ Stateless - scales horizontally without shared state
- ✅ Self-contained - all data in token

**Cons:**
- ❌ Cannot revoke invitations once sent
- ❌ No audit trail (can't track invitation status)
- ❌ Cannot resend same invitation (new JWT each time)
- ❌ No expiration tracking (only at validation time)
- ❌ Limited to JWT max payload size
- ❌ No analytics on invitation usage

---

### Option 2: Persistent Database Records

**Approach:** Store invitations in `Invitation` table with status tracking

**Pros:**
- ✅ Can revoke invitations (update status to REVOKED)
- ✅ Full audit trail (PENDING → ACCEPTED/EXPIRED/REVOKED)
- ✅ Resend capability (same token, update sentAt timestamp)
- ✅ Analytics-friendly (query acceptance rates, time-to-accept)
- ✅ Explicit expiration tracking
- ✅ Can list all pending invitations for a workspace
- ✅ Better UX (admin can see invitation status)

**Cons:**
- ⚠️ More complex (requires database table, migration)
- ⚠️ Additional database queries (minimal overhead)

---

### Option 3: Hybrid (JWT + Database Lookup)

**Approach:** Store minimal record (email + status), use JWT for data

**Pros:**
- ✅ Revocable (check status in DB)
- ✅ Lighter DB records

**Cons:**
- ❌ Complexity of both approaches
- ❌ Still needs database table
- ❌ Harder to query/audit (data split between JWT and DB)

---

## Decision Outcome

**Chosen option:** **Option 2 - Persistent Database Records**

**Rationale:**

1. **Security:** Admins can revoke invitations if sent to wrong email or user no longer needed
2. **User Experience:** Admin dashboard can show all pending invitations with status
3. **Compliance:** Audit trail for user access (who invited whom, when)
4. **Analytics:** Track invitation effectiveness (acceptance rate, time-to-accept)
5. **Resend capability:** Users can request resend of same invitation link
6. **Minimal overhead:** Single table with indexes, negligible performance impact

The benefits of revocation, auditability, and UX far outweigh the small complexity increase.

---

## Implementation

### Database Schema

```prisma
model Invitation {
  id          String   @id @default(uuid())
  workspaceId String
  email       String
  role        Role     @default(MEMBER)

  token       String   @unique @db.VarChar(256)

  status      InvitationStatus @default(PENDING)
  acceptedAt  DateTime?        @db.Timestamptz
  revokedAt   DateTime?        @db.Timestamptz

  expiresAt   DateTime @db.Timestamptz
  createdAt   DateTime @default(now()) @db.Timestamptz
  createdById String

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  createdBy User      @relation("InvitationsCreated", fields: [createdById], references: [id])

  @@index([workspaceId])
  @@index([email])
  @@index([token])
  @@index([status])
  @@index([expiresAt])
}

enum InvitationStatus {
  PENDING
  ACCEPTED
  REVOKED
  EXPIRED
}
```

### Use Cases

**Send Invitation:**
1. Create invitation record (status: PENDING, expiresAt: +7 days)
2. Generate secure random token
3. Send email with invitation link
4. Return invitation ID to admin

**Accept Invitation:**
1. Lookup invitation by token
2. Validate: status = PENDING, not expired
3. Create user account (if doesn't exist)
4. Add user to workspace with specified role
5. Update invitation: status = ACCEPTED, acceptedAt = now()

**Revoke Invitation:**
1. Lookup invitation by ID
2. Validate: status = PENDING (can't revoke accepted/expired)
3. Update: status = REVOKED, revokedAt = now()

**List Invitations:**
1. Query invitations for workspace
2. Filter by status (PENDING, ACCEPTED, REVOKED, EXPIRED)
3. Return with creator, invitee email, timestamps

---

## Consequences

### Positive

- ✅ **Security:** Admins can revoke mistaken invitations
- ✅ **Auditability:** Full lifecycle tracking for compliance
- ✅ **UX:** Admin dashboard shows pending/accepted invitations
- ✅ **Analytics:** Measure invitation effectiveness
- ✅ **Resend:** Same token can be resent (no duplicate records)
- ✅ **Cleanup:** Expired invitations can be purged via cron job

### Negative

- ⚠️ **Complexity:** Requires database table and migration
  - **Mitigation:** Single table, straightforward schema
- ⚠️ **Performance:** Additional DB query on invitation acceptance
  - **Mitigation:** Indexed by token (O(1) lookup), minimal overhead
- ⚠️ **Storage:** Accumulates invitation records over time
  - **Mitigation:** Cron job to delete old ACCEPTED/EXPIRED (>90 days)

### Risks

- ⚠️ **Token security:** If token leaked, invitation can be hijacked
  - **Mitigation:**
    - Cryptographically secure random tokens (32 bytes)
    - Short expiration (7 days)
    - One-time use (status changes to ACCEPTED)
    - Optional: Rate limiting on acceptance endpoint

---

## Validation

### Test Coverage

- ✅ Create invitation → status PENDING
- ✅ Accept valid invitation → status ACCEPTED, user added to workspace
- ✅ Accept expired invitation → error
- ✅ Accept revoked invitation → error
- ✅ Accept same invitation twice → error (status already ACCEPTED)
- ✅ Revoke pending invitation → status REVOKED
- ✅ Revoke accepted invitation → error
- ✅ List invitations by workspace → returns all statuses
- ✅ Token uniqueness → duplicate token creation fails

**Files:**
- Schema: `community/apps/api/prisma/schema.prisma`
- Use Cases: `community/apps/api/src/application/auth/use-cases/accept-invite.use-case.ts`
- Tests: `community/apps/api/src/application/auth/auth.service.spec.ts`

---

## Related Decisions

- [ADR-001: Deployment Mode Detection](./2025-12-26-deployment-mode-detection.md)
- [Dual-Mode Registration Spec](../specifications/2025-12-26-dual-mode-registration.md)

---

## Future Considerations

### Bulk Invitations (Future)

If admins need to invite multiple users at once (CSV upload):
- **Option A:** Create multiple invitation records in transaction
- **Option B:** Single invitation record with multiple emails (JSON array)

**Recommendation:** Option A (one record per invitee for individual tracking)

### Invitation Templates (Future)

If custom invitation messages needed:
- Add `customMessage` text field to Invitation table
- Include in email template

### Invitation Expiration Cleanup

Implement cron job to auto-expire old invitations:
```typescript
// Run daily
async function expireOldInvitations() {
  await prisma.invitation.updateMany({
    where: {
      status: 'PENDING',
      expiresAt: { lt: new Date() }
    },
    data: {
      status: 'EXPIRED'
    }
  });
}
```

---

**Status:** ✅ Implemented (Phase 4)
**Review Date:** 2026-12-26 (1 year)
**Owner:** Synjar Engineering Team
