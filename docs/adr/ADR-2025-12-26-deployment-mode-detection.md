# ADR-001: Deployment Mode Detection Strategy

**Date:** 2025-12-26
**Status:** ✅ Accepted
**Context:** Dual-Mode Registration (Cloud + Self-hosted)
**Deciders:** Synjar Engineering Team

---

## Context and Problem Statement

Synjar Enterprise supports two deployment modes:
- **Cloud (SaaS):** Multi-tenant, public registration, email verification required
- **Self-hosted (Community):** Single-tenant, first user admin, email verification optional

The system needs a reliable way to detect which mode it's running in to:
1. Enable/disable features (public registration, email verification, billing)
2. Apply different security policies (rate limiting, grace periods)
3. Configure infrastructure (SMTP requirements, Stripe integration)

**Problem:** How should the system detect deployment mode?

---

## Decision Drivers

1. **Reliability:** Mode detection must be 100% accurate (wrong mode = broken UX or security issues)
2. **Simplicity:** Developers should easily understand and configure the mode
3. **Fail-safe:** Default mode should be the most restrictive (security-first)
4. **Developer Experience:** Local development should work without complex setup
5. **Flexibility:** Support both explicit configuration and auto-detection

---

## Considered Options

### Option 1: Explicit-Only Configuration

**Approach:** Require `DEPLOYMENT_MODE=cloud|self-hosted` env var

**Pros:**
- ✅ 100% explicit - no surprises
- ✅ Easy to understand
- ✅ No auto-detection logic complexity

**Cons:**
- ❌ Forces developers to set env var for local dev
- ❌ No convenience for Cloud (always has Stripe, could auto-detect)
- ❌ Breaks if env var not set

---

### Option 2: Auto-Detection Only

**Approach:** Detect mode from environment indicators (e.g., `STRIPE_SECRET_KEY` exists → cloud)

**Pros:**
- ✅ Convenient for developers (no extra config)
- ✅ Works out-of-box for Cloud (Stripe always present)

**Cons:**
- ❌ Magic behavior - hard to debug
- ❌ No override mechanism if auto-detection is wrong
- ❌ Couples deployment mode to specific services (Stripe)

---

### Option 3: Hybrid (Explicit > Auto-detect > Default)

**Approach:** Priority chain:
1. If `DEPLOYMENT_MODE` set → use explicit value
2. Else if `STRIPE_SECRET_KEY` exists → cloud
3. Else → default to self-hosted

**Pros:**
- ✅ Best of both worlds (explicit when needed, auto when convenient)
- ✅ Fail-safe default (self-hosted = more restrictive)
- ✅ Cloud auto-detects (Stripe always present in production)
- ✅ Self-hosted works without config (default)
- ✅ Override available for edge cases

**Cons:**
- ⚠️ More complex logic (3 paths instead of 1)
- ⚠️ Auto-detection couples to Stripe (but acceptable - Cloud always has Stripe)

---

### Option 4: Config File

**Approach:** Read mode from `config.json` or similar

**Pros:**
- ✅ Centralized configuration

**Cons:**
- ❌ Requires file management (not 12-factor compliant)
- ❌ Harder to deploy (file must exist before app starts)
- ❌ Not container-friendly

---

## Decision Outcome

**Chosen option:** **Option 3 - Hybrid (Explicit > Auto-detect > Default)**

**Rationale:**

1. **Production reliability:** Explicit `DEPLOYMENT_MODE=cloud` in production removes any ambiguity
2. **Developer convenience:** Local dev defaults to self-hosted (no setup required)
3. **Cloud auto-detection:** Stripe integration always present → auto-detects cloud mode
4. **Fail-safe:** Default self-hosted is more restrictive (public registration disabled, SMTP optional)
5. **12-factor compliance:** Environment variables only

---

## Implementation

### Detection Logic

```typescript
export class DeploymentConfig {
  private static cachedMode: 'cloud' | 'self-hosted' | null = null;

  static getMode(): 'cloud' | 'self-hosted' {
    if (this.cachedMode) {
      return this.cachedMode;
    }

    const explicitMode = process.env.DEPLOYMENT_MODE;

    // 1. Explicit mode (recommended for production)
    if (explicitMode === 'cloud' || explicitMode === 'self-hosted') {
      this.cachedMode = explicitMode;
      return explicitMode;
    }

    // 2. Auto-detect from STRIPE_SECRET_KEY (Cloud convenience)
    if (process.env.STRIPE_SECRET_KEY) {
      this.cachedMode = 'cloud';
      return 'cloud';
    }

    // 3. Default to self-hosted (fail-safe)
    this.cachedMode = 'self-hosted';
    return 'self-hosted';
  }
}
```

### Configuration Examples

**Cloud (Production) - Explicit:**
```bash
DEPLOYMENT_MODE=cloud
STRIPE_SECRET_KEY=sk_live_xxx
SMTP_HOST=smtp.sendgrid.net
```

**Cloud (Staging) - Auto-detect:**
```bash
# No DEPLOYMENT_MODE set
STRIPE_SECRET_KEY=sk_test_xxx  # → Auto-detects cloud
SMTP_HOST=smtp.sendgrid.net
```

**Self-hosted (Production) - Default:**
```bash
# No DEPLOYMENT_MODE set
# No STRIPE_SECRET_KEY
# → Defaults to self-hosted
DATABASE_URL=postgresql://...
```

**Self-hosted (Local Dev) - Default:**
```bash
# No config needed
# → Defaults to self-hosted
```

---

## Consequences

### Positive

- ✅ **Zero config for local dev** - defaults to self-hosted
- ✅ **Cloud auto-detects** - Stripe presence indicates SaaS
- ✅ **Explicit override available** - set `DEPLOYMENT_MODE` if needed
- ✅ **Fail-safe default** - self-hosted (more restrictive) if unsure
- ✅ **Performance** - cached after first call (no repeated env reads)

### Negative

- ⚠️ **Coupling to Stripe** - Cloud auto-detection relies on Stripe presence
  - **Mitigation:** Acceptable - Cloud always uses Stripe for billing
  - **Alternative:** If future Cloud without Stripe needed → use explicit mode
- ⚠️ **Cache invalidation** - env var changes at runtime won't be detected
  - **Mitigation:** Immutable env vars in production (containers restart on config change)
  - **Testing:** `resetCache()` method available for tests

### Risks

- ⚠️ **Misconfiguration:** If Cloud deployed without `DEPLOYMENT_MODE` or `STRIPE_SECRET_KEY`
  - **Mitigation:** Startup validation in Phase 3 (Cloud mode requires SMTP)
  - **Monitoring:** Log detected mode on startup

---

## Validation

### Test Coverage

- ✅ Explicit mode (cloud) → returns 'cloud'
- ✅ Explicit mode (self-hosted) → returns 'self-hosted'
- ✅ Auto-detect (STRIPE_SECRET_KEY present) → returns 'cloud'
- ✅ Default (no indicators) → returns 'self-hosted'
- ✅ Cache mechanism → same result on multiple calls

**Files:**
- Implementation: `community/apps/api/src/infrastructure/config/deployment.config.ts`
- Tests: `community/apps/api/src/infrastructure/config/deployment.config.spec.ts` (10 tests, 94% coverage)

---

## Related Decisions

- [Dual-Mode Registration Spec](../specifications/2025-12-26-dual-mode-registration.md)
- [ecosystem.md - Deployment Modes](../ecosystem.md#1-deployment-modes)

---

## Future Considerations

### Multi-Region Cloud (Future)

If Synjar deploys to multiple regions (US, EU):
- **Option A:** Keep single `cloud` mode, use `REGION` env var
- **Option B:** Add modes: `cloud-us`, `cloud-eu`

**Recommendation:** Option A (region is orthogonal to deployment mode)

### Serverless Deployment (Future)

If Synjar adds serverless mode (AWS Lambda, Vercel):
- **Option A:** Add `serverless` mode
- **Option B:** Treat as Cloud with special config

**Recommendation:** Option B (serverless = Cloud variant)

---

**Status:** ✅ Implemented (Phase 1)
**Review Date:** 2026-12-26 (1 year)
**Owner:** Synjar Engineering Team
