# Contributing to Synjar

Thank you for your interest in contributing to Synjar! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Contributions](#making-contributions)
- [Pull Request Process](#pull-request-process)
- [Developer Certificate of Origin](#developer-certificate-of-origin)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Community](#community)

## Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to michal@kukla.tech.

## Getting Started

### Prerequisites

- Node.js 20.x or later
- pnpm 9.x or later
- Docker and Docker Compose
- PostgreSQL 16 with pgvector extension (or use Docker)
- OpenAI API key (for embeddings)

### Development Setup

1. **Fork and clone the repository**

   ```bash
   git clone https://github.com/thesynjar/synjar.git
   cd synjar
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Configure environment**

   ```bash
   cp apps/api/.env.example apps/api/.env
   # Edit .env with your configuration
   ```

4. **Start development services**

   ```bash
   pnpm docker:up      # Start PostgreSQL
   pnpm db:migrate     # Run database migrations
   pnpm db:seed        # Seed sample data (optional)
   pnpm dev            # Start development servers
   ```

5. **Verify setup**
   - API: http://localhost:6200/api
   - Swagger: http://localhost:6200/api/docs
   - Web: http://localhost:5173

## Making Contributions

### Types of Contributions

We welcome many types of contributions:

- **Bug fixes** - Fix issues in the codebase
- **Features** - Implement new functionality
- **Documentation** - Improve or add documentation
- **Tests** - Add or improve test coverage
- **Translations** - Help translate the application
- **Bug reports** - Report issues you encounter
- **Feature requests** - Suggest new features

### Before You Start

1. **Check existing issues** - Look for related issues or PRs
2. **Open an issue first** - For significant changes, discuss your approach
3. **Keep scope focused** - One feature/fix per PR

## Pull Request Process

### 1. Create a Branch

```bash
git checkout -b feat/your-feature-name
# or
git checkout -b fix/issue-description
```

Branch naming conventions:

- `feat/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test improvements

### 2. Make Your Changes

- Follow the [Coding Standards](#coding-standards)
- Write tests for new functionality
- Update documentation as needed

### 3. Commit Your Changes

We use [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git commit -s -m "feat: add semantic search endpoint"
git commit -s -m "fix: resolve memory leak in chunking service"
git commit -s -m "docs: update API documentation"
```

**Important:** Use the `-s` flag to sign-off your commits (DCO requirement).

### Automated Commit Validation

The project uses Husky to enforce code quality automatically:

#### Pre-commit Hook
Runs `pnpm test` before allowing commit:
- If tests fail, commit is rejected
- Fix failing tests, then retry commit

#### Commit-msg Hook
Validates commit message format:
- Must follow Conventional Commits format
- Examples: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
- If format is invalid, commit is rejected

#### Bypassing Hooks (use sparingly)
```bash
git commit --no-verify -m "your message"
```

#### Troubleshooting
- **"husky command not found"**: Run `pnpm install` to set up hooks
- **Tests fail on commit**: Fix tests before committing
- **Invalid commit message**: Check format matches conventional commits

### 4. Push and Create PR

```bash
git push origin feat/your-feature-name
```

Then create a Pull Request through GitHub.

### 5. PR Review

- PRs require at least one maintainer approval
- All CI checks must pass
- Address reviewer feedback promptly

## Developer Certificate of Origin

By contributing to this project, you agree to the Developer Certificate of Origin (DCO). This is a lightweight alternative to a Contributor License Agreement (CLA).

The DCO is a simple statement that you, as a contributor, have the legal right to make the contribution. The full text of the DCO is available at [developercertificate.org](https://developercertificate.org/).

### Signing Off Commits

You must sign-off each commit with your real name and email:

```bash
git commit -s -m "Your commit message"
```

This adds a `Signed-off-by` line to your commit message:

```
Signed-off-by: Your Name <your.email@example.com>
```

If you've already made commits without signing off, you can amend them:

```bash
# Amend the last commit
git commit --amend -s --no-edit

# Sign off multiple commits (interactive rebase)
git rebase --signoff HEAD~3
```

## Coding Standards

### General Principles

- Follow **DDD** (Domain-Driven Design) patterns
- Apply **SOLID** principles
- Write **Clean Code** - readable, maintainable, testable
- Use **Dependency Injection** throughout

### TypeScript/NestJS Guidelines

- Use strict TypeScript configuration
- Prefer interfaces over type aliases for public APIs
- Use proper error handling with custom exceptions
- Document public APIs with JSDoc comments

### Project Structure (Clean Architecture)

```
apps/api/src/
├── domain/           # Entities, Value Objects, Interfaces
├── application/      # Use Cases, Services
├── infrastructure/   # Prisma, External Services
└── interfaces/       # Controllers, DTOs
```

### Code Style

- Use ESLint and Prettier (pre-configured)
- Run `pnpm lint` before committing
- Maximum line length: 100 characters
- Use meaningful variable/function names

## Testing

### Test Requirements

- Write tests **before** implementation (TDD)
- Aim for high test coverage on business logic
- Prefer **stubs** over mocks
- Test **behavior**, not implementation details

### Running Tests

```bash
pnpm test              # Run all tests
pnpm test:watch        # Watch mode
pnpm test:cov          # Coverage report
pnpm test:e2e          # End-to-end tests
```

### Test Structure

```typescript
describe("DocumentService", () => {
  describe("createDocument", () => {
    it("should create a document with generated chunks", async () => {
      // Arrange
      const input = createDocumentFixture();

      // Act
      const result = await service.createDocument(input);

      // Assert
      expect(result.chunks).toHaveLength(3);
    });
  });
});
```

## Documentation

### Where to Document

- **Code comments** - For complex logic (sparingly)
- **JSDoc** - For public APIs
- **README.md** - Project overview and quick start
- **docs/** - Detailed documentation and specifications

### Specification Format

For new features, create a specification in `docs/specifications/`:

```
docs/specifications/SPEC-XXX-feature-name.md
```

## Community

### Getting Help

- **GitHub Issues** - Bug reports and feature requests
- **Discussions** - Questions and community chat
- **Email** - michal@kukla.tech

### Recognition

Contributors are recognized in:

- GitHub contributors list
- Release notes for significant contributions
- Project documentation

## License

By contributing to Synjar, you agree that your contributions will be licensed under the Business Source License 1.1, which will convert to Apache License 2.0 on the Change Date specified in the LICENSE file.

---

Thank you for contributing to Synjar!
