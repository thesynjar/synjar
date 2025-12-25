# Multi-Tenant Security - Executive Summary

**Project:** Synjar
**Date:** 2025-12-25
**Status:** Proposal
**Audience:** Tech leads, stakeholders, investors

---

## The Challenge

Synjar to **open-source aplikacja multi-tenant** z funkcjonalnością RAG (Retrieval Augmented Generation). Stoimy przed unikalnym wyzwaniem:

> **Jak chronić dane klientów, gdy kod źródłowy jest publiczny?**

Tradycyjne podejście "security through obscurity" nie działa w open-source. Potrzebujemy **security through architecture**.

---

## Our Approach: Defense in Depth

Zamiast polegać na jednej warstwie ochrony, implementujemy **wielowarstwową strategię**:

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

**Kluczowa zasada:** Nawet jeśli atakujący pokonuje jedną warstwę, pozostałe go zatrzymują.

---

## Core Security Mechanisms

### 1. Row-Level Security (RLS) w PostgreSQL

**Co to jest?**
Database-level isolation - każdy user widzi tylko swoje dane, niezależnie od kodu aplikacji.

**Jak działa?**

```sql
-- Policy: User widzi tylko swoje workspace'y
CREATE POLICY workspace_isolation ON "Workspace"
  USING (
    id IN (SELECT workspace_ids WHERE user_id = current_user_id)
  );
```

**Dlaczego to ważne?**
- Nawet przy błędzie w kodzie (SQL injection, logic error), PostgreSQL **nie zwróci** danych z innych workspace'ów
- Defense in depth: aplikacja + baza danych
- Compliance-ready (GDPR, SOC2)

**Przykład:**

```typescript
// Nawet jeśli developer zapomni walidacji:
const documents = await prisma.document.findMany();

// PostgreSQL automatycznie filtruje wyniki:
// SELECT * FROM "Document" WHERE workspaceId IN (user's workspaces)
```

---

### 2. Plugin Architecture (Open Core)

**Problem:** Kod admin/billing może ujawnić podatności.

**Rozwiązanie:** Separacja open-source core od closed-source enterprise features.

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

**Zalety:**
- Community dostaje pełną funkcjonalność RAG
- Admin features pozostają prywatne
- Łatwiejsze security audits (mniejsza powierzchnia ataku w open-source)

**Przykłady z industry:**
- GitLab: `ee/` folder w prywatnym repo
- Supabase: Cloud-only admin panel
- Sentry: Plugin-based architecture

---

### 3. License Validation

**Jak chronić enterprise features w open-source?**

```typescript
@Post('admin/tenants')
@EnterpriseFeature('TENANT_MANAGEMENT')  // Guard sprawdza license
async createTenant(@Body() dto: CreateTenantDto) {
  // Code visible w open-source, ale wymagany valid license key
}
```

**License server (closed-source):**
- Waliduje license key
- Zwraca dostępne features
- Re-walidacja co 24h (offline grace period)

**Efekt:** Kod jest transparentny (community audits), ale bez valid license nie działa.

---

## Attack Prevention

### Tenant Enumeration

**Atak:** Atakujący próbuje zgadnąć ID workspace'ów.

**Mitigacja:**
1. **Uniform responses** (zawsze 404, nie 403)
2. **Opaque IDs** (nanoid zamiast UUID)

```typescript
// ✅ GOOD: Uniform response
const workspace = await this.findForUser(id, userId);
if (!workspace) {
  throw new NotFoundException('Workspace not found');  // Nie ujawnia istnienia
}

// ❌ BAD: Leaks existence
if (!workspace) throw new NotFoundException();
if (!member) throw new ForbiddenException();  // Różne kody = leak
```

---

### SQL Injection

**Atak:** Manipulacja query przez user input.

**Mitigacja:**
1. **Prisma** (parametryzowane queries)
2. **RLS** (blokuje cross-tenant access nawet przy injection)

```typescript
// ✅ GOOD: Prisma escapes automatycznie
const docs = await prisma.document.findMany({
  where: { title: { contains: userQuery } }
});

// ❌ BAD: SQL injection vulnerability
const docs = await prisma.$queryRawUnsafe(`
  SELECT * FROM "Document" WHERE title LIKE '%${userQuery}%'
`);
```

**Nawet jeśli atak się powiedzie:**
RLS ogranicza wyniki do workspace'ów usera → brak cross-tenant leak.

---

### Data Leakage Between Tenants

**Atak:** Bug w kodzie pozwala na cross-tenant access.

**Mitigacja:**
1. **Guards** (sprawdzają membership przed operacją)
2. **RLS** (backup - blokuje na poziomie DB)

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

**Goal:** Minimum viable security dla public launch.

**Deliverables:**
- ✅ RLS enabled na wszystkich tenant tables
- ✅ Guards enforced (JwtAuthGuard, WorkspaceAccessGuard)
- ✅ Input validation (DTOs z class-validator)
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
- Admin microservice (oddzielny od user API)
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

**Jak inne open-source projekty chronią multi-tenancy?**

| Projekt | Strategia | Lessons Learned |
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

- **Reduced breach risk:** Szacowany koszt data breach: $150K+ (IBM Security Report)
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

**Synjar może być open-source i secure jednocześnie.**

Kluczowe elementy:
- **RLS** jako fundament izolacji (defense in depth)
- **Plugin architecture** separuje core od admin features
- **License validation** chroni enterprise funkcjonalność
- **Comprehensive testing** zapewnia quality assurance

**Outcome:** Pierwszy open-source RAG platform z enterprise-grade security, gotowy na SOC2 compliance.

---

## Next Steps

- [ ] Review tego dokumentu przez engineering team
- [ ] Approve implementation plan
- [ ] Assign security champion
- [ ] Start Phase 1 (Sprint 1-2)

---

**Questions?** Contact: engineering@synjar.com

**More details:**
- [Security Guidelines](./SECURITY_GUIDELINES.md)
- [Implementation Plan](./IMPLEMENTATION_PLAN.md)
- [Research Report](../research/2025-12-25-multi-tenant-security-in-open-source.md)
