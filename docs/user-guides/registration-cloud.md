# Registration Guide - Cloud (SaaS)

**Target Audience:** End users (consultants, support teams, business users)
**Last Updated:** 2025-12-26
**Related:** [Deployment Modes](../ecosystem.md#1-deployment-modes)

---

## Overview

This guide explains how to register for a Synjar Cloud account and get started with your workspace.

**What you'll learn:**
- How to create a new account
- Email verification process
- Grace period for exploring the platform
- Password requirements
- Troubleshooting common issues

---

## Registration Flow

### Step 1: Visit the Registration Page

1. Navigate to `https://app.synjar.com/register`
2. You'll see a registration form with the following fields:
   - **Email** (required)
   - **Password** (required)
   - **Workspace Name** (required)
   - **Your Name** (optional)

### Step 2: Fill Out the Registration Form

**Email:**
- Use a valid email address you have access to
- This will be your login username
- You'll receive a verification email at this address

**Password Requirements:**
- Minimum 12 characters
- At least 1 uppercase letter (A-Z)
- At least 1 lowercase letter (a-z)
- At least 1 number (0-9)
- At least 1 special character (!@#$%^&*...)

**Examples:**
- ✅ `SecurePass123!` (valid)
- ✅ `MyP@ssw0rd2024` (valid)
- ❌ `password` (too short, no uppercase, no number, no special)
- ❌ `Password123` (no special character)

**Workspace Name:**
- This is your team's workspace (e.g., "Acme Corp", "Marketing Team")
- Minimum 2 characters
- You can rename it later from workspace settings

**Your Name:**
- Optional - helps your team identify you
- Can be updated later in profile settings

### Step 3: Submit Registration

1. Click the **"Create Account"** button
2. You'll see a success message: *"Registration successful. Please check your email."*
3. **Important:** You're automatically logged in! You can start exploring immediately.

### Step 4: Email Verification

**Check Your Inbox:**
1. Look for an email from `noreply@synjar.com`
2. Subject: *"Verify your email - Synjar"*
3. Open the email and click the verification link

**Verification Link Format:**
```
https://app.synjar.com/auth/verify?token=abc123...
```

**Email Content Example:**
```
Hi,

Welcome to Synjar! Please verify your email address by clicking the link below:

[Verify Email]

This link expires in 7 days.

If you didn't create an account, you can safely ignore this email.
```

---

## Grace Period (15 Minutes)

**What is it?**
- After registration, you have **15 minutes** to explore the platform
- You can upload documents, create folders, and test features
- No email verification required during this time

**What happens after 15 minutes?**
- If you haven't verified your email, you'll be logged out
- You'll see a message: *"Please verify your email before logging in"*
- Simply click the verification link in your email to regain access

**Why does this exist?**
- Lets you get started immediately without waiting for email
- Ensures only real users with valid emails can use the platform long-term

**Best Practice:**
- Verify your email as soon as possible
- Don't wait until the grace period expires

---

## Troubleshooting

### Email Not Received

**Check these first:**
1. **Spam/Junk folder** - verification emails sometimes end up here
2. **Wait 5 minutes** - email delivery can be delayed
3. **Check the email address** - make sure you registered with the correct address

**Resend Verification Email:**
1. Go to the login page
2. Click *"Didn't receive email?"* link
3. Enter your email address
4. Click *"Resend Verification"*
5. Wait at least 60 seconds before requesting another resend

**Still not receiving emails?**
- Add `noreply@synjar.com` to your safe senders list
- Try a different email provider (some corporate emails block automated messages)
- Contact support at `support@synjar.com`

### Password Rejected

**Error:** *"Password must be at least 12 characters"*
- **Solution:** Use a longer password (minimum 12 characters)

**Error:** *"Password must contain at least one uppercase letter"*
- **Solution:** Add capital letters (e.g., `MyPassword123!`)

**Error:** *"Password must contain at least one special character"*
- **Solution:** Add symbols like `!@#$%^&*()`

**Recommended Tools:**
- Use a password manager (1Password, LastPass, Bitwarden)
- Generate a strong password automatically
- Never reuse passwords from other services

### "Too Many Requests" Error

**Error:** *"Too many attempts. Please wait 1 minute."*
- **Cause:** Rate limiting (security feature)
- **Solution:** Wait 60 seconds before trying again
- **Why:** Prevents automated attacks on the registration system

### Can't Login After Registration

**Scenario 1: Within 15 minutes of registration**
- **Issue:** Grace period still active
- **Solution:** Login normally with your email and password

**Scenario 2: After 15 minutes, email not verified**
- **Error:** *"Please verify your email before logging in"*
- **Solution:** Check your inbox and click the verification link

**Scenario 3: Forgot password already**
- **Solution:** Use the "Forgot Password" link on login page
- Follow the password reset flow

### Account Already Exists

**Error:** *"An account with this email already exists"*
- **Cause:** You (or someone) already registered with this email
- **Solutions:**
  1. Try logging in instead of registering
  2. Use the "Forgot Password" link if you don't remember your password
  3. Contact support if you believe this is an error

---

## Next Steps After Registration

Once you've verified your email, you can:

1. **Upload Documents**
   - Drag and drop files or use the upload button
   - Supported formats: PDF, DOCX, TXT, MD, and more

2. **Invite Team Members**
   - Go to Workspace Settings → Members
   - Click "Invite Member"
   - Enter their email and select a role (Member, Admin, Owner)

3. **Configure Settings**
   - Workspace name and branding
   - Notification preferences
   - API keys (for developers)

4. **Explore Features**
   - Semantic search across all documents
   - AI-powered Q&A
   - Document collections and folders
   - Version history

---

## Security Best Practices

1. **Strong Passwords:**
   - Use a unique password (not used elsewhere)
   - Enable password manager autofill
   - Change password every 90 days (optional)

2. **Email Security:**
   - Verify your email immediately after registration
   - Don't share verification links
   - Report suspicious emails to support

3. **Account Safety:**
   - Log out on shared computers
   - Enable 2FA when available (coming soon)
   - Review active sessions regularly

---

## Screenshots

> **Note:** Screenshots will be added in a future update. For now, follow the text instructions above.

**Planned Screenshots:**
1. Registration form (all fields visible)
2. Success message after registration
3. Email verification inbox view
4. Verification success page
5. Grace period banner in app
6. "Resend verification" dialog

---

## Related Documentation

- [Self-Hosted Registration](../admin-guides/registration-self-hosted.md) - For self-hosted admins
- [Ecosystem Overview](../ecosystem.md) - Understanding Cloud vs Self-hosted
- [Security Model](../security/README.md) - How we protect your data
- [Deployment Modes](../ecosystem.md#1-deployment-modes) - Detailed mode comparison

---

## Support

**Need Help?**
- Email: `support@synjar.com`
- Documentation: `https://docs.synjar.com`
- Community Forum: `https://community.synjar.com`
- Status Page: `https://status.synjar.com`

**Common Support Topics:**
- Email verification issues
- Password reset
- Account recovery
- Billing questions
- Feature requests

---

**Last Updated:** 2025-12-26
**Version:** 1.0.0
**Maintained By:** Synjar Documentation Team
