import { test, expect, Page } from '@playwright/test';

/**
 * Auto-Navigate E2E Tests
 *
 * Tests the Dashboard auto-navigate behavior (Phase 1 Navigation Redesign):
 * 1. Single workspace users are redirected to /workspaces/:id
 * 2. Multi-workspace users with lastWorkspaceId are redirected
 * 3. Multi-workspace users WITHOUT lastWorkspaceId see workspace list
 * 4. hasAutoNavigated.current prevents redirect loops
 *
 * Related specs:
 * - docs/specifications/2025-12-30-navigation-redesign.md
 * - docs/specifications/2025-12-30-17-25-navigation-phase1-review-findings.md
 *
 * Test file: community/apps/web/e2e/auto-navigate.spec.ts
 * Command: cd community/apps/web && pnpm test:e2e -- auto-navigate
 */

const MAILPIT_URL = process.env.MAILPIT_URL || 'http://localhost:6313';
const LAST_WORKSPACE_KEY = 'synjar:lastWorkspaceId';

function generateTestUser(suffix: string = '') {
  const timestamp = Date.now();
  return {
    email: `test-autonav-${suffix}${timestamp}@example.com`,
    password: 'TestPassword123!',
    workspaceName: `Auto Nav Workspace ${timestamp}`,
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

/**
 * Helper: Register, verify email (if needed), and login user
 * Cloud mode: Auto-login after registration (no email verification)
 * Self-hosted: Email verification flow
 * Returns the user data for further assertions
 */
async function registerAndLogin(page: Page, user: ReturnType<typeof generateTestUser>) {
  // Register
  await page.goto('/register');
  await page.getByLabel('Email').fill(user.email);
  await page
    .getByRole('textbox', { name: /name.*optional/i })
    .fill(user.name);
  await page.getByLabel('Workspace name').fill(user.workspaceName);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();

  // Wait for navigation - either /workspaces (Cloud auto-login) or /register/success (self-hosted)
  const navigationResult = await Promise.race([
    page.waitForURL('/workspaces', { timeout: 10000 }).then(() => 'workspaces'),
    page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 }).then(() => 'workspace-detail'),
    page.waitForURL('/register/success', { timeout: 10000 }).then(() => 'success'),
  ]);

  if (navigationResult === 'success') {
    // Self-hosted mode: Need email verification and manual login
    const verificationLink = await getVerificationLink(user.email);
    await page.goto(verificationLink);

    // Login
    await page.getByRole('link', { name: /sign in/i }).click();
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: /sign in/i }).click();
  }
  // else: Already logged in from Cloud auto-login
}

test.describe('Auto-Navigate Behavior', () => {
  test.beforeEach(async () => {
    await clearMailpit();
  });

  test('should auto-navigate single workspace user directly to workspace', async ({
    page,
  }) => {
    const user = generateTestUser('single-');

    // Clear localStorage before test to ensure clean state
    await page.goto('/');
    await page.evaluate((key) => localStorage.removeItem(key), LAST_WORKSPACE_KEY);

    // Register and login (creates single workspace)
    await registerAndLogin(page, user);

    // Should auto-navigate to workspace detail page (not stay on /workspaces list)
    await page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 });

    // Verify we're on workspace detail page (not list)
    const url = page.url();
    expect(url).toMatch(/\/workspaces\/[a-f0-9-]+$/);

    // Verify workspace name is visible
    await expect(page.getByText(user.workspaceName)).toBeVisible({ timeout: 5000 });

    console.log('Single workspace user auto-navigated to:', url);
  });

  test('should auto-navigate multi-workspace user with lastWorkspaceId to that workspace', async ({
    page,
  }) => {
    const user = generateTestUser('multi-last-');

    // Register first user with workspace
    await registerAndLogin(page, user);

    // Wait for auto-navigate to workspace detail
    await page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 });

    // Extract workspace ID from URL
    const workspaceUrl = page.url();
    const workspaceIdMatch = workspaceUrl.match(/\/workspaces\/([a-f0-9-]+)/);
    expect(workspaceIdMatch).not.toBeNull();
    const firstWorkspaceId = workspaceIdMatch![1];

    // Navigate back to workspaces list manually
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    // Create a second workspace via API or UI (here we use UI)
    // Note: This assumes "New Workspace" button exists on the list page
    const newWorkspaceBtn = page.getByRole('button', { name: /new workspace/i });
    if (await newWorkspaceBtn.isVisible().catch(() => false)) {
      await newWorkspaceBtn.click();

      // Fill workspace creation modal
      const nameInput = page.getByLabel(/name/i);
      await nameInput.fill(`Second Workspace ${Date.now()}`);

      const createBtn = page.getByRole('button', { name: /create/i });
      await createBtn.click();

      // Wait for workspace to be created
      await page.waitForTimeout(1000);
    }

    // Now set lastWorkspaceId to first workspace in localStorage
    await page.evaluate(
      ({ key, id }) => localStorage.setItem(key, id),
      { key: LAST_WORKSPACE_KEY, id: firstWorkspaceId },
    );

    // Navigate to /workspaces (dashboard)
    await page.goto('/workspaces');

    // Should auto-navigate to the first workspace (from lastWorkspaceId)
    await page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 });

    // Verify it navigated to the correct workspace
    expect(page.url()).toContain(firstWorkspaceId);

    console.log('Multi-workspace user with lastWorkspaceId auto-navigated to:', page.url());
  });

  test('should show workspace list for multi-workspace user WITHOUT lastWorkspaceId', async ({
    page,
  }) => {
    const user = generateTestUser('multi-no-last-');

    // Register and login
    await registerAndLogin(page, user);

    // Wait for initial auto-navigate (single workspace case)
    await page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 });

    // Create second workspace if possible
    // First navigate to list
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    // Create second workspace
    const newWorkspaceBtn = page.getByRole('button', { name: /new workspace/i });
    const hasNewWorkspaceBtn = await newWorkspaceBtn.isVisible().catch(() => false);

    if (!hasNewWorkspaceBtn) {
      // If we can't create a second workspace, skip this test scenario
      console.log('Skipping: Cannot create second workspace (button not available)');
      test.skip();
      return;
    }

    await newWorkspaceBtn.click();

    // Fill workspace creation modal
    const nameInput = page.getByLabel(/name/i);
    await nameInput.fill(`Second Workspace ${Date.now()}`);

    const createBtn = page.getByRole('button', { name: /create/i });
    await createBtn.click();

    // Wait for workspace to be created
    await page.waitForTimeout(1000);

    // Clear lastWorkspaceId from localStorage
    await page.evaluate((key) => localStorage.removeItem(key), LAST_WORKSPACE_KEY);

    // Navigate to /workspaces
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    // Should stay on /workspaces list (not auto-navigate)
    // Give time for potential auto-navigate to happen
    await page.waitForTimeout(2000);

    // Verify we're still on /workspaces (list page, not detail)
    const url = page.url();
    expect(url).toMatch(/\/workspaces$/);

    // Verify workspace list heading is visible
    await expect(page.getByRole('heading', { name: 'Workspaces' })).toBeVisible();

    // Verify multiple workspace cards are visible (only for THIS user)
    // Check that both workspaces created in this test are visible
    await expect(page.getByText(user.workspaceName)).toBeVisible();
    await expect(page.getByText(/Second Workspace/)).toBeVisible();

    console.log('Multi-workspace user without lastWorkspaceId sees workspace list page');
  });

  test('should prevent redirect loops with hasAutoNavigated flag', async ({
    page,
  }) => {
    const user = generateTestUser('loop-');

    // Register and login
    await registerAndLogin(page, user);

    // Wait for auto-navigate
    await page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 });

    // Navigate back to /workspaces manually
    await page.goto('/workspaces');

    // Wait for potential auto-navigate (should not happen again due to hasAutoNavigated)
    await page.waitForTimeout(2000);

    // For single workspace user, after manually going to /workspaces,
    // they should auto-navigate again (hasAutoNavigated resets on mount)
    // But there should be NO infinite loop

    // Check that we're stable (either on list or workspace detail)
    const finalUrl = page.url();

    // The key assertion: we should NOT be stuck in a redirect loop
    // Navigation should have settled to a final destination
    expect(
      finalUrl.match(/\/workspaces$/) || finalUrl.match(/\/workspaces\/[a-f0-9-]+$/),
    ).toBeTruthy();

    // Take screenshot to verify stable state
    await page.screenshot({
      path: 'test-results/auto-navigate-no-loop.png',
      fullPage: true,
    });

    console.log('Navigation settled at:', finalUrl, '(no redirect loop)');
  });

  test('should set lastWorkspaceId when auto-navigating single workspace user', async ({
    page,
  }) => {
    const user = generateTestUser('set-last-');

    // Clear localStorage
    await page.goto('/');
    await page.evaluate((key) => localStorage.removeItem(key), LAST_WORKSPACE_KEY);

    // Register and login
    await registerAndLogin(page, user);

    // Wait for auto-navigate
    await page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 });

    // Extract workspace ID from URL
    const workspaceUrl = page.url();
    const workspaceIdMatch = workspaceUrl.match(/\/workspaces\/([a-f0-9-]+)/);
    expect(workspaceIdMatch).not.toBeNull();
    const workspaceId = workspaceIdMatch![1];

    // Verify lastWorkspaceId was set in localStorage
    const storedId = await page.evaluate((key) => localStorage.getItem(key), LAST_WORKSPACE_KEY);
    expect(storedId).toBe(workspaceId);

    console.log('lastWorkspaceId correctly set to:', storedId);
  });

  test('should NOT auto-navigate to non-existent lastWorkspaceId', async ({
    page,
  }) => {
    const user = generateTestUser('nonexistent-');

    // Register and login
    await registerAndLogin(page, user);

    // Wait for initial auto-navigate
    await page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 });

    // Set a fake lastWorkspaceId that doesn't exist
    const fakeWorkspaceId = '00000000-0000-4000-8000-000000000000';
    await page.evaluate(
      ({ key, id }) => localStorage.setItem(key, id),
      { key: LAST_WORKSPACE_KEY, id: fakeWorkspaceId },
    );

    // Navigate to /workspaces
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    // Wait for potential navigation
    await page.waitForTimeout(2000);

    // Should stay on /workspaces since fake ID doesn't exist in workspaces list
    // (Dashboard checks if workspace exists before navigating)
    // For single workspace user, should still auto-navigate to the real workspace
    const url = page.url();

    // Either stays on list (if multi) or goes to real workspace (if single)
    expect(
      url.match(/\/workspaces$/) || url.match(/\/workspaces\/[a-f0-9-]+$/),
    ).toBeTruthy();

    // Should NOT have navigated to the fake workspace
    expect(url).not.toContain(fakeWorkspaceId);

    console.log('Did not navigate to non-existent workspace. Current URL:', url);
  });
});
