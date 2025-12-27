# ADR-2025-12-27: Reuse VerificationToken for Password Reset

## Status

Accepted

## Context

Password reset feature requires generating secure tokens for email-based password reset flow. We need to decide whether to:
1. Create a dedicated PasswordResetToken value object
2. Reuse existing VerificationToken value object

Both tokens serve similar purposes:
- Generated with secure random bytes (crypto.randomBytes)
- Format: 64-character hex string
- Lifecycle: generate → validate → expire → clear
- Used for email-based authentication flows (email verification, password reset)

## Decision

Reuse the existing VerificationToken value object for password reset tokens.

## Rationale

- **DRY Principle:** VerificationToken already implements secure token generation (crypto.randomBytes(32) → 64-char hex). Avoid duplication of cryptographic logic.
- **Consistent Format:** Same token format is appropriate and sufficient for both email verification and password reset use cases.
- **Single Point of Maintenance:** One implementation to audit and maintain for token generation security.
- **Proven Implementation:** VerificationToken is already battle-tested in the registration flow.
- **Domain Parity:** Both tokens are semantically similar (one-time use, email-based authentication), so using the same value object maintains domain coherence.

## Consequences

### Positive
- **No Code Duplication:** Single token generation mechanism across authentication flows
- **Security Consistency:** Same cryptographic strength for both email verification and password reset
- **Maintainability:** Bug fixes and security improvements to token generation benefit both features
- **Simpler Codebase:** Fewer classes to understand and maintain
- **Consistent Naming:** User and Invitation aggregates use VerificationToken; now Registration context uses it uniformly

### Negative
- **Less Semantic Clarity:** Token type (email verification vs. password reset) is not immediately obvious from the type name alone. Domain context determines usage.
- **Future Extensibility:** If password reset tokens need special handling (e.g., different format, stricter validation, type-specific logging), we may need to introduce inheritance or a wrapper later.
- **Logging Challenges:** Both tokens need PII protection in logs, but distinguishing failure reasons requires additional context.

## Alternatives Considered

### 1. Create PasswordResetToken Value Object
- **Pros:** More semantic clarity; token type obvious from type name
- **Cons:** Code duplication of crypto.randomBytes logic; harder to audit; violates DRY

### 2. Generic Token Base Class
- **Pros:** Shared crypto, extensible
- **Cons:** Adds complexity; inheritance over composition; overkill for current needs

## Mitigation Strategies

1. **Documentation:** @see references in password reset domain events and use cases link to this ADR
2. **Clear Naming:** Method names are explicit: `requestPasswordReset()`, `resetPassword()` clarify the token's purpose
3. **Domain Events:** `PasswordResetRequestedEvent` and `PasswordResetEvent` make the context clear
4. **Future Proofing:** If differentiation becomes needed, introduce a `TokenType` enum or `PasswordResetToken extends VerificationToken`

## Related Decisions

- ADR-2025-12-25: Signed URLs for Public File Access (token generation security approach)
- Specification: docs/specifications/2025-12-27-password-reset.md

## Related Code

- VerificationToken: community/apps/api/src/domain/auth/value-objects/verification-token.value-object.ts
- Password Reset Use Cases: community/apps/api/src/application/auth/use-cases/{forgot-password,reset-password}.use-case.ts
- User Aggregate: community/apps/api/src/domain/auth/user.aggregate.ts (requestPasswordReset, resetPassword methods)

## Implementation Notes

- VerificationToken is instantiated with crypto.randomBytes(32).toString('hex') for password reset tokens
- Database stores password reset tokens in User.passwordResetToken field (indexed for performance)
- Token expiration is enforced at the application layer (User.passwordResetSentAt + 1 hour TTL)
- No additional wrapper or factory needed; VerificationToken.create() is sufficient
