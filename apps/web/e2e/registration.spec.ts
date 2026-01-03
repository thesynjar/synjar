import { test, expect } from '@playwright/test';

const MAILPIT_URL = process.env.MAILPIT_URL || 'http://localhost:6313';

// Helper to generate unique test data
function generateTestUser() {
  const timestamp = Date.now();
  return {
    email: `test-${timestamp}@example.com`,
    password: 'TestPassword123!',
    workspaceName: `Test Workspace ${timestamp}`,
    name: 'Test User',
  };
}

// Helper to get verification link from Mailpit
async function getVerificationLink(email: string): Promise<string> {
  // Wait for email to arrive
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Get messages from Mailpit
  const response = await fetch(`${MAILPIT_URL}/api/v1/messages`);
  const data = await response.json();

  // Find email for our user
  const message = data.messages?.find((m: { To: { Address: string }[] }) =>
    m.To?.some((to: { Address: string }) => to.Address === email)
  );

  if (!message) {
    throw new Error(`No email found for ${email}`);
  }

  // Get full message content
  const messageResponse = await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}`);
  const messageData = await messageResponse.json();

  // Extract verification link from HTML body
  const htmlBody = messageData.HTML || messageData.Text || '';
  const linkMatch = htmlBody.match(/href="([^"]*\/auth\/verify[^"]*)"/);

  if (!linkMatch) {
    throw new Error('Verification link not found in email');
  }

  return linkMatch[1];
}

// Helper to clear Mailpit inbox
async function clearMailpit() {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' });
}

test.describe('Registration Flow', () => {
  test.beforeEach(async () => {
    await clearMailpit();
  });

  test('should show registration form', async ({ page }) => {
    await page.goto('/register');

    await expect(page.getByRole('link', { name: 'Synjar' })).toBeVisible();
    await expect(page.getByText('Create your account')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByPlaceholder('John Doe')).toBeVisible();
    await expect(page.getByLabel('Workspace name')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  });

  test('should validate password requirements', async ({ page }) => {
    await page.goto('/register');

    const user = generateTestUser();

    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Workspace name').fill(user.workspaceName);
    await page.getByLabel('Password').fill('short');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText('Password must be at least 12 characters')).toBeVisible();
  });

  test('should complete full registration flow', async ({ page }) => {
    const user = generateTestUser();

    // Step 1: Navigate to register page
    await page.goto('/register');

    // Step 2: Fill registration form
    await page.getByLabel('Email').fill(user.email);
    await page.getByPlaceholder('John Doe').fill(user.name);
    await page.getByLabel('Workspace name').fill(user.workspaceName);
    await page.getByLabel('Password').fill(user.password);

    // Step 3: Submit form
    await page.getByRole('button', { name: 'Create account' }).click();

    // Step 4: Cloud mode - auto-login, redirect to workspace detail (auto-navigate for single workspace)
    await expect(page).toHaveURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 });

    // Step 5: Verify we're on workspace detail page (Documents heading is visible)
    await expect(page.getByRole('heading', { name: /Documents/i })).toBeVisible({ timeout: 5000 });

    // Step 6: Verify verification email was sent (even though user is auto-logged in)
    const verificationLink = await getVerificationLink(user.email);
    expect(verificationLink).toContain('/auth/verify');
  });

  test('should handle duplicate email securely (no error revealed)', async ({ page, context }) => {
    const user = generateTestUser();

    // First registration
    await page.goto('/register');
    await page.getByLabel('Email').fill(user.email);
    await page.getByPlaceholder('John Doe').fill(user.name);
    await page.getByLabel('Workspace name').fill(user.workspaceName);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Cloud mode - auto-login, redirect to workspace detail (auto-navigate for single workspace)
    await expect(page).toHaveURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 });

    // Clear cookies to simulate a different browser session
    await context.clearCookies();

    // Try to register again with same email (from fresh session)
    await page.goto('/register');
    await page.getByLabel('Email').fill(user.email);
    await page.getByPlaceholder('John Doe').fill('Another User');
    await page.getByLabel('Workspace name').fill('Another Workspace');
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Security: API returns success to prevent email enumeration attacks
    // For duplicate emails, no auto-login tokens are returned
    // User sees "check email" page, but no new account is created
    await expect(page.getByText(/check your email/i)).toBeVisible();

    // Verify user is NOT auto-logged in (no redirect to workspace)
    await page.waitForTimeout(2000);
    await expect(page).not.toHaveURL(/\/workspaces\/[a-f0-9-]+/);
  });

  test('should navigate between login and register', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('link', { name: 'Sign up' }).click();
    await expect(page).toHaveURL('/register');

    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/login');
  });
});

test.describe('Email Verification', () => {
  test('should show error for invalid token', async ({ page }) => {
    await page.goto('/auth/verify?token=invalid-token');

    await expect(page.getByText('Verification failed')).toBeVisible();
  });

  test('should show error for missing token', async ({ page }) => {
    await page.goto('/auth/verify');

    await expect(page.getByText('Verification failed')).toBeVisible();
    await expect(page.getByText('Invalid verification link')).toBeVisible();
  });
});
