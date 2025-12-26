import { test, expect } from '@playwright/test';

const API_URL = process.env.API_URL || 'http://localhost:6200';
const MAILPIT_URL = process.env.MAILPIT_URL || 'http://localhost:6203';

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

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Synjar');
    await expect(page.getByText('Create your account')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Name')).toBeVisible();
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
    await page.getByLabel('Name').fill(user.name);
    await page.getByLabel('Workspace name').fill(user.workspaceName);
    await page.getByLabel('Password').fill(user.password);

    // Step 3: Submit form
    await page.getByRole('button', { name: 'Create account' }).click();

    // Step 4: Verify redirect to success page
    await expect(page).toHaveURL('/register/success');
    await expect(page.getByText('Check your email')).toBeVisible();
    await expect(page.getByText(user.email)).toBeVisible();

    // Step 5: Get verification link from email
    const verificationLink = await getVerificationLink(user.email);
    expect(verificationLink).toContain('/auth/verify');

    // Step 6: Click verification link
    await page.goto(verificationLink);

    // Step 7: Verify email verified successfully
    await expect(page.getByText('Email verified!')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();

    // Step 8: Navigate to login
    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/login');

    // Step 9: Login with new account
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Step 10: Verify logged in successfully
    await expect(page).toHaveURL('/dashboard');
  });

  test('should show error for duplicate email', async ({ page }) => {
    const user = generateTestUser();

    // First registration
    await page.goto('/register');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Name').fill(user.name);
    await page.getByLabel('Workspace name').fill(user.workspaceName);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL('/register/success');

    // Try to register again with same email
    await page.goto('/register');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Name').fill('Another User');
    await page.getByLabel('Workspace name').fill('Another Workspace');
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Should show error
    await expect(page.getByText(/already exists|already registered/i)).toBeVisible();
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
