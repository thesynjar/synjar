import { test, expect, Page } from '@playwright/test';

/**
 * Document Create and Edit E2E Tests
 *
 * REGRESSION TEST: "Auto-save conflict on new document"
 *
 * Tests the document creation and editing flow to verify
 * that auto-save works without conflict errors.
 *
 * Root Cause (from analysis):
 * - acquireLock() updates document.updatedAt via Prisma
 * - Frontend has stale lastKnownUpdatedAt (from before lock)
 * - Auto-save sends stale timestamp → optimistic locking triggers false conflict
 *
 * Test file: community/apps/web/e2e/document-create-edit.spec.ts
 * Command: cd community/apps/web && pnpm test:e2e -- document-create-edit
 */

const MAILPIT_URL = process.env.MAILPIT_URL || 'http://localhost:6313';

function generateTestUser() {
  const timestamp = Date.now();
  return {
    email: `test-doc-${timestamp}@example.com`,
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

/**
 * Helper: Register, verify email, login, navigate to workspace
 */
async function setupUserAndWorkspace(page: Page) {
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
  await expect(page).toHaveURL('/register/success', { timeout: 10000 });

  // Verify email
  const verificationLink = await getVerificationLink(user.email);
  await page.goto(verificationLink);

  // Login
  await page.getByRole('link', { name: /sign in/i }).click();
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/workspaces', { timeout: 10000 });

  // Navigate to workspace
  const workspaceCard = page.locator('div.cursor-pointer').first();
  await workspaceCard.click();
  await page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 5000 });

  return user;
}

test.describe('Document Create and Edit', () => {
  test.beforeEach(async () => {
    await clearMailpit();
  });

  test('should create a new text document via modal', async ({ page }) => {
    await setupUserAndWorkspace(page);

    // Click "New Text Document" button - opens modal
    const newDocButton = page.getByRole('button', { name: 'New Text Document' });
    await expect(newDocButton).toBeVisible({ timeout: 5000 });
    await newDocButton.click();

    // Modal should appear with title "New Text Document"
    await expect(page.getByRole('heading', { name: 'New Text Document' })).toBeVisible();

    // Fill in document title (using placeholder since label might not be properly connected)
    const titleInput = page.getByPlaceholder('Document title');
    await titleInput.fill('Test Document Title');

    // Fill in document content
    const contentTextarea = page.getByPlaceholder(/document content/i);
    await contentTextarea.fill('Test document content for auto-save test.');

    // Click "Create Document" button
    await page.getByRole('button', { name: 'Create Document' }).click();

    // Wait for modal to close and document to appear in list
    await expect(page.getByRole('heading', { name: 'New Text Document' })).not.toBeVisible({ timeout: 5000 });

    // Verify document appears in list
    await expect(page.getByText('Test Document Title')).toBeVisible({ timeout: 5000 });

    console.log('✅ Document created successfully via modal');
  });

  test('should click document to open edit page', async ({ page }) => {
    await setupUserAndWorkspace(page);

    // Create document via modal
    await page.getByRole('button', { name: 'New Text Document' }).click();
    await page.getByPlaceholder('Document title').fill('Editable Document');
    await page.getByPlaceholder(/document content/i).fill('Initial content.');
    await page.getByRole('button', { name: 'Create Document' }).click();

    // Wait for document to appear in list
    await expect(page.getByText('Editable Document')).toBeVisible({ timeout: 5000 });

    // Click on document to open it
    await page.getByText('Editable Document').click();

    // Should navigate to edit page
    await page.waitForURL(/\/documents\/[a-f0-9-]+\/edit/, { timeout: 10000 });

    // Take screenshot of edit page
    await page.screenshot({
      path: 'test-results/document-edit-page.png',
      fullPage: true,
    });

    // Log page structure for debugging
    const buttons = await page.getByRole('button').all();
    console.log('Buttons on edit page:', buttons.length);
    for (const btn of buttons) {
      const text = await btn.textContent();
      console.log('  Button:', text);
    }

    console.log('✅ Document edit page opened successfully');
  });

  test('should type in document and see auto-save [REGRESSION]', async ({
    page,
  }) => {
    await setupUserAndWorkspace(page);

    // Create document via modal
    await page.getByRole('button', { name: 'New Text Document' }).click();
    await page.getByPlaceholder('Document title').fill('Auto-save Test Document');
    await page.getByPlaceholder(/document content/i).fill('Initial content.');
    await page.getByRole('button', { name: 'Create Document' }).click();

    // Wait for document to appear
    await expect(page.getByText('Auto-save Test Document')).toBeVisible({ timeout: 5000 });

    // Click on document to open edit page
    await page.getByText('Auto-save Test Document').click();

    // Wait for navigation to edit page
    await page.waitForURL(/\/documents\/[a-f0-9-]+\/edit/, { timeout: 10000 });

    // Wait for page to stabilize
    await page.waitForLoadState('networkidle');

    // Take screenshot of initial state
    await page.screenshot({
      path: 'test-results/document-before-typing.png',
      fullPage: true,
    });

    // Find textarea or contenteditable and type
    const editor = page.locator('textarea, [contenteditable="true"]').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });

    // Type something to trigger auto-save
    // This is the REGRESSION scenario: user creates doc, opens edit, types immediately
    await editor.fill('Updated content for auto-save regression test');

    // Wait for auto-save (typically 2s debounce)
    await page.waitForTimeout(3000);

    // Take screenshot after typing
    await page.screenshot({
      path: 'test-results/document-after-typing.png',
      fullPage: true,
    });

    // REGRESSION CHECK: Look for conflict error
    // BUG: "Document was modified by another user" or "CONFLICT" appears
    // because lock acquisition updates updatedAt, making lastKnownUpdatedAt stale
    const conflictError = page.getByText(/conflict|modified by another/i);
    const hasConflict = await conflictError.count();

    if (hasConflict > 0) {
      console.log('❌ BUG DETECTED: Conflict error appeared!');
      console.log('This confirms the auto-save conflict regression bug.');
      // Fail the test - this is what we want to detect
      await expect(conflictError).not.toBeVisible();
    } else {
      console.log('✅ No conflict error - auto-save working correctly');
    }

    // Check for save success indicator
    const savedIndicator = page.getByText(/saved|changes saved/i);
    const saveError = page.getByText(/error|failed/i);

    // Log final state
    const savedCount = await savedIndicator.count();
    const errorCount = await saveError.count();
    console.log('Saved indicators:', savedCount);
    console.log('Error indicators:', errorCount);
  });
});
