# Synjar Community - Documentation

## Overview

Synjar is a self-hosted RAG backend - a knowledge base service with Retrieval Augmented Generation capabilities.

## Specifications

| File | Description | Status |
|------|-------------|--------|
| [2025-12-24-synjar-mvp.md](specifications/2025-12-24-synjar-mvp.md) | MVP Specification | Completed |
| [SPEC-001-row-level-security.md](specifications/SPEC-001-row-level-security.md) | Row-Level Security (RLS) | Draft |
| [SPEC-003-workspace-limit-per-user.md](specifications/SPEC-003-workspace-limit-per-user.md) | Workspace limit per user | Draft |
| [SPEC-004-document-limit-per-workspace.md](specifications/SPEC-004-document-limit-per-workspace.md) | Document limit | Draft |
| [SPEC-005-storage-limit-per-workspace.md](specifications/SPEC-005-storage-limit-per-workspace.md) | Storage limit | Draft |
| [SPEC-006-usage-tracking.md](specifications/SPEC-006-usage-tracking.md) | Usage tracking | Draft |
| [SPEC-007-fixed-size-chunking.md](specifications/SPEC-007-fixed-size-chunking.md) | Fixed-size chunking | Draft |
| [SPEC-008-chunking-strategy-selection.md](specifications/SPEC-008-chunking-strategy-selection.md) | Chunking strategy | Draft |
| [SPEC-009-conflict-auditor.md](specifications/SPEC-009-conflict-auditor.md) | Conflict detection | Draft |
| [SPEC-010-verified-recommendations.md](specifications/SPEC-010-verified-recommendations.md) | Verified recommendations | Draft |
| [SPEC-011-frontend-auth.md](specifications/SPEC-011-frontend-auth.md) | Frontend Auth | Draft |
| [SPEC-012-frontend-dashboard.md](specifications/SPEC-012-frontend-dashboard.md) | Frontend Dashboard | Draft |
| [SPEC-013-frontend-documents.md](specifications/SPEC-013-frontend-documents.md) | Frontend Documents | Draft |
| [SPEC-014-frontend-markdown-editor.md](specifications/SPEC-014-frontend-markdown-editor.md) | Frontend Markdown Editor | Draft |
| [SPEC-015-frontend-search.md](specifications/SPEC-015-frontend-search.md) | Frontend Search | Draft |
| [SPEC-016-frontend-public-links.md](specifications/SPEC-016-frontend-public-links.md) | Frontend Public Links | Draft |

## Architectural Decisions

| File | Description |
|------|-------------|
| [ARCHITECTURE_DECISION.md](ARCHITECTURE_DECISION.md) | Decision: standalone vs monolith |
| [adr/ADR-2025-12-25-signed-urls-for-public-files.md](adr/ADR-2025-12-25-signed-urls-for-public-files.md) | Signed URLs for Public API files |

## Security

**Comprehensive documentation for multi-tenant architecture security.**

| File | Description | Audience |
|------|-------------|----------|
| [security/README.md](security/README.md) | Security documentation index | Everyone |
| [security/EXECUTIVE_SUMMARY.md](security/EXECUTIVE_SUMMARY.md) | Executive summary: multi-tenant security | Tech leads, stakeholders |
| [security/SECURITY_GUIDELINES.md](security/SECURITY_GUIDELINES.md) | Security best practices & requirements | All developers |
| [security/IMPLEMENTATION_PLAN.md](security/IMPLEMENTATION_PLAN.md) | Phase-based implementation roadmap | Tech leads, PM |
| [security/CODE_REVIEW_SECURITY_CHECKLIST.md](security/CODE_REVIEW_SECURITY_CHECKLIST.md) | Mandatory checklist for code reviews | Code reviewers |

### Quick Links

- **New developers:** Start with [Security Guidelines](security/SECURITY_GUIDELINES.md)
- **Code reviewers:** Use [Security Checklist](security/CODE_REVIEW_SECURITY_CHECKLIST.md)
- **Management:** Read [Executive Summary](security/EXECUTIVE_SUMMARY.md)

## Research

| File | Description | Date |
|------|-------------|------|
| [RAG_Knowledge_Base_Research_2025.md](../research/RAG_Knowledge_Base_Research_2025.md) | RAG ecosystem research 2025 | 2025-12-24 |
| [open-source-best-practices-2025.md](research/open-source-best-practices-2025.md) | Open-source best practices | 2025-12-25 |

> **Enterprise Research:** Multi-tenant security, licensing, billing - moved to private enterprise repository

## Agent Reports

| File | Description | Date |
|------|-------------|------|
| [agents/architecture-reviewer/reports/2025-12-24-14-00-initial-review.md](agents/architecture-reviewer/reports/2025-12-24-14-00-initial-review.md) | Initial architecture review | 2025-12-24 |

## Archive

Old Frontdesk project files: `../archive/frontdesk-2025-12-24/`
