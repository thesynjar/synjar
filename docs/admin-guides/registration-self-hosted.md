# Registration Guide - Self-Hosted

**Target Audience:** Self-hosted administrators (tech founders, DevOps engineers, IT admins)
**Last Updated:** 2025-12-26
**Related:** [Deployment Guide](../DEPLOYMENT.md), [Ecosystem Overview](../ecosystem.md)

---

## Overview

This guide explains how to manage user registration on a self-hosted Synjar instance.

**What you'll learn:**
- First user registration (instant admin)
- How self-hosted registration blocking works
- Invitation system for adding team members
- Optional SMTP configuration
- Troubleshooting user access issues

---

## Self-Hosted Registration Model

**Key Differences from Cloud:**
- **First User:** Instant admin access, no email verification required
- **Subsequent Users:** Blocked from public registration
- **Team Growth:** Via invitation system only (controlled by admin)
- **SMTP:** Optional (not required for basic functionality)

**Why This Design?**
- **Security:** Prevents unauthorized access to your instance
- **Control:** Admin explicitly approves all team members
- **Simplicity:** Works without SMTP/email configuration
- **Privacy:** No external dependencies for core functionality

---

## First User Registration

### Prerequisites

1. **Synjar installed and running:**
   ```bash
   docker compose up -d
   # OR
   pnpm dev
   ```

2. **Environment variables configured:**
   ```bash
   DEPLOYMENT_MODE=self-hosted
   DATABASE_URL=postgresql://...
   JWT_SECRET=your-secret-key
   ```

3. **Database migrated:**
   ```bash
   pnpm db:migrate
   ```

### Registration Process

**Step 1: Navigate to Registration Page**
```
http://localhost:5173/register
# OR your custom domain
https://synjar.yourcompany.com/register
```

**Step 2: Fill Out Form**
- **Email:** Your admin email (e.g., `admin@yourcompany.com`)
- **Password:** Strong password (12+ chars, mixed case, number, special char)
- **Workspace Name:** Your organization name (e.g., "Acme Corp")
- **Name:** Your full name (optional)

**Step 3: Submit**
1. Click "Create Account"
2. **You're logged in immediately!** No email verification needed
3. You receive a success message: *"Registration successful. You can log in now."*

**What Happens Behind the Scenes:**
```typescript
// Simplified flow
if (workspace_count === 0) {
  user.isEmailVerified = true;  // Skip verification
  user.role = 'OWNER';           // Admin privileges
  workspace.create(user);        // Create first workspace
  return tokens;                 // Auto-login
}
```

**Database State After First User:**
```sql
SELECT email, "isEmailVerified", role
FROM "User"
JOIN "WorkspaceMember" ON "User".id = "WorkspaceMember"."userId";

-- Result:
-- email                 | isEmailVerified | role
-- admin@company.com     | true            | OWNER
```

---

## Registration Blocking (Second User Protection)

### What Happens

**Scenario:** Someone tries to register after the first user already exists.

**Request:**
```bash
curl -X POST http://localhost:6200/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "hacker@external.com",
    "password": "SecurePass123!",
    "workspaceName": "Hacker Workspace"
  }'
```

**Response (403 Forbidden):**
```json
{
  "statusCode": 403,
  "error": "REGISTRATION_DISABLED",
  "message": "Public registration is disabled on this instance.",
  "hint": "Please contact the administrator to request access.",
  "adminContact": "admin@yourcompany.com"
}
```

**What Users See:**
- Clear error page with 403 status
- Message explaining registration is disabled
- Admin contact email (if `ADMIN_EMAIL` env var is set)
- No way to bypass this restriction

**Why This Matters:**
- **Security:** Prevents unauthorized users from creating accounts
- **Control:** All team members must be explicitly invited
- **Compliance:** Audit trail of who was invited and by whom

---

## Invitation System

### How It Works

**Admin Flow:**
1. Admin logs into workspace
2. Goes to **Workspace Settings → Members**
3. Clicks **"Invite Member"**
4. Enters email and selects role (OWNER, ADMIN, MEMBER)
5. System generates invitation token
6. (Optional) System sends invitation email if SMTP configured

**Invited User Flow:**
1. Receives invitation link (via email or manual sharing)
2. Clicks link: `https://synjar.yourcompany.com/auth/accept-invite?token=abc123...`
3. Sees registration form pre-filled with their email
4. Sets password and name
5. Auto-login after acceptance
6. Immediate access to the workspace

### Inviting Your First Team Member

**Option 1: With SMTP Configured (Recommended)**

```bash
# POST /api/v1/workspaces/:workspaceId/invite
curl -X POST http://localhost:6200/api/v1/workspaces/abc-123/invite \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "colleague@yourcompany.com",
    "role": "MEMBER"
  }'

# Response:
{
  "invitationToken": "eyJhbGc..."
}

# Email sent automatically to colleague@yourcompany.com
```

**Option 2: Without SMTP (Manual Link Sharing)**

1. Make API request (same as above)
2. Copy the `invitationToken` from response
3. Manually share the link with your colleague:
   ```
   https://synjar.yourcompany.com/auth/accept-invite?token=eyJhbGc...
   ```
4. They click the link and complete registration

**Option 3: Using Web UI (Easiest)**

1. Login to Synjar
2. Click your workspace name (top left)
3. Click **"Settings"** → **"Members"** tab
4. Click **"Invite Member"** button
5. Enter email: `colleague@yourcompany.com`
6. Select role: **Member** (or Admin/Owner)
7. Click **"Send Invitation"**
8. Copy the invitation link and share it with your colleague

---

## Environment Variables

### Required Variables

```bash
# Deployment mode (REQUIRED)
DEPLOYMENT_MODE=self-hosted

# Database (REQUIRED)
DATABASE_URL=postgresql://user:password@localhost:5432/synjar

# JWT (REQUIRED)
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# Storage (REQUIRED)
B2_KEY_ID=your-backblaze-key-id
B2_APPLICATION_KEY=your-backblaze-secret
B2_BUCKET_NAME=synjar-uploads
B2_ENDPOINT=s3.eu-central-003.backblazeb2.com
```

### Optional Variables (Email)

```bash
# SMTP Configuration (OPTIONAL)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASSWORD=your-app-specific-password
SMTP_FROM_EMAIL=noreply@yourcompany.com
SMTP_FROM_NAME=Synjar

# Email Verification (OPTIONAL)
EMAIL_VERIFICATION_URL=http://localhost:5173/auth/verify
REQUIRE_EMAIL_VERIFICATION=false  # Set to 'true' only if SMTP is configured
```

### Optional Variables (Security)

```bash
# Admin Contact (shown in 403 errors)
ADMIN_EMAIL=admin@yourcompany.com

# Grace Period (only relevant if REQUIRE_EMAIL_VERIFICATION=true)
GRACE_PERIOD_MINUTES=15

# Rate Limiting (defaults are fine for most cases)
THROTTLE_TTL=60000  # 1 minute
THROTTLE_LIMIT_REGISTER=3
THROTTLE_LIMIT_LOGIN=5
THROTTLE_LIMIT_RESEND=1
```

---

## SMTP Configuration (Optional)

### Why Configure SMTP?

**Benefits:**
- Automated invitation emails (no manual link sharing)
- Password reset via email
- Notification emails (document uploads, shares, etc.)
- Professional appearance

**Without SMTP:**
- Manual invitation link sharing
- Password reset requires admin intervention
- No automated emails

### SMTP Providers

**Option 1: Gmail (Personal)**

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASSWORD=app-specific-password  # Generate in Google Account settings
SMTP_FROM_EMAIL=your@gmail.com
SMTP_FROM_NAME=Synjar
```

**How to get Gmail App Password:**
1. Go to Google Account settings
2. Security → 2-Step Verification → App passwords
3. Generate password for "Mail" app
4. Copy password to `.env`

**Option 2: SendGrid (Professional)**

```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=SG.your_sendgrid_api_key
SMTP_FROM_EMAIL=noreply@yourcompany.com
SMTP_FROM_NAME=Synjar
```

**How to get SendGrid API Key:**
1. Create SendGrid account (free tier available)
2. Settings → API Keys → Create API Key
3. Select "Full Access" or "Mail Send" scope
4. Copy API key to `.env`

**Option 3: Mailgun (Alternative)**

```bash
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@mg.yourcompany.com
SMTP_PASSWORD=your-mailgun-smtp-password
SMTP_FROM_EMAIL=noreply@yourcompany.com
SMTP_FROM_NAME=Synjar
```

**Option 4: Self-Hosted (Advanced)**

```bash
# Example: Postfix on same server
SMTP_HOST=localhost
SMTP_PORT=25
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=noreply@yourcompany.com
SMTP_FROM_NAME=Synjar
```

### Testing SMTP Configuration

**Method 1: Register a Test User (if first user)**

1. Complete first user registration
2. Check your inbox for welcome email
3. If no email received, check server logs:
   ```bash
   docker logs synjar-api | grep SMTP
   ```

**Method 2: Send Test Invitation**

1. Login as admin
2. Invite a test email address
3. Check if email arrives
4. Check Mailpit (if using test environment)

**Method 3: Check Server Logs**

```bash
# Docker logs
docker logs synjar-api | tail -f

# Or direct logs
tail -f /var/log/synjar/api.log

# Look for:
# - "Email sent successfully to user@example.com"
# - "SMTP not configured, skipping email send" (warning)
# - "Failed to send email: <error>" (error)
```

---

## Troubleshooting

### User Reports: "I Can't Register"

**Issue:** User sees 403 Forbidden error

**Cause:** Registration is blocked after first user (by design)

**Solution:**
1. Verify they're not the first user:
   ```sql
   SELECT COUNT(*) FROM "Workspace";
   -- If > 0, registration is blocked
   ```
2. Invite them using the invitation system
3. Share the invitation link with them

**Communication Template:**
```
Hi [User],

Public registration is disabled on our Synjar instance for security reasons.

I've sent you an invitation link to join our workspace:
[LINK]

Click the link and set your password to get started.

If you have any issues, let me know!

Best,
[Admin Name]
```

### Invitation Link Expired

**Issue:** User clicks invitation link, sees "Invalid or expired invitation token"

**Cause:** Invitations expire after 7 days (default)

**Solution:**
1. Generate a new invitation (old one is revoked)
2. Send new link to user
3. Ask them to accept within 7 days

**How to Check Expiry:**
```sql
SELECT email, "expiresAt", status
FROM "Invitation"
WHERE token = 'abc123...';

-- Result:
-- email             | expiresAt           | status
-- user@example.com  | 2025-12-20 10:00:00 | EXPIRED
```

**Future Enhancement (Coming Soon):**
- Configurable expiry time
- Resend invitation endpoint
- Revoke invitation endpoint

### SMTP Not Working

**Issue:** Emails not being sent

**Diagnosis:**
```bash
# Check logs
docker logs synjar-api | grep -i smtp

# Common errors:
# - "Connection refused" → SMTP_HOST or SMTP_PORT wrong
# - "Authentication failed" → SMTP_USER or SMTP_PASSWORD wrong
# - "Timeout" → Firewall blocking port 587
```

**Solutions:**

**Problem 1: Wrong Credentials**
```bash
# Test SMTP manually
telnet smtp.gmail.com 587
# If connection refused, check SMTP_HOST and SMTP_PORT
```

**Problem 2: App Password Not Generated (Gmail)**
- Go to Google Account → Security → App passwords
- Generate new password
- Update `.env` with new password
- Restart Synjar

**Problem 3: Firewall Blocking SMTP Port**
```bash
# Check if port 587 is accessible
nc -zv smtp.gmail.com 587

# If blocked, check firewall rules
sudo ufw allow out 587/tcp
```

**Problem 4: Rate Limiting (SendGrid)**
- Check SendGrid dashboard for rate limits
- Upgrade to paid plan if needed
- Implement email queuing (already built-in)

### User Not Verified (Even Though SMTP Disabled)

**Issue:** User can't login, sees "Please verify your email"

**Cause:** `REQUIRE_EMAIL_VERIFICATION=true` but SMTP not configured

**Solution:**
```bash
# Option 1: Disable email verification
REQUIRE_EMAIL_VERIFICATION=false

# Option 2: Manually verify user in database
UPDATE "User"
SET "isEmailVerified" = true
WHERE email = 'user@example.com';
```

**Prevention:**
- Only set `REQUIRE_EMAIL_VERIFICATION=true` if SMTP is configured
- System will warn on startup if misconfigured

---

## Security Best Practices

### Admin Account Security

1. **Strong Password:**
   - Minimum 16 characters (higher than user requirement)
   - Use password manager
   - Rotate every 90 days

2. **Separate Admin Account:**
   - Don't use admin account for daily work
   - Create a separate "user" account for normal tasks
   - Only use admin for user management

3. **Audit Logs:**
   - Review invitation history monthly
   - Check for suspicious login attempts
   - Monitor user activity

### Instance Security

1. **HTTPS Only:**
   ```nginx
   # nginx config
   server {
       listen 443 ssl;
       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;

       location / {
           proxy_pass http://localhost:6200;
       }
   }
   ```

2. **Firewall Rules:**
   ```bash
   # Only allow HTTPS (443) and SSH (22)
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   sudo ufw allow 22/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

3. **Database Security:**
   ```bash
   # Restrict PostgreSQL to localhost only
   # /etc/postgresql/*/main/pg_hba.conf
   host    all    all    127.0.0.1/32    md5
   ```

4. **Regular Updates:**
   ```bash
   # Update Synjar
   git pull
   pnpm install
   pnpm db:migrate
   pnpm build
   systemctl restart synjar

   # Update system packages
   sudo apt update && sudo apt upgrade
   ```

---

## Screenshots

> **Note:** Screenshots will be added in a future update. For now, follow the text instructions above.

**Planned Screenshots:**
1. First user registration form (self-hosted)
2. Workspace settings → Members tab
3. Invite member dialog
4. Invitation email example
5. Accept invitation page
6. 403 blocked registration error page

---

## Related Documentation

- [Cloud Registration Guide](../user-guides/registration-cloud.md) - For end users
- [Deployment Guide](../DEPLOYMENT.md) - Self-hosted setup
- [Ecosystem Overview](../ecosystem.md) - Understanding deployment modes
- [Security Model](../security/README.md) - Security architecture

---

## Support

**Need Help?**

**Community Support:**
- GitHub Issues: `https://github.com/thesynjar/synjar/issues`
- Community Forum: `https://community.synjar.com`
- Documentation: `https://docs.synjar.com`

**Self-Hosted Resources:**
- Deployment troubleshooting
- SMTP configuration help
- Database migration issues
- Performance optimization

**Paid Support (Enterprise):**
- Email: `enterprise@synjar.com`
- SLA guarantees
- Priority support
- Custom features

---

**Last Updated:** 2025-12-26
**Version:** 1.0.0
**Maintained By:** Synjar Documentation Team
