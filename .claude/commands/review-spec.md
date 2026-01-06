# Specification Review - Pre-Implementation Verification

Perform specification review BEFORE starting implementation.

## Goal

Ensure the specification is complete, consistent, and compliant with project's architectural principles before a single line of code is written.

## Step 1: Context Preparation

1. Read CLAUDE.md and docs/README.md
2. Find the specification to review:
   - If path is provided → use it
   - If not → find the latest in docs/specifications/ (sort by date)
3. Read related documents:
   - docs/ecosystem.md (bounded contexts)
   - Related ADRs from docs/adr/
   - README.md of products the specification relates to

## Step 2: Run Expert Agents IN PARALLEL

Use the Task tool to run agents simultaneously (in one message).

**Each agent automatically saves its report to `docs/agents/[agent-name]/reports/YYYY-MM-DD-HH-ii-spec-review.md`**

### Agent 1: architecture-reviewer

Prompt:
```
Review specification from architecture perspective. Read the specification and evaluate:

1. **DDD Compliance:**
   - Are bounded contexts properly defined?
   - Do aggregates have clearly defined boundaries and invariants?
   - Are Value Objects identified?
   - Are Domain Events defined (past tense)?
   - Is there ACL for external integrations?

2. **SOLID in design:**
   - Do components have single responsibility?
   - Is design open for extension?
   - Are interfaces small and focused?

3. **Layers:**
   - Is Domain/Application/Infrastructure clearly separated?
   - Does domain have no infrastructure dependencies?

4. **Ecosystem compliance:**
   - Does it fit existing bounded contexts (docs/ecosystem.md)?
   - Does it not duplicate functionality of other modules?
   - Are integrations through ACL?

5. **Enterprise Patterns:**
   - Are appropriate patterns used (Repository, Orchestrator, Factory)?
   - Are strategies defined for complex logic?

Save report to docs/agents/architecture-reviewer/reports/
```

### Agent 2: security-reviewer

Prompt:
```
Review specification from security perspective. Read the specification and evaluate:

1. **Authentication & Authorization:**
   - Is access to functionality defined?
   - Is multi-tenancy considered (RLS)?
   - Are there roles and permissions?

2. **Data Protection:**
   - Is sensitive data identified?
   - Is there an encryption plan (at rest, in transit)?
   - Are credentials stored securely?

3. **Input Validation:**
   - Is input validation defined?
   - Are there limits (rate limiting, size limits)?

4. **OWASP Top 10:**
   - Does design protect against injection?
   - Is there XSS/CSRF protection?
   - Are there secure defaults?

5. **Audit & Compliance:**
   - Is security event logging defined?
   - Are there compliance requirements (GDPR, etc.)?

Save report to docs/agents/security-reviewer/reports/
```

### Agent 3: documentation-reviewer

Prompt:
```
Review specification from documentation completeness perspective. Read the specification and evaluate:

1. **Specification structure:**
   - Does it have clear goal and scope?
   - Are user stories/requirements defined?
   - Are there acceptance criteria?
   - Is out-of-scope defined?

2. **Technical Design:**
   - Are there diagrams (sequence, architecture)?
   - Are API contracts defined?
   - Are there request/response examples?
   - Is DB schema described?

3. **Documentation consistency:**
   - Is it consistent with docs/ecosystem.md?
   - Does it reference appropriate ADRs?
   - Is there a plan to update docs/ after implementation?

4. **Completeness:**
   - Are edge cases defined?
   - Are error scenarios defined?
   - Are migration steps defined (if needed)?

5. **Readability:**
   - Is it understandable without additional context?
   - Is terminology consistent with domain?

Save report to docs/agents/documentation-reviewer/reports/
```

### Agent 4: test-reviewer

Prompt:
```
Review specification from testability perspective. Read the specification and evaluate:

1. **Test Strategy:**
   - Are test scenarios defined?
   - Are happy path and error scenarios defined?
   - Are edge cases defined?

2. **Design testability:**
   - Are components easy to mock?
   - Are there clear boundaries for unit tests?
   - Are integration test points defined?

3. **Acceptance Criteria:**
   - Are acceptance criteria measurable?
   - Can they be automated?
   - Are there Given-When-Then scenarios?

4. **Test Data:**
   - Is sample test data provided?
   - Are there fixtures for external APIs?

5. **Coverage expectations:**
   - Are coverage requirements defined?
   - Are critical paths to test defined?

Save report to docs/agents/test-reviewer/reports/
```

### Agent 5: ux-reviewer (if specification involves UI/API)

Check if specification contains UI elements or API contracts. If so, run this agent.

Prompt:
```
Review specification from UX perspective. Read the specification and evaluate:

1. **User Experience:**
   - Is user journey defined?
   - Are there mockups/wireframes?
   - Are states defined (loading, error, empty)?

2. **API Design:**
   - Is API RESTful/consistent?
   - Is naming intuitive?
   - Is pagination defined?
   - Are error responses standardized?

3. **Accessibility:**
   - Are there a11y requirements?
   - Are keyboard interactions defined?

4. **Responsiveness:**
   - Are there mobile/desktop requirements?
   - Are there breakpoints?

5. **Consistency:**
   - Does it use existing UI components?
   - Is it consistent with rest of application?

Save report to docs/agents/ux-reviewer/reports/
```

### Agent 6: migration-reviewer (if specification contains DB changes)

Check if specification contains database schema changes. If so, run this agent.

Prompt:
```
Review specification from DB migration perspective. Read the specification and evaluate:

1. **Schema Changes:**
   - Are changes backwards compatible?
   - Are there nullable fields for new columns?
   - Are there default values?

2. **Data Migration:**
   - Is there a plan for migrating existing data?
   - Is there a rollback strategy?
   - Is there a backup plan?

3. **Multi-tenancy:**
   - Is RLS considered?
   - Is tenant_id on all tables?
   - Are there appropriate indexes?

4. **Performance:**
   - Are indexes defined?
   - Are large tables considered?
   - Is there a plan for zero-downtime migration?

5. **Timestamps:**
   - Are all timestamps "timestamp with time zone"?

Save report to docs/agents/migration-reviewer/reports/
```

## Step 3: Results Aggregation

After receiving results from all agents, present CONSOLIDATED REPORT:

```markdown
# Specification Review Report

## Specification: [filename]

## Summary

- Critical: X issues (blocks implementation)
- High: X issues (requires fix before implementation)
- Medium: X issues (to clarify during implementation)
- Low: X issues (nice to have)

## Check Status

| Area          | Status            | Notes |
| ------------- | ----------------- | ----- |
| Architecture  | Pass/Warning/Fail |       |
| Security      | Pass/Warning/Fail |       |
| Documentation | Pass/Warning/Fail |       |
| Testability   | Pass/Warning/Fail |       |
| UX            | Pass/Warning/Fail/N/A |   |
| Migrations    | Pass/Warning/Fail/N/A |   |

## CRITICAL (blocks implementation)

[aggregated from all agents]

## HIGH (fix before implementation)

[aggregated from all agents]

## MEDIUM (clarify during implementation)

[aggregated from all agents]

## LOW (nice to have)

[aggregated from all agents]

## What Is Good

[positive aspects of specification]

## Required Specification Changes

1. [change - priority]
2. [change - priority]
   ...

## Questions to Clarify

1. [question]
2. [question]
   ...
```

## Step 4: Specification Update

If there are CRITICAL or HIGH issues:

1. Propose specific changes to specification
2. After user acceptance, update the specification
3. Add "Review History" section at the end of specification:

```markdown
## Review History

### YYYY-MM-DD - Pre-Implementation Review
- Reviewed by: Claude (architecture, security, documentation, test, ux, migration)
- Status: Approved / Approved with comments / Requires changes
- Findings: [link to reports in docs/agents/]
```

## Important Rules

- Specification review BEFORE implementation saves time
- CRITICAL issues MUST be resolved before starting coding
- HIGH issues should be resolved, but you can start with a clear plan
- Each agent analyzes specification in context of entire ecosystem
- Deduplicate issues if multiple agents detected the same thing
- Save reports to docs/agents/[agent-name]/reports/
