import { test, expect } from '@playwright/test';

/**
 * Registration → Dashboard Workspace Visibility E2E Test
 *
 * REGRESSION TEST: "Workspace created during registration is NOT visible in dashboard"
 *
 * Problem:
 * - User registers with workspace name "Michał Kukla"
 * - Registration succeeds (201), redirects to /register/success
 * - User clicks email verification link
 * - User logs in, redirects to /dashboard
 * - Dashboard calls GET /api/workspaces
 * - **BUG**: API returns [] (empty array)
 * - Dashboard shows "No workspaces yet" EmptyState instead of workspace card
 *
 * User Flow (Full UI):
 * 1. Navigate to /register
 * 2. Fill registration form: email, password, workspaceName
 * 3. Click "Create account" button
 * 4. Verify redirect to /register/success
 * 5. Get verification link from Mailpit
 * 6. Click verification link
 * 7. Navigate to /login
 * 8. Fill login form
 * 9. Click "Sign in" button
 * 10. Verify redirect to /dashboard
 * 11. **EXPECTED**: Dashboard displays workspace card "Michał Kukla"
 * 12. **ACTUAL BUG**: Dashboard shows "No workspaces yet" EmptyState
 *
 * Test Strategy:
 * - Test full user flow from registration to dashboard
 * - Use Playwright for UI interactions (accessibility-first selectors)
 * - Use Mailpit API to get verification link (no manual email checking)
 * - Wait for API calls to complete (loading states)
 * - Take screenshot on failure (automatic via Playwright config)
 * - AAA pattern: Arrange (navigate), Act (interact), Assert (verify UI state)
 *
 * Prerequisites:
 *   cd community/apps/web && pnpm test:e2e -- registration-workspace-visibility
 *
 * Environment (from playwright.config.ts + .env.test):
 *   - Frontend: http://localhost:6210 (auto-started by Playwright)
 *   - Backend: http://localhost:6200 (must be running separately)
 *   - Mailpit: http://localhost:6203 (API) / http://localhost:6202 (SMTP)
 *   - DEPLOYMENT_MODE=cloud (set by backend)
 *   - Database: PostgreSQL on localhost:6211 (test database)
 *
 * Test MUST FAIL initially:
 *   This is a regression test for existing bug. Test will:
 *   1. Register new user with workspace name
 *   2. Verify email and login
 *   3. Navigate to dashboard
 *   4. Assert: workspace card is visible (this will FAIL initially)
 *   5. After fix, test will PASS
 *
 * Related files:
 *   - Problem analysis: docs/agents/problem-analyzer/reports/2025-12-26-22-21-workspace-missing-after-registration.md
 *   - Dashboard component: community/apps/web/src/features/dashboard/Dashboard.tsx
 *   - Backend test: community/apps/api/test/registration-workspace-visibility.integration.spec.ts
 */

// Environment variables (from Playwright config or process.env)
const API_URL = process.env.API_URL || 'http://localhost:6200';
const MAILPIT_URL = process.env.MAILPIT_URL || 'http://localhost:6203';

/**
 * Helper to generate unique test user data
 */
function generateTestUser(workspaceName: string) {
  const timestamp = Date.now();
  return {
    email: `test-${timestamp}@workspace-visibility-test.com`,
    password: process.env.TEST_USER_PASSWORD || 'TestPassword123!',
    workspaceName,
    name: 'Test User',
  };
}

/**
 * Helper to get verification link from Mailpit API
 *
 * Waits for email to arrive (max 10 seconds), then extracts verification link.
 */
async function getVerificationLink(email: string): Promise<string> {
  const maxWaitMs = 10000;
  const pollIntervalMs = 500;
  const startTime = Date.now();

  // Poll Mailpit API until email arrives
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch(`${MAILPIT_URL}/api/v1/messages`);
      const data = await response.json();

      // Find email for our user
      const message = data.messages?.find((m: { To: { Address: string }[] }) =>
        m.To?.some((to: { Address: string }) => to.Address === email),
      );

      if (message) {
        // Get full message content
        const messageResponse = await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}`);
        const messageData = await messageResponse.json();

        // Extract verification link from HTML body
        const htmlBody = messageData.HTML || messageData.Text || '';
        const linkMatch = htmlBody.match(/href="([^"]*\/auth\/verify[^"]*)"/);

        if (linkMatch) {
          return linkMatch[1];
        }
      }
    } catch (error) {
      console.warn('Mailpit API error:', (error as Error).message);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Timeout waiting for email to ${email}`);
}

/**
 * Helper to clear Mailpit inbox before test
 */
async function clearMailpit() {
  try {
    await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' });
  } catch (error) {
    console.warn('Failed to clear Mailpit:', (error as Error).message);
  }
}

test.describe('Registration → Dashboard Workspace Visibility (REGRESSION)', () => {
  test.beforeEach(async () => {
    await clearMailpit();
  });

  /**
   * REGRESSION: Workspace should be visible in dashboard after full registration flow
   *
   * This test reproduces the bug reported by user:
   * 1. User registers with workspace name "Michał Kukla"
   * 2. User verifies email
   * 3. User logs in
   * 4. User navigates to dashboard
   * 5. **BUG**: Dashboard shows "No workspaces yet" (API returns empty array)
   * 6. **FIX**: After setting RLS context during registration, workspace is visible
   *
   * Test will FAIL initially (confirming bug), then PASS after fix.
   */
  test('REGRESSION: Workspace should be visible in dashboard after registration + verification + login', async ({
    page,
  }) => {
    // ARRANGE: Generate test user with original bug report workspace name
    const user = generateTestUser('Michał Kukla');

    // ACT 1: Navigate to register page
    await page.goto('/register');

    // ASSERT 1: Registration form is visible
    await expect(page).toHaveURL('/register');
    await expect(page.getByText('Create your account')).toBeVisible();

    // ACT 2: Fill registration form
    await page.getByLabel('Email').fill(user.email);
    await page.getByRole('textbox', { name: /name.*optional/i }).fill(user.name);
    await page.getByLabel('Workspace name').fill(user.workspaceName);
    await page.getByLabel('Password').fill(user.password);

    // ACT 3: Submit registration form
    await page.getByRole('button', { name: 'Create account' }).click();

    // ASSERT 2: Redirect to success page
    await expect(page).toHaveURL('/register/success', { timeout: 10000 });
    await expect(page.getByText('Check your email')).toBeVisible();
    await expect(page.getByText(user.email)).toBeVisible();

    // ACT 4: Get verification link from Mailpit
    const verificationLink = await getVerificationLink(user.email);
    expect(verificationLink).toContain('/auth/verify');
    expect(verificationLink).toContain('token=');

    // ACT 5: Click verification link
    await page.goto(verificationLink);

    // ASSERT 3: Email verified successfully
    await expect(page.getByText('Email verified!')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();

    // ACT 6: Navigate to login page
    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/login');

    // ACT 7: Fill login form
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);

    // ACT 8: Submit login form
    await page.getByRole('button', { name: 'Sign in' }).click();

    // ASSERT 4: Redirect to dashboard
    await expect(page).toHaveURL('/dashboard', { timeout: 10000 });

    // ACT 9: Wait for workspaces API call to complete
    // Dashboard fetches workspaces on mount via GET /api/v1/workspaces
    await page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/workspaces') && response.status() === 200,
      { timeout: 5000 },
    );

    // ASSERT 5: Workspace is visible in dashboard (TEST WILL FAIL IF BUG EXISTS)
    // ❌ FAILS initially: "No workspaces yet" EmptyState is shown
    // ✅ PASSES after fix: Workspace card is visible
    await expect(page.getByText('No workspaces yet')).toBeHidden({ timeout: 2000 });
    await expect(page.getByText(user.workspaceName)).toBeVisible({ timeout: 2000 });

    // ASSERT 6: Workspace card displays expected information
    // Workspace card should show: name, member count, document count
    const workspaceCard = page.locator(`[data-testid="workspace-card"]`).first();
    await expect(workspaceCard).toBeVisible();

    // Alternative assertion if data-testid is not available:
    // Use text content matching (less brittle than testid)
    await expect(page.getByText(user.workspaceName)).toBeVisible();

    // ASSERT 7: Verify workspace card shows "0 documents" (newly created)
    // This confirms workspace was just created during registration
    await expect(page.getByText(/0 documents/i)).toBeVisible();
  });

  /**
   * REGRESSION: Workspace should be visible immediately after auto-login (Cloud mode)
   *
   * This test verifies the auto-login flow (Cloud mode):
   * 1. User registers in Cloud mode
   * 2. Backend returns auto-login tokens
   * 3. User is redirected to /register/success but can skip verification (grace period)
   * 4. User can manually navigate to /dashboard (using auto-login cookie)
   * 5. **BUG**: Dashboard shows "No workspaces yet"
   * 6. **FIX**: Workspace is visible immediately
   */
  test('REGRESSION: Workspace should be visible immediately after auto-login (skip verification)', async ({
    page,
  }) => {
    // ARRANGE
    const user = generateTestUser('Auto-login Workspace');

    // ACT 1: Register user
    await page.goto('/register');
    await page.getByLabel('Email').fill(user.email);
    await page.getByRole('textbox', { name: /name.*optional/i }).fill(user.name);
    await page.getByLabel('Workspace name').fill(user.workspaceName);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    // ASSERT 1: Redirect to success page
    await expect(page).toHaveURL('/register/success');

    // ACT 2: Manually navigate to dashboard (user skips email verification)
    // In Cloud mode, backend sets auto-login cookies during registration
    // User can access dashboard within grace period (15 minutes)
    await page.goto('/dashboard');

    // ASSERT 2: Dashboard loads (user is authenticated via auto-login cookie)
    await expect(page).toHaveURL('/dashboard');

    // ACT 3: Wait for workspaces API call
    await page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/workspaces') && response.status() === 200,
      { timeout: 5000 },
    );

    // ASSERT 3: Workspace is visible (TEST WILL FAIL IF BUG EXISTS)
    await expect(page.getByText('No workspaces yet')).toBeHidden({ timeout: 2000 });
    await expect(page.getByText(user.workspaceName)).toBeVisible({ timeout: 2000 });
  });

  /**
   * REGRESSION: Self-hosted mode - First user workspace should be visible
   *
   * This test verifies self-hosted mode (first user registration):
   * 1. User registers as first user (self-hosted mode)
   * 2. Backend instantly verifies email (no verification required)
   * 3. User is auto-logged in
   * 4. Dashboard should display workspace immediately
   *
   * Note: This test requires backend to be in self-hosted mode.
   * Since Playwright tests run against shared backend, we skip this test.
   * It's covered by backend integration test instead.
   */
  test.skip('REGRESSION: Workspace should be visible in self-hosted mode (first user)', async ({
    page,
  }) => {
    // Skipped: Backend mode (cloud/self-hosted) is shared across all tests
    // Cannot toggle mode in Playwright test without restarting backend
    // This scenario is covered by backend integration test:
    // community/apps/api/test/registration-workspace-visibility.integration.spec.ts
  });

  /**
   * DEBUG: Network inspection - Verify API returns empty array
   *
   * This test verifies the bug at network level:
   * 1. User registers and logs in
   * 2. Dashboard calls GET /api/v1/workspaces
   * 3. Intercept API response
   * 4. Verify API returns [] (empty array) instead of workspace
   */
  test('DEBUG: API returns empty array instead of workspace (network inspection)', async ({
    page,
  }) => {
    // ARRANGE
    const user = generateTestUser('Debug Workspace');

    // Setup network interception
    let workspacesApiResponse: any = null;
    page.on('response', async (response) => {
      if (response.url().includes('/api/v1/workspaces') && response.status() === 200) {
        try {
          workspacesApiResponse = await response.json();
        } catch {
          // Ignore parse errors
        }
      }
    });

    // ACT 1: Register and navigate to dashboard
    await page.goto('/register');
    await page.getByLabel('Email').fill(user.email);
    await page.getByRole('textbox', { name: /name.*optional/i }).fill(user.name);
    await page.getByLabel('Workspace name').fill(user.workspaceName);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL('/register/success');
    await page.goto('/dashboard');

    // Wait for API call
    await page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/workspaces') && response.status() === 200,
    );

    // Small delay to ensure response is captured
    await page.waitForTimeout(1000);

    // ASSERT: API response
    expect(workspacesApiResponse).toBeDefined();
    console.log('DEBUG: Workspaces API response:', workspacesApiResponse);

    // ❌ FAILS initially: workspacesApiResponse is []
    // ✅ PASSES after fix: workspacesApiResponse contains workspace object
    expect(Array.isArray(workspacesApiResponse)).toBe(true);
    expect(workspacesApiResponse.length).toBeGreaterThan(0); // ❌ FAILS initially (0)

    // Additional debugging
    if (workspacesApiResponse.length === 0) {
      console.error('BUG CONFIRMED: API returned empty array');
      console.error('Expected workspace:', user.workspaceName);
      console.error('User email:', user.email);
    } else {
      console.log('SUCCESS: API returned workspace:', workspacesApiResponse[0].name);
    }
  });
});
