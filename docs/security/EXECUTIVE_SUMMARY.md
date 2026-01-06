# Multi-Tenant Security - Executive Summary

**Project:** Synjar
**Date:** 2025-12-25
**Status:** Proposal
**Audience:** Tech leads, stakeholders, investors

---

## The Challenge

Synjar is an **open-source multi-tenant application** with RAG (Retrieval Augmented Generation) functionality. We face a unique challenge:

> **How do we protect customer data when the source code is public?**

The traditional "security through obscurity" approach doesn't work in open-source. We need **security through architecture**.

---

## Our Approach: Defense in Depth

Instead of relying on a single layer of protection, we implement a **multi-layered strategy**:

```
┌─────────────────────────────────────────────┐
│ Layer 1: Network                           │  ← WAF, DDoS protection
├─────────────────────────────────────────────┤
│ Layer 2: Application                       │  ← Guards, input validation
├─────────────────────────────────────────────┤
│ Layer 3: Database                          │  ← Row-Level Security (RLS)
├─────────────────────────────────────────────┤
│ Layer 4: Encryption                        │  ← At rest & in transit
└─────────────────────────────────────────────┘
```

**Key principle:** Even if an attacker bypasses one layer, the others will stop them.

---

## Core Security Mechanisms

### 1. Row-Level Security (RLS) in PostgreSQL

**What is it?**
Database-level isolation - each user sees only their own data, regardless of application code.

**How does it work?**

```sql
-- Policy: User sees only their workspaces
CREATE POLICY workspace_isolation ON "Workspace"
  USING (
    id IN (SELECT workspace_ids WHERE user_id = current_user_id)
  );
```

**Why is it important?**
- Even with a code bug (SQL injection, logic error), PostgreSQL **will not return** data from other workspaces
- Defense in depth: application + database
- Compliance-ready (GDPR, SOC2)

**Example:**

```typescript
// Even if a developer forgets validation:
const documents = await prisma.document.findMany();

// PostgreSQL automatically filters results:
// SELECT * FROM "Document" WHERE workspaceId IN (user's workspaces)
```

---

### 2. Plugin Architecture (Open Core)

**Problem:** Admin/billing code can expose vulnerabilities.

**Solution:** Separation of open-source core from closed-source enterprise features.

```
synjar/
├── community/               # Open-source (BSL 1.1)
│   ├── auth/
│   ├── documents/
│   └── search/
│
└── @synjar/enterprise/      # Closed-source (private npm)
    ├── tenant-admin/
    ├── billing/
    └── analytics/
```

**Benefits:**
- Community gets full RAG functionality
- Admin features remain private
- Easier security audits (smaller attack surface in open-source)

**Industry examples:**
- GitLab: `ee/` folder in private repo
- Supabase: Cloud-only admin panel
- Sentry: Plugin-based architecture

---

### 3. License Validation

**How do we protect enterprise features in open-source?**

```typescript
@Post('admin/tenants')
@EnterpriseFeature('TENANT_MANAGEMENT')  // Guard checks license
async createTenant(@Body() dto: CreateTenantDto) {
  // Code visible in open-source, but requires valid license key
}
```

**License server (closed-source):**
- Validates license key
- Returns available features
- Re-validation every 24h (offline grace period)

**Effect:** Code is transparent (community audits), but doesn't work without a valid license.

---

## Attack Prevention

### Tenant Enumeration

**Attack:** Attacker tries to guess workspace IDs.

**Mitigation:**
1. **Uniform responses** (always 404, not 403)
2. **Opaque IDs** (nanoid instead of UUID)

```typescript
// ✅ GOOD: Uniform response
const workspace = await this.findForUser(id, userId);
if (!workspace) {
  throw new NotFoundException('Workspace not found');  // Doesn't reveal existence
}

// ❌ BAD: Leaks existence
if (!workspace) throw new NotFoundException();
if (!member) throw new ForbiddenException();  // Different codes = leak
```

---

### SQL Injection

**Attack:** Query manipulation through user input.

**Mitigation:**
1. **Prisma** (parameterized queries)
2. **RLS** (blocks cross-tenant access even with injection)

```typescript
// ✅ GOOD: Prisma escapes automatically
const docs = await prisma.document.findMany({
  where: { title: { contains: userQuery } }
});

// ❌ BAD: SQL injection vulnerability
const docs = await prisma.$queryRawUnsafe(`
  SELECT * FROM "Document" WHERE title LIKE '%${userQuery}%'
`);
```

**Even if the attack succeeds:**
RLS limits results to the user's workspaces → no cross-tenant leak.

---

### Data Leakage Between Tenants

**Attack:** Bug in code allows cross-tenant access.

**Mitigation:**
1. **Guards** (check membership before operation)
2. **RLS** (backup - blocks at DB level)

```typescript
@Get('workspaces/:workspaceId/documents')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)  // Layer 2: Application
async listDocuments(@Param('workspaceId') id: string) {
  // Layer 3: RLS enforces isolation
  return this.documentService.findAll(id);
}
```

---

## Implementation Roadmap

### Phase 1: MVP Security (2 weeks)

**Goal:** Minimum viable security for public launch.

**Deliverables:**
- ✅ RLS enabled on all tenant tables
- ✅ Guards enforced (JwtAuthGuard, WorkspaceAccessGuard)
- ✅ Input validation (DTOs with class-validator)
- ✅ Rate limiting (DoS protection)
- ✅ Security tests (90%+ coverage)
- ✅ CI/CD scans (npm audit, Snyk, CodeQL)

**Effort:** 12 developer-days

---

### Phase 2: Post-MVP (3 weeks)

**Goal:** Enterprise-grade security.

**Deliverables:**
- Enterprise plugin architecture
- License validation server
- Audit logging (compliance)
- Per-workspace rate limiting
- Encryption (at rest & in transit)
- Security monitoring (Sentry, alerts)

**Effort:** 20 developer-days

---

### Phase 3: Scale & Compliance (Q2 2026)

**Goal:** SOC2 compliance, 1000+ users.

**Deliverables:**
- Admin microservice (separate from user API)
- Secrets management (HashiCorp Vault)
- Quarterly penetration tests
- Bug bounty program (HackerOne)

**Effort:** 30 developer-days

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **RLS bypass** | Low | Critical | Comprehensive tests, code reviews |
| **SQL injection** | Medium | High | Prisma (parameterized queries) + RLS |
| **Dependency vulns** | Medium | High | Snyk scans, monthly updates |
| **Secrets leak** | Low | Critical | Pre-commit hooks (git-secrets) |
| **DoS attack** | Medium | Medium | Rate limiting (100 req/min) |

---

## Security Metrics

### Success Criteria

| Metric | Target | Tracking |
|--------|--------|----------|
| Security test coverage | > 90% | Jest reports |
| Critical vulnerabilities | 0 | Snyk dashboard |
| RLS enforcement | 100% tenant tables | Manual audit |
| Incident response time | < 24h | Incident logs |

### Monthly Review

- Dependency audit (pnpm audit, Snyk)
- Security test coverage report
- Incident response drill (simulation)
- Team security awareness quiz

---

## Compliance Readiness

### GDPR

- ✅ User data deletion endpoint
- ✅ Data export endpoint
- ✅ Consent tracking
- ✅ RLS isolation (per-user data access)

### SOC2 (Future)

- Audit logging (all state-changing operations)
- Access control reviews (quarterly)
- Penetration testing (quarterly)
- Security awareness training (annual)

---

## Industry Benchmarks

**How do other open-source projects protect multi-tenancy?**

| Project | Strategy | Lessons Learned |
|---------|-----------|-----------------|
| **GitLab** | Open Core (`ee/` folder closed) | License-based features work |
| **Supabase** | Cloud-only admin | Self-hosted = product, Cloud = operations |
| **Sentry** | Plugin architecture | Clean separation via interfaces |
| **Metabase** | Feature flags + license server | Code transparency + license enforcement |

**Synjar approach:** Hybrid - open core + enterprise plugins + license validation.

---

## Cost-Benefit Analysis

### Costs

- **Development:** 32 developer-days (Phase 1 + 2)
- **Infrastructure:** License server (~$20/month)
- **Tooling:** Snyk Pro ($99/month), Sentry ($26/month)
- **Total (first year):** ~$3500 + developer time

### Benefits

- **Reduced breach risk:** Estimated cost of data breach: $150K+ (IBM Security Report)
- **Compliance:** SOC2 readiness = enterprise customers unlocked
- **Trust:** Open-source + security = community confidence
- **Competitive advantage:** Few RAG tools have proper multi-tenant isolation

**ROI:** Prevent just ONE data breach → saves 40x investment.

---

## Competitive Advantage

**Most open-source RAG tools lack proper security:**

| Feature | Knowledge Forge | Competitor A | Competitor B |
|---------|----------------|--------------|--------------|
| RLS isolation | ✅ | ❌ | ❌ |
| Plugin architecture | ✅ | Partial | ❌ |
| Audit logging | ✅ (Phase 2) | ❌ | ✅ |
| Security tests | ✅ (90%+) | Unknown | Partial |
| SOC2 ready | ✅ (Phase 3) | ❌ | ✅ |

**Differentiator:** "First open-source RAG platform with enterprise-grade multi-tenant security."

---

## Recommendations

### Immediate Actions (Week 1)

1. **Approve** Phase 1 implementation plan
2. **Assign** security champion (tech lead)
3. **Schedule** team training (2h workshop)
4. **Setup** CI/CD security scans (GitHub Actions)

### Short-term (Month 1-2)

1. **Implement** Phase 1 (RLS, guards, validation, tests)
2. **Launch** MVP with security-first approach
3. **Monitor** security metrics weekly
4. **Review** dependencies monthly

### Long-term (Quarter 1-2)

1. **Implement** Phase 2 (enterprise plugins, audit logging)
2. **Prepare** for SOC2 audit
3. **Launch** bug bounty program (HackerOne)
4. **Hire** dedicated security engineer (when >$1M ARR)

---

## Conclusion

**Synjar can be open-source and secure at the same time.**

Key elements:
- **RLS** as the foundation of isolation (defense in depth)
- **Plugin architecture** separates core from admin features
- **License validation** protects enterprise functionality
- **Comprehensive testing** ensures quality assurance

**Outcome:** The first open-source RAG platform with enterprise-grade security, ready for SOC2 compliance.

---

## Next Steps

- [ ] Review of this document by engineering team
- [ ] Approve implementation plan
- [ ] Assign security champion
- [ ] Start Phase 1 (Sprint 1-2)

---

**Questions?** Contact: engineering@synjar.com

**More details:**
- [Security Guidelines](./SECURITY_GUIDELINES.md)
- [Implementation Plan](./IMPLEMENTATION_PLAN.md)
- [Research Report](../research/2025-12-25-multi-tenant-security-in-open-source.md)
