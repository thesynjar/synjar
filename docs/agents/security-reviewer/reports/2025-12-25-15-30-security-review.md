# Security Review Report - 2025-12-25

## Context

### Analyzed Modules
- Husky git hooks (pre-commit, commit-msg)
- Commitlint configuration
- Docker configuration (apps/api/Dockerfile)
- Package dependencies (husky, commitlint)
- CapRover deployment configuration

### Related Documents Reviewed
- `/Users/michalkukla/development/synjar/community/CLAUDE.md` - Project structure and engineering principles
- `/Users/michalkukla/development/synjar/community/docs/ecosystem.md` - RAG architecture with RLS
- `.gitignore` - Sensitive file exclusions
- `apps/api/.env.example` - Configuration template

### Changes Overview
This review covers:
1. **Modified files (HEAD~1):**
   - `README.md` - Documentation update (paths correction)
   - `apps/api/Dockerfile` - Port change 3000 → 6200, ENV PORT=6200
   - `package.json` - Added husky, commitlint dependencies, "prepare" script
   - `pnpm-lock.yaml` - Dependency lockfile update

2. **Untracked files:**
   - `.husky/pre-commit` - Runs `pnpm test`
   - `.husky/commit-msg` - Runs `pnpm exec commitlint --edit $1`
   - `captain-definition` - CapRover deployment config
   - `commitlint.config.js` - Commitlint configuration

---

## 🟡 MEDIUM (fix in next iteration)

### [Dependency Vulnerabilities] Known CVEs in dependencies

**Issue:**
Three low-to-medium severity vulnerabilities detected via `pnpm audit`:

1. **tmp@0.0.33** (CVE-2025-54798, CVSS 2.5)
   - Path: `@nestjs/cli > inquirer > external-editor > tmp`
   - Vulnerability: Arbitrary file write via symbolic link `dir` parameter
   - Severity: LOW (CVSS 2.5)
   - Status: DevDependency only (@nestjs/cli)

2. **js-yaml@4.1.0** (CVE-2025-64718)
   - Path: `@nestjs/swagger > js-yaml`
   - Vulnerability: Prototype pollution via `__proto__`
   - Severity: MEDIUM
   - Impact: Server-side parsing of untrusted YAML (OpenAPI specs)
   - Patched: js-yaml 4.1.1+

3. **glob** (CVE-1109842)
   - Path: `@nestjs/cli > glob`
   - Vulnerability: (details truncated in audit output)
   - Status: DevDependency only

**Risk Assessment:**
- `tmp` and `glob`: DevDependency only, not in production runtime. Risk: MINIMAL
- `js-yaml`: Production dependency via @nestjs/swagger. Risk: LOW-MEDIUM
  - Swagger uses js-yaml for OpenAPI spec parsing
  - Not parsing user-provided YAML in this codebase
  - Attack vector limited to OpenAPI spec generation (controlled by developers)

**Recommendation:**
```bash
# Update @nestjs/swagger to latest version
pnpm update @nestjs/swagger

# Verify fix
pnpm audit

# If @nestjs/swagger doesn't update js-yaml, add resolution:
# In package.json:
{
  "pnpm": {
    "overrides": {
      "js-yaml": ">=4.1.1"
    }
  }
}
```

**Mitigation (if update blocked):**
- Server protected by default with `--disable-proto=delete` in Node.js 20+
- Current impact: MINIMAL (no user YAML parsing)
- Timeline: Fix in next sprint before production deployment

---

### [Docker Security] Missing USER directive (non-root container)

**Issue:**
`apps/api/Dockerfile` runs as root user by default.

**Current Dockerfile:**
```dockerfile
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=6200
# ... COPY commands ...
CMD ["node", "dist/main.js"]
```

**Risk:**
- Container runs as root (UID 0)
- If attacker gains RCE, they have root privileges in container
- Violates principle of least privilege

**Recommendation:**
```dockerfile
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=6200

# Add non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

COPY --from=builder --chown=nodejs:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/.pnpm ./node_modules/.pnpm
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma

# Switch to non-root user
USER nodejs

EXPOSE 6200
CMD ["node", "dist/main.js"]
```

**Impact:** MEDIUM - Defense in depth layer
**Timeline:** Implement before production deployment

---

## 🟢 LOW (recommendation)

### [Git Hooks] Command injection risk in husky hooks (theoretical)

**Issue:**
`.husky/commit-msg` uses shell variable `$1` without quotes:
```bash
pnpm exec commitlint --edit $1
```

**Risk Assessment:**
- Variable `$1` is controlled by Git (commit message file path)
- Git always passes safe file paths (e.g., `.git/COMMIT_EDITMSG`)
- Attack vector: Extremely low (attacker would need filesystem access to modify Git internals)
- Exploitability: VERY LOW

**Recommendation (best practice):**
```bash
# Quote shell variables
pnpm exec commitlint --edit "$1"
```

**Timeline:** Nice-to-have, not urgent

---

### [Docker] Port change 3000 → 6200 without documentation

**Issue:**
Port changed from 3000 to 6200 in Dockerfile, but:
- No security justification provided
- No update to reverse proxy/load balancer configs mentioned
- No documentation of why this specific port

**Risk:**
- Port 6200 is non-standard (not in /etc/services)
- Potential confusion for deployment teams
- No security issue per se, but operational risk

**Recommendation:**
- Document port selection reason in CHANGELOG or deployment docs
- Update any deployment guides to reference 6200
- Verify CapRover `captain-definition` uses correct port (currently uses Dockerfile EXPOSE, so auto-detected)

**Timeline:** Documentation update in next release

---

### [CapRover] Missing healthcheck endpoint configuration

**Issue:**
`captain-definition` is minimal:
```json
{
  "schemaVersion": 2,
  "dockerfilePath": "./apps/api/Dockerfile"
}
```

No healthcheck configuration specified.

**Risk:**
- CapRover may not properly detect container health
- Failed deployments may go undetected
- Rolling updates may route traffic to unhealthy containers

**Recommendation:**
Add healthcheck to `captain-definition`:
```json
{
  "schemaVersion": 2,
  "dockerfilePath": "./apps/api/Dockerfile",
  "healthCheck": {
    "path": "/health",
    "interval": 30000,
    "timeout": 5000,
    "retries": 3
  }
}
```

And implement `/health` endpoint in NestJS:
```typescript
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
```

**Timeline:** Implement before production deployment

---

## ✅ Positive Security Aspects

### 1. Excellent Secret Management
- `.gitignore` properly excludes `.env`, `.env.local`, `.env.*.local`
- Only `.env.example` files committed (verified via `git ls-files`)
- Actual `.env` files not tracked or staged
- `.env.seed` properly excluded from version control

### 2. Git Hooks Best Practices
- **Pre-commit hook** runs tests (`pnpm test`) - prevents broken code
- **Commit-msg hook** enforces conventional commits via commitlint
- Hooks are version-controlled (`.husky/` directory)
- Automatic setup via `prepare` script in package.json

### 3. Docker Multi-stage Build
- Minimal attack surface (only production files copied to runner stage)
- Separate builder stage (build artifacts not in final image)
- Using Alpine base image (smaller attack surface than full Node)
- Production dependencies only (devDependencies excluded)

### 4. Dependency Management
- `pnpm-lock.yaml` ensures reproducible builds
- `--frozen-lockfile` in Dockerfile (no surprise updates)
- Clear separation of dev vs production dependencies

### 5. Configuration Security
- No hardcoded secrets in committed code
- Environment variables properly templated in `.env.example`
- JWT_SECRET with clear warning to change in production
- Sensitive keys (OPENAI_API_KEY, B2 keys) use placeholder values

### 6. Architecture Security (from ecosystem.md review)
- Row Level Security (RLS) enforced at database level
- Multi-tenancy isolation (workspace-based)
- Defense in depth: Application + Database security layers
- Non-superuser database role for application runtime
- Public API with proper token validation before RLS bypass

### 7. Code Quality Gates
- Commitlint enforces conventional commits (better changelog, easier audits)
- Pre-commit tests prevent broken code from being committed
- Structured commit messages improve security incident tracking

---

## Summary

### Risk Distribution
- 🔴 CRITICAL: 0
- 🟠 HIGH: 0
- 🟡 MEDIUM: 2 (dependency CVEs, Docker non-root user)
- 🟢 LOW: 3 (shell quoting, port documentation, healthcheck)

### Overall Assessment
**SAFE TO PROCEED** with the following caveats:

1. **Before production deployment:**
   - Update js-yaml to 4.1.1+ (via @nestjs/swagger update)
   - Add USER directive to Dockerfile (non-root)
   - Add healthcheck endpoint and CapRover config

2. **Next iteration:**
   - Quote shell variables in git hooks
   - Document port change rationale

### Key Strengths
- No secrets leaked or exposed
- Excellent git hygiene (hooks, conventional commits)
- Strong architectural security (RLS, multi-tenancy)
- Proper environment variable handling
- Multi-stage Docker build with minimal attack surface

### Architectural Context (RAG System)
From ecosystem.md review:
- Project: Synjar Community - Self-hosted RAG backend
- Security model: Row Level Security (RLS) at PostgreSQL level
- Multi-tenancy: Workspace-based isolation
- External integrations: OpenAI embeddings, Backblaze B2 storage
- The changes reviewed (git hooks, Docker config) do NOT impact:
  - RLS enforcement
  - Authentication/Authorization flows
  - External API integrations
  - Data isolation between workspaces

---

## Recommended Actions

### Immediate (before merge)
None - changes are safe.

### Before Production Deployment
1. Update dependencies:
   ```bash
   pnpm update @nestjs/swagger
   pnpm audit
   ```

2. Add non-root user to Dockerfile (see recommendation above)

3. Implement healthcheck:
   - Add `/health` endpoint
   - Update `captain-definition`

### Next Sprint
1. Quote shell variables in `.husky/commit-msg`
2. Document port change (6200) in deployment guide
3. Consider adding Docker security scanning to CI/CD:
   ```bash
   docker scan synjar-api:latest
   ```

---

## Compliance Notes

### OWASP Top 10 Coverage
- ✅ A01: Broken Access Control - RLS enforces database-level isolation
- ✅ A02: Cryptographic Failures - Secrets in env vars, not in code
- ✅ A03: Injection - Prisma ORM, RLS policies prevent SQL injection
- 🟡 A04: Insecure Design - Docker runs as root (fix before prod)
- ✅ A05: Security Misconfiguration - Git hooks enforce quality gates
- ✅ A06: Vulnerable Components - Audit run, low-severity issues identified
- N/A A07: Authentication - No auth changes in this commit
- N/A A08: Software and Data Integrity - Git hooks verify test pass
- ✅ A09: Security Logging - No logging changes (existing RLS audit trail)
- N/A A10: SSRF - No external request changes

### Container Security Best Practices
- ✅ Multi-stage build
- ✅ Minimal base image (Alpine)
- ✅ Lockfile for reproducibility
- 🟡 Non-root user (TODO)
- 🟡 Healthcheck (TODO)
- ✅ No secrets in image

---

**Report Generated:** 2025-12-25 15:30 UTC
**Reviewer:** Security Review Agent (Claude Code)
**Codebase:** Synjar Community (main branch)
**Commit Range:** HEAD~1..HEAD + untracked files
