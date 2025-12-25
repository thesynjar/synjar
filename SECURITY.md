# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

**Email:** michal@kukla.tech

**Subject line:** `[SECURITY] Synjar - Brief description`

### What to Include

1. Description of the vulnerability
2. Steps to reproduce
3. Potential impact
4. Suggested fix (if any)

### Response Timeline

- **Initial response:** Within 48 hours
- **Status update:** Within 7 days
- **Resolution target:** Within 30 days (depending on severity)

### What to Expect

1. We will acknowledge your report promptly
2. We will investigate and validate the issue
3. We will work on a fix and coordinate disclosure
4. We will credit you in the security advisory (unless you prefer anonymity)

### Safe Harbor

We consider security research conducted in good faith to be authorized. We will not pursue legal action against researchers who:

- Make a good faith effort to avoid privacy violations and data destruction
- Do not exploit vulnerabilities beyond what is necessary to demonstrate them
- Report vulnerabilities promptly
- Do not publicly disclose before we have addressed the issue

## Security Best Practices

When deploying Synjar:

1. **Environment variables:** Never commit secrets to version control
2. **Database:** Use strong passwords and enable SSL connections
3. **API keys:** Rotate OpenAI and other API keys regularly
4. **Updates:** Keep dependencies updated for security patches
5. **Network:** Use HTTPS in production, configure proper CORS settings

## Known Security Features

- Row-Level Security (RLS) for tenant isolation
- JWT-based authentication
- Input validation on all endpoints
- SQL injection protection via Prisma ORM
- XSS protection in frontend

---

Thank you for helping keep Synjar secure.
