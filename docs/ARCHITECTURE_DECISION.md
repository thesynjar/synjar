# Synjar - Architecture Decision

**Date:** 2025-12-23
**Status:** Approved

---

## Context

We have several projects/products:

| Project | Description | Status |
|---------|-------------|--------|
| **hotelb2b** | B2B offer creation tool for hotels | Production |
| **core-hotelware** | PMS/RMS/CM/Frontdesk ecosystem | In development |
| **synjar** | RAG/Knowledge Base | In planning |

hotelb2b already contains SaaS infrastructure:
- Tenant management
- Subscription system (Stripe)
- Billing & Invoicing
- Multi-tenancy

Question: **Where to place Synjar?**

---

## Options

### Option A: Synjar as a hotelb2b module

```
hotelb2b/
├── apps/
│   ├── api/
│   │   └── modules/
│   │       ├── offers/        # existing
│   │       ├── subscriptions/ # existing
│   │       └── knowledge/     # NEW - Synjar
│   └── web/
│       └── features/
│           ├── offers/
│           └── knowledge/     # NEW
└── ...
```

**Pros:**
- Quick start - SaaS infrastructure ready
- Single repository
- Shared codebase

**Cons:**
- Synjar is too different from B2B offers
- Hard to sell separately
- Coupling with hotelb2b

**Assessment:** ❌ Not recommended

---

### Option B: Synjar as a standalone product

```
synjar/                   # separate repo
├── apps/
│   ├── api/             # Backend (NestJS)
│   └── web/             # Frontend (React)
├── infrastructure/
│   ├── docker/
│   └── kubernetes/
└── docs/

# Synjar has its OWN subscription/tenant system
# Completely independent from hotelb2b
```

**Pros:**
- Full independence
- Easy to sell separately
- Own technology stack

**Cons:**
- Duplication of SaaS infrastructure (subscriptions, billing, tenants)
- More maintenance work
- Two billing systems to maintain

**Assessment:** ⚠️ Possible, but expensive

---

### Option C: Core-SaaS as a licensing layer (RECOMMENDED)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SaaS ARCHITECTURE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CORE-SAAS (extracted from hotelb2b or new)                                 │
│  ─────────────────────────────────────────────                              │
│  Responsibilities:                                                           │
│  • Tenant registry (who is a customer)                                      │
│  • Subscription management (Stripe integration)                             │
│  • Product licensing (which products tenant has)                            │
│  • Billing & Invoicing                                                      │
│  • Admin panel                                                               │
│                                                                              │
│  Does NOT contain product business logic!                                   │
│                                                                              │
│           │                    │                    │                       │
│           │ GET /license       │ GET /license       │ GET /license          │
│           │ (token check)      │ (token check)      │ (token check)         │
│           ▼                    ▼                    ▼                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ SYNJAR          │  │ HOTELB2B        │  │ CORE HOTELWARE  │             │
│  │ (separate repo) │  │ (separate repo) │  │ (separate repo) │             │
│  │                 │  │                 │  │                 │             │
│  │ • RAG API       │  │ • B2B Offers    │  │ • PMS           │             │
│  │ • KB Management │  │ • PDF export    │  │ • Frontdesk     │             │
│  │ • Embeddings    │  │ • Analytics     │  │ • RMS           │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**How it works:**

1. **Core-SaaS** stores information:
   - Tenant "Acme Corp" has license for: hotelb2b, synjar
   - Tenant "Company XYZ" has license for: synjar (only)

2. **Products** check license at startup / per-request:
   ```typescript
   // In Synjar
   const license = await coreSaas.checkLicense(tenantId, 'synjar');
   if (!license.valid) throw new UnauthorizedException();
   ```

3. **Deployment options:**
   - **Cloud (managed):** checks license online in core-saas
   - **Self-hosted:** checks license online in core-saas
   - **On-premise:** offline license key (cryptographically signed)

**Pros:**
- Single billing platform for all products
- Products are independent
- Easy to sell separately or in bundles
- Can deploy each product separately
- Supports on-premise with offline license

**Cons:**
- Need to extract core-saas from hotelb2b (or build from scratch)
- Additional dependency (products depend on core-saas)

**Assessment:** ✅ RECOMMENDED

---

## Decision: Option C

### Phase 1: Synjar as standalone (MVP)

Initially we build Synjar as a **completely standalone** product:

```
synjar/community/
├── apps/
│   ├── api/              # Backend (NestJS)
│   │   ├── src/
│   │   │   ├── auth/     # Simple JWT auth
│   │   │   ├── tenants/  # Multi-tenant (tenant_id in every table)
│   │   │   ├── knowledge/ # Core RAG logic
│   │   │   └── api/      # REST endpoints
│   │   └── ...
│   └── web/              # React frontend
│       └── ...
├── docker-compose.yml
└── ...
```

**MVP has no integration with core-saas** - it has its own simple auth/tenant system.

### Phase 2: Extract Core-SaaS

When Synjar is ready and we want to sell it, we extract core-saas:

1. Extract from hotelb2b:
   - Tenant registry
   - Subscription management
   - Billing
   - Admin panel

2. Build license API:
   ```
   GET /api/v1/license/check
   {
     "tenant_id": "...",
     "product": "synjar"
   }

   Response:
   {
     "valid": true,
     "plan": "professional",
     "features": ["rag", "verified_kb", "api_access"],
     "expires_at": "2025-12-31"
   }
   ```

3. Integrate products with core-saas:
   - hotelb2b → checks license in core-saas
   - synjar → checks license in core-saas
   - core-hotelware → checks license in core-saas

### Phase 3: Integrations between products

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INTEGRATIONS                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Core Hotelware (Frontdesk)                                                 │
│         │                                                                    │
│         │ RAG query (per-request)                                           │
│         ▼                                                                    │
│  Synjar                                                                      │
│         │                                                                    │
│         │ License check (cached)                                            │
│         ▼                                                                    │
│  Core-SaaS                                                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

Frontdesk integrates with Synjar through API:
- Frontdesk is a client of Synjar
- Synjar doesn't know it's being used by Frontdesk
- Loose coupling

---

## Action Plan

### Now (Synjar MVP) - COMPLETED

1. ✅ Built NestJS backend with:
   - `/api/v1/documents` - Document CRUD
   - `/api/v1/search` - RAG search
   - JWT auth
   - Multi-tenant (workspace isolation)
2. ✅ PostgreSQL + pgvector for vector search
3. ✅ OpenAI embeddings (text-embedding-3-small)
4. Frontend (React) - In progress

### Later (Phase 2+)

1. Extract core-saas from hotelb2b
2. Add Synjar integration with core-saas
3. Add Frontdesk integration with Synjar

---

## Tech Stack Decisions

| Component | Decision | Rationale |
|-----------|----------|-----------|
| Backend | NestJS (TypeScript) | Consistent with hotelb2b, easier core-saas extraction |
| Vector DB | PostgreSQL + pgvector | Simpler stack, single DB |
| Embeddings | OpenAI text-embedding-3-small | Better quality, managed service |
| File Storage | Backblaze B2 | Cost-effective, S3-compatible |

---

## Summary

**Decision:** Synjar as standalone product (Option C)

**Rationale:**
1. Can be sold separately (not just for hotels)
2. Can be self-hosted / on-premise
3. Loose coupling with core-hotelware
4. Future integration through core-saas (license server)

**Next steps:**
1. ✅ Complete MVP backend
2. Build MVP frontend (React)
3. Integrate with Frontdesk through API
