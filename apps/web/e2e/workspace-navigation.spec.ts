import { test, expect } from '@playwright/test';

/**
 * Workspace Navigation E2E Tests
 *
 * Simple tests to verify basic navigation flow:
 * 1. Registration and login
 * 2. Workspace list page
 * 3. Workspace detail page
 * 4. Documents list
 *
 * These tests establish the foundation for more complex tests.
 */

const MAILPIT_URL = process.env.MAILPIT_URL || 'http://localhost:6313';

function generateTestUser() {
  const timestamp = Date.now();
  return {
    email: `test-nav-${timestamp}@example.com`,
    password: 'TestPassword123!',
    workspaceName: `Test Workspace ${timestamp}`,
    name: 'Test User',
  };
}

async function getVerificationLink(email: string): Promise<string> {
  const maxWaitMs = 10000;
  const pollIntervalMs = 500;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch(`${MAILPIT_URL}/api/v1/messages`);
      const data = await response.json();

      const message = data.messages?.find((m: { To: { Address: string }[] }) =>
        m.To?.some((to: { Address: string }) => to.Address === email),
      );

      if (message) {
        const messageResponse = await fetch(
          `${MAILPIT_URL}/api/v1/message/${message.ID}`,
        );
        const messageData = await messageResponse.json();
        const htmlBody = messageData.HTML || messageData.Text || '';
        const linkMatch = htmlBody.match(/href="([^"]*\/auth\/verify[^"]*)"/);

        if (linkMatch) {
          return linkMatch[1];
        }
      }
    } catch {
      // Continue polling
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`No verification email found for ${email} within timeout`);
}

async function clearMailpit() {
  try {
    await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' });
  } catch {
    console.warn('Failed to clear Mailpit');
  }
}

test.describe('Workspace Navigation', () => {
  test.beforeEach(async () => {
    await clearMailpit();
  });

  test('should register, verify email (if needed), and see workspaces page', async ({
    page,
  }) => {
    const user = generateTestUser();

    // Register
    await page.goto('/register');
    await page.getByLabel('Email').fill(user.email);
    await page
      .getByRole('textbox', { name: /name.*optional/i })
      .fill(user.name);
    await page.getByLabel('Workspace name').fill(user.workspaceName);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Wait for navigation - /workspaces/[id] (Cloud auto-navigate), /workspaces (Cloud), or /register/success (self-hosted)
    const navigationResult = await Promise.race([
      page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 }).then(() => 'workspace-detail'),
      page.waitForURL('/workspaces', { timeout: 10000 }).then(() => 'workspaces'),
      page.waitForURL('/register/success', { timeout: 10000 }).then(() => 'success'),
    ]);

    if (navigationResult === 'success') {
      // Self-hosted mode: Email verification required
      await expect(page.getByText('Check your email')).toBeVisible();

      // Verify email
      const verificationLink = await getVerificationLink(user.email);
      await page.goto(verificationLink);
      await expect(page.getByText('Email verified!')).toBeVisible();

      // Login
      await page.getByRole('link', { name: /sign in/i }).click();
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Password').fill(user.password);
      await page.getByRole('button', { name: /sign in/i }).click();

      // Should see workspaces page after login
      await expect(page).toHaveURL(/\/workspaces/, { timeout: 10000 });
    }
    // else: Cloud mode - already at /workspaces or /workspaces/[id] from auto-login/auto-navigate

    // With Cloud mode auto-navigate, single-workspace users go directly to workspace detail
    // Wait for auto-navigate to complete
    await page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 });

    // Verify we're on workspace detail page with Documents heading
    await expect(page.getByRole('heading', { name: /Documents/i })).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to workspace and see workspace page', async ({
    page,
  }) => {
    const user = generateTestUser();

    // Quick registration + verification (if needed) + login flow
    await page.goto('/register');
    await page.getByLabel('Email').fill(user.email);
    await page
      .getByRole('textbox', { name: /name.*optional/i })
      .fill(user.name);
    await page.getByLabel('Workspace name').fill(user.workspaceName);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Wait for navigation - /workspaces/[id] (Cloud auto-navigate), /workspaces (Cloud), or /register/success (self-hosted)
    const navigationResult = await Promise.race([
      page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 }).then(() => 'workspace-detail'),
      page.waitForURL('/workspaces', { timeout: 10000 }).then(() => 'workspaces'),
      page.waitForURL('/register/success', { timeout: 10000 }).then(() => 'success'),
    ]);

    if (navigationResult === 'success') {
      // Self-hosted mode: Email verification required
      const verificationLink = await getVerificationLink(user.email);
      await page.goto(verificationLink);
      await page.getByRole('link', { name: /sign in/i }).click();
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Password').fill(user.password);
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect(page).toHaveURL(/\/workspaces/, { timeout: 10000 });
    }

    // If not already on workspace detail, click on workspace card
    if (!/\/workspaces\/[a-f0-9-]+/.test(page.url())) {
      const workspaceCard = page.locator('div.cursor-pointer').first();
      await workspaceCard.waitFor({ state: 'visible', timeout: 5000 });
      await workspaceCard.click();
    }

    // Should be on workspace detail page
    await page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 5000 });

    // Take screenshot to see what's on this page
    await page.screenshot({
      path: 'test-results/workspace-detail-page.png',
      fullPage: true,
    });

    // Log the current URL for debugging
    console.log('Current URL after clicking workspace:', page.url());
  });

  test('should see workspace page content', async ({ page }) => {
    const user = generateTestUser();

    // Registration + verification (if needed) + login
    await page.goto('/register');
    await page.getByLabel('Email').fill(user.email);
    await page
      .getByRole('textbox', { name: /name.*optional/i })
      .fill(user.name);
    await page.getByLabel('Workspace name').fill(user.workspaceName);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Wait for navigation - /workspaces/[id] (Cloud auto-navigate), /workspaces (Cloud), or /register/success (self-hosted)
    const navigationResult = await Promise.race([
      page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 }).then(() => 'workspace-detail'),
      page.waitForURL('/workspaces', { timeout: 10000 }).then(() => 'workspaces'),
      page.waitForURL('/register/success', { timeout: 10000 }).then(() => 'success'),
    ]);

    if (navigationResult === 'success') {
      // Self-hosted mode: Email verification required
      const verificationLink = await getVerificationLink(user.email);
      await page.goto(verificationLink);
      await page.getByRole('link', { name: /sign in/i }).click();
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Password').fill(user.password);
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect(page).toHaveURL(/\/workspaces/, { timeout: 10000 });
    }

    // If not already on workspace detail, navigate to workspace
    if (!/\/workspaces\/[a-f0-9-]+/.test(page.url())) {
      const workspaceCard = page.locator('div.cursor-pointer').first();
      await workspaceCard.click();
    }
    await page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 5000 });

    // Wait for page to load and take screenshot
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: 'test-results/workspace-content.png',
      fullPage: true,
    });

    // Log all visible text for debugging
    const bodyText = await page.locator('body').textContent();
    console.log('Page content:', bodyText?.substring(0, 500));

    // Log all buttons on the page
    const buttons = await page.getByRole('button').all();
    console.log('Buttons found:', buttons.length);
    for (const btn of buttons) {
      const text = await btn.textContent();
      console.log('  Button:', text);
    }

    // Log all headings
    const headings = await page.getByRole('heading').all();
    console.log('Headings found:', headings.length);
    for (const h of headings) {
      const text = await h.textContent();
      console.log('  Heading:', text);
    }

    // Log all links
    const links = await page.getByRole('link').all();
    console.log('Links found:', links.length);
    for (const link of links.slice(0, 10)) {
      const text = await link.textContent();
      const href = await link.getAttribute('href');
      console.log('  Link:', text, '->', href);
    }
  });
});
