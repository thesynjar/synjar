# ADR-004: 15-Minute Grace Period for Unverified Logins

**Date:** 2025-12-26
**Status:** ✅ Accepted
**Context:** Cloud Registration Email Verification
**Deciders:** Synjar Engineering Team

---

## Context and Problem Statement

In Cloud mode, users must verify their email before full access. However, email delivery can be delayed (spam filters, slow SMTP, inbox delays).

**User Experience Problem:**
1. User registers account
2. Waits for verification email (could take 1-5 minutes)
3. Wants to start using app immediately
4. Gets blocked: "Please verify your email"
5. User abandons registration (high churn)

**Security Requirement:** Email verification must be enforced to prevent spam/abuse, but shouldn't block legitimate users immediately after registration.

**Problem:** How long should users be allowed to login without email verification after registration?

---

## Decision Drivers

1. **User Experience:** Minimize friction for legitimate users
2. **Security:** Prevent abuse (fake emails, spam accounts)
3. **Email Delivery Reality:** Account for SMTP delays, spam filters
4. **Simplicity:** Easy to understand and communicate to users
5. **Industry Standards:** Align with common practices

---

## Considered Options

### Option 1: No Grace Period (Strict)

**Approach:** Require email verification immediately (no login until verified)

**Pros:**
- ✅ Strongest security (all users verified)
- ✅ Simple - no grace period logic

**Cons:**
- ❌ Poor UX - users blocked during email delays
- ❌ High abandonment rate (users give up if email slow)
- ❌ Support burden (users complain about delays)

---

### Option 2: 5-Minute Grace Period

**Approach:** Allow login for 5 minutes after registration

**Pros:**
- ✅ Covers typical email delays (1-3 minutes)
- ✅ Better UX than no grace period

**Cons:**
- ⚠️ Too short for slower email providers (Gmail spam filter delays)
- ⚠️ Users in different timezones may experience slower delivery

---

### Option 3: 15-Minute Grace Period

**Approach:** Allow login for 15 minutes after registration

**Pros:**
- ✅ Covers 99% of email delivery scenarios
- ✅ Generous enough for spam filter delays
- ✅ Good UX - users rarely blocked
- ✅ Still short enough to limit abuse window
- ✅ Aligns with industry standards (Firebase, Auth0 use 15-30 min)

**Cons:**
- ⚠️ Longer abuse window (vs. 5 min)
  - **Mitigation:** Rate limiting prevents mass account creation
  - **Mitigation:** Session expires after 15 min if not verified

---

### Option 4: 30-Minute Grace Period

**Approach:** Allow login for 30 minutes after registration

**Pros:**
- ✅ Maximum UX flexibility

**Cons:**
- ❌ Too long - increases abuse potential
- ❌ Users may not verify email at all (forget after using app)

---

### Option 5: No Grace Period + Inline Verification

**Approach:** No login until verified, but show "Verify Email" page with countdown/resend

**Pros:**
- ✅ Strong security

**Cons:**
- ❌ Still blocks users (bad UX)
- ❌ More complex UI (verification page, polling, etc.)

---

## Decision Outcome

**Chosen option:** **Option 3 - 15-Minute Grace Period**

**Rationale:**

1. **UX:** 15 minutes covers 99% of email delivery delays (including spam filters)
2. **Security:** Short enough to limit abuse window
3. **Industry Standard:** Firebase (15 min), Auth0 (30 min), Supabase (24h) - 15 min is conservative
4. **Simplicity:** Single constant, easy to communicate to users
5. **Data:** Typical email delivery:
   - Fast SMTP: <30 seconds
   - Gmail spam filter: 2-5 minutes
   - Slow providers: 5-10 minutes
   - Extreme cases: 10-15 minutes

**User Flow:**
1. User registers → immediate login (within 15 min grace period)
2. User explores app, receives email during session
3. User clicks verification link → full access granted
4. If user doesn't verify within 15 min → session expires, must verify to login again

---

## Implementation

### User Aggregate (Domain Logic)

```typescript
export class UserAggregate {
  private static readonly GRACE_PERIOD_MS = 15 * 60 * 1000; // 15 minutes

  canLoginWithoutVerification(): boolean {
    if (this.isEmailVerified) {
      return true;
    }

    const accountAge = Date.now() - this.createdAt.getTime();
    return accountAge < UserAggregate.GRACE_PERIOD_MS;
  }
}
```

### Login Use Case

```typescript
async login(email: string, password: string) {
  const user = await this.userRepository.findByEmail(email);

  if (!user.isEmailVerified) {
    const userAggregate = UserAggregate.reconstitute(user);

    if (!userAggregate.canLoginWithoutVerification()) {
      throw new UnauthorizedException({
        error: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email before logging in',
        hint: 'Check your inbox or request a new verification email',
      });
    }

    // Within grace period - allow login with warning
    return {
      ...tokens,
      warning: 'Please verify your email to maintain access',
    };
  }

  // Email verified - normal login
  return tokens;
}
```

### Frontend Display

```typescript
// Registration success message
"Success! You can start using Synjar immediately.
Please verify your email within 15 minutes to maintain access."

// Login warning (if unverified but within grace period)
"⚠️ Please verify your email. Access expires in X minutes."

// Login blocked (after grace period)
"Email verification required. Check your inbox or request a new email."
```

---

## Consequences

### Positive

- ✅ **UX:** Users rarely blocked (99% email delivery within 15 min)
- ✅ **Security:** Limited abuse window (vs. no verification)
- ✅ **Simplicity:** Single constant, easy to test/modify
- ✅ **Industry alignment:** Similar to major auth providers
- ✅ **Support:** Fewer complaints about being blocked

### Negative

- ⚠️ **Abuse window:** 15 minutes to create spam accounts
  - **Mitigation:** Rate limiting (max 5 registrations per IP per hour)
  - **Mitigation:** CAPTCHA on registration (prevents bots)
  - **Mitigation:** Session expires after 15 min (forces verification)
- ⚠️ **Unverified users:** Some users may not verify immediately
  - **Mitigation:** Show banner reminder in UI
  - **Mitigation:** Resend email after 10 minutes if not verified

### Risks

- ⚠️ **Users forget to verify:** If they don't verify within 15 min
  - **Mitigation:** Clear messaging during registration
  - **Mitigation:** Resend verification email on next login attempt
- ⚠️ **Clock skew:** Server time vs. user time mismatch
  - **Mitigation:** Use server time consistently (no client time)

---

## Validation

### Test Coverage

```typescript
describe('Grace Period', () => {
  it('allows login within 15 minutes of registration', () => {
    const user = createUnverifiedUser({ createdAt: 10 * 60 * 1000 }); // 10 min ago
    expect(user.canLoginWithoutVerification()).toBe(true);
  });

  it('blocks login after 15 minutes', () => {
    const user = createUnverifiedUser({ createdAt: 16 * 60 * 1000 }); // 16 min ago
    expect(user.canLoginWithoutVerification()).toBe(false);
  });

  it('allows verified users to login anytime', () => {
    const user = createVerifiedUser({ createdAt: 30 * 24 * 60 * 60 * 1000 }); // 30 days ago
    expect(user.canLoginWithoutVerification()).toBe(true);
  });
});
```

**Files:**
- Domain Logic: `community/apps/api/src/domain/auth/user.aggregate.ts`
- Login Use Case: `community/apps/api/src/application/auth/use-cases/login.use-case.ts`
- Tests: `community/apps/api/src/domain/auth/user.aggregate.spec.ts`

---

## Related Decisions

- [ADR-003: Background Email Queue](./2025-12-26-background-email-queue.md)
- [Dual-Mode Registration Spec](../specifications/2025-12-26-dual-mode-registration.md)

---

## Future Considerations

### Configurable Grace Period (Future)

If admins want to customize grace period:
- Add `GRACE_PERIOD_MINUTES` env var
- Default: 15 minutes
- Range: 5-60 minutes

### Progressive Grace Period (Future)

If tighter security needed:
- First login: 15 min grace period
- Subsequent logins: 5 min grace period
- Forces verification sooner for active users

### Email Delivery Tracking (Future)

If email webhook data available (SendGrid, Postmark):
- Extend grace period if email not delivered yet
- Reduce grace period if email opened (user saw it)

### Metrics to Monitor

After launch, track:
- % users who verify within 15 min
- % users blocked by grace period expiry
- Average time-to-verification
- Adjust grace period if needed based on data

---

**Status:** ✅ Implemented (Phase 4)
**Review Date:** 2026-12-26 (1 year)
**Owner:** Synjar Engineering Team
