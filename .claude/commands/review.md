# Code Review - Post-Implementation Verification

Perform comprehensive code review of changes introduced in this conversation.

## Step 1: Context Preparation

1. Read CLAUDE.md and docs/README.md
2. If not clear from conversation, find the latest specification in docs/specifications/ (sort by date in name)
3. Get list of changed files:
   ```bash
   git status
   git diff --name-only HEAD~1
   ```

## Step 2: Run Expert Agents IN PARALLEL

Use the Task tool to run agents simultaneously (in one message).

**Each agent automatically saves its report to `docs/agents/[agent-name]/reports/YYYY-MM-DD-HH-ii-[type]-review.md`**

**Always run 5 basic agents:**

### Agent 1: security-reviewer

Checks: OWASP Top 10, injection, XSS, credential leaks, input validation

### Agent 2: architecture-reviewer

Checks: DDD (aggregates, VO, events), SOLID, layers, enterprise patterns, ADR compliance

### Agent 3: test-reviewer

Checks: test coverage, test quality, whether tests pass, TDD/BDD

### Agent 4: code-quality-reviewer

Checks: compilation, Clean Code, code smells, linter, naming

### Agent 5: documentation-reviewer

Checks: specification, docs/, README, ADR, documentation freshness, improvement suggestions

**Conditionally run additional agents:**

### Agent 6: migration-reviewer (if there are schema/migrations changes)

```bash
git diff --name-only HEAD~1 | grep -E "schema.prisma|migrations"
```

If result is not empty → run this agent.
Checks: migration safety, data loss, breaking changes, multi-tenancy

### Agent 7: ux-reviewer (if there are frontend or API contract changes)

```bash
git diff --name-only HEAD~1 | grep -E "apps/web/|\.tsx$|\.dto\.ts$|controller\.ts$"
```

If result is not empty → run this agent.
Checks: UX specification compliance, usability, accessibility, UI consistency, API contract vs frontend needs

### Agent 8: user-docs-reviewer (if there are UI or API changes)

```bash
git diff --name-only HEAD~1 | grep -E "\.tsx$|\.dto\.ts$|controller\.ts$|\.controller\.ts$"
```

If result is not empty → run this agent.
Checks:
- Does user guide exist in `apps/user-docs/docs/` for new feature
- Do DTOs have complete `@ApiProperty()` with descriptions
- Do Storybook stories exist for new UI components
- Was changelog (`apps/user-docs/docs/changelog.md`) updated
- Are screenshots up to date (if UI changed)
- **Do documented features have E2E test coverage** (CRITICAL):
  - For each keyboard shortcut in docs → check test in `apps/web/e2e/`
  - For each user flow in docs → check corresponding E2E test
  - For each endpoint in API docs → check test in `apps/api/test/`
  - If test missing → report as CRITICAL (we don't document untested features)

**Report saves to:** `docs/agents/user-docs-reviewer/reports/YYYY-MM-DD-HH-ii-[type]-review.md`

## Step 3: Results Aggregation

After receiving results from all agents, present CONSOLIDATED REPORT:

```markdown
# Code Review Report

## Summary

- Critical: X issues
- High: X issues
- Medium: X issues
- Low: X issues

## Check Status

| Area          | Status            | Notes |
| ------------- | ----------------- | ----- |
| Security      | Pass/Warning/Fail |       |
| Architecture  | Pass/Warning/Fail |       |
| Tests         | Pass/Warning/Fail |       |
| Code Quality  | Pass/Warning/Fail |       |
| Documentation | Pass/Warning/Fail |       |
| Migrations    | Pass/Warning/Fail/N/A |   |
| UX            | Pass/Warning/Fail/N/A |   |
| User Docs     | Pass/Warning/Fail/N/A |   |

## CRITICAL (blocks deploy)

[aggregated from all agents]

## HIGH (fix before merge)

[aggregated from all agents]

## MEDIUM (next iteration)

[aggregated from all agents]

## LOW (nice to have)

[aggregated from all agents]

## What Is Good

[positive aspects from each area]

## Recommended Actions

1. [action - priority]
2. [action - priority]
   ...
```

## Step 4: Specification Update

After aggregating results, run `specification-updater` agent:

```
Use specification-updater agent to:
1. Read all reports from docs/agents/*/reports/
2. Find or create specification
3. Complete specification with all tasks to do
```

Agent will create/update specification in `docs/specifications/YYYY-MM-DD-HH-ii-review-findings.md` with all tasks grouped by priorities.

## Important Rules

- Each agent analyzes changes IN THE CONTEXT OF THE ENTIRE SYSTEM
- Each agent saves report to `docs/agents/[agent-name]/reports/`
- If agent finds a problem elsewhere than current changes - still report it
- Deduplicate issues if multiple agents detected the same thing
- Priorities: Critical > High > Medium > Low
- Critical and High MUST be resolved before merge
- At the end `specification-updater` creates/updates specification with tasks
