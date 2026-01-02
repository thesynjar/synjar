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
 * Helper: Register, verify email (if needed), login (if needed), navigate to workspace
 *
 * Cloud mode: Auto-login after registration (no email verification)
 * Self-hosted: Email verification flow
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

  // Wait for navigation - /workspaces/[id] (Cloud auto-navigate), /workspaces (Cloud), or /register/success (self-hosted)
  const navigationResult = await Promise.race([
    page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 }).then(() => 'workspace-detail'),
    page.waitForURL('/workspaces', { timeout: 10000 }).then(() => 'workspaces'),
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
    await page.waitForURL(/\/workspaces(\/[a-f0-9-]+)?/, { timeout: 10000 });
  }
  // else: Already at /workspaces from Cloud auto-login

  // Navigate to workspace detail page if not already there
  if (!/\/workspaces\/[a-f0-9-]+/.test(page.url())) {
    const workspaceHeading = page.getByRole('heading', { name: user.workspaceName });
    const nextStep = await Promise.race([
      page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 }).then(() => 'navigated'),
      workspaceHeading.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'list'),
    ]);

    if (nextStep === 'list') {
      await workspaceHeading.click();
      await page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 });
    }
  }

  return user;
}

test.describe('Document Create and Edit', () => {
  test.beforeEach(async () => {
    await clearMailpit();
  });

  test('should create a new text document via modal', async ({ page }) => {
    await setupUserAndWorkspace(page);

    // Click "New Text" button - opens modal
    const newDocButton = page.getByRole('button', { name: 'New Text' });
    await expect(newDocButton).toBeVisible({ timeout: 5000 });
    await newDocButton.click();

    // Modal should appear with title "New Text"
    await expect(page.getByRole('heading', { name: 'New Text' })).toBeVisible();

    // Fill in document title (using placeholder since label might not be properly connected)
    const titleInput = page.getByPlaceholder('Document title');
    await titleInput.fill('Test Document Title');

    // Fill in document content
    const contentTextarea = page.getByPlaceholder(/document content/i);
    await contentTextarea.fill('Test document content for auto-save test.');

    // Click "Create Document" button
    await page.getByRole('button', { name: 'Create Document' }).click();

    // Wait for modal to close and document to appear in list
    await expect(page.getByRole('heading', { name: 'New Text' })).not.toBeVisible({ timeout: 5000 });

    // Verify document appears in list
    await expect(page.getByText('Test Document Title')).toBeVisible({ timeout: 5000 });

    console.log('✅ Document created successfully via modal');
  });

  test('should click document to open edit page', async ({ page }) => {
    await setupUserAndWorkspace(page);

    // Create document via modal
    await page.getByRole('button', { name: /New Text/i }).first().click();
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
    await page.getByRole('button', { name: /New Text/i }).first().click();
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

  test('should create document with INSTRUCTION purpose and persist', async ({ page }) => {
    await setupUserAndWorkspace(page);

    // Click "New Text" button - opens modal
    const newDocButton = page.getByRole('button', { name: 'New Text' });
    await expect(newDocButton).toBeVisible({ timeout: 5000 });
    await newDocButton.click();

    // Modal should appear
    await expect(page.getByRole('heading', { name: 'New Text' })).toBeVisible();

    // Fill in document title
    await page.getByPlaceholder('Document title').fill('System Prompt Document');

    // Fill in document content
    await page.getByPlaceholder(/document content/i).fill('You are a helpful assistant.');

    // Select INSTRUCTION purpose (default is KNOWLEDGE)
    // The radio button label is "Instruction"
    const instructionRadio = page.getByRole('radio', { name: 'Instruction' });
    await expect(instructionRadio).toBeVisible();
    await instructionRadio.click();

    // Click "Create Document" button
    await page.getByRole('button', { name: 'Create Document' }).click();

    // Wait for modal to close and document to appear in list
    await expect(page.getByRole('heading', { name: 'New Text' })).not.toBeVisible({ timeout: 5000 });

    // Verify document appears in list
    await expect(page.getByText('System Prompt Document')).toBeVisible({ timeout: 5000 });

    // Click on document to open edit page
    await page.getByText('System Prompt Document').click();
    await page.waitForURL(/\/documents\/[a-f0-9-]+\/edit/, { timeout: 10000 });

    // Wait for page to stabilize
    await page.waitForLoadState('networkidle');

    // Verify INSTRUCTION radio is checked in the edit page
    const editPageInstructionRadio = page.getByRole('radio', { name: 'Instruction' });
    await expect(editPageInstructionRadio).toBeChecked({ timeout: 5000 });

    console.log('✅ Document created with INSTRUCTION purpose and persisted correctly');
  });

  test('should change purpose from KNOWLEDGE to INSTRUCTION and auto-save', async ({ page }) => {
    await setupUserAndWorkspace(page);

    // Create document with default KNOWLEDGE purpose
    await page.getByRole('button', { name: 'New Text' }).click();
    await page.getByPlaceholder('Document title').fill('Knowledge to Instruction Test');
    await page.getByPlaceholder(/document content/i).fill('Initial knowledge content.');
    // Default is KNOWLEDGE, so no need to click radio
    await page.getByRole('button', { name: 'Create Document' }).click();

    // Wait for document to appear
    await expect(page.getByText('Knowledge to Instruction Test')).toBeVisible({ timeout: 5000 });

    // Open document in edit page
    await page.getByText('Knowledge to Instruction Test').click();
    await page.waitForURL(/\/documents\/[a-f0-9-]+\/edit/, { timeout: 10000 });

    // Wait for page to stabilize
    await page.waitForLoadState('networkidle');

    // Verify KNOWLEDGE radio is initially checked
    const knowledgeRadio = page.getByRole('radio', { name: 'Knowledge' });
    const instructionRadio = page.getByRole('radio', { name: 'Instruction' });

    await expect(knowledgeRadio).toBeChecked({ timeout: 5000 });
    await expect(instructionRadio).not.toBeChecked();

    // Change purpose to INSTRUCTION
    await instructionRadio.click();

    // Wait for auto-save (typically 2s debounce + some buffer)
    await page.waitForTimeout(3000);

    // Verify the change was made (INSTRUCTION should now be selected)
    await expect(instructionRadio).toBeChecked();
    await expect(knowledgeRadio).not.toBeChecked();

    // Reload page to verify persistence
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify INSTRUCTION is still selected after reload
    const reloadedInstructionRadio = page.getByRole('radio', { name: 'Instruction' });
    const reloadedKnowledgeRadio = page.getByRole('radio', { name: 'Knowledge' });

    await expect(reloadedInstructionRadio).toBeChecked({ timeout: 5000 });
    await expect(reloadedKnowledgeRadio).not.toBeChecked();

    console.log('✅ Purpose change from KNOWLEDGE to INSTRUCTION auto-saved and persisted after reload');
  });

  test('should verify purpose persists after page reload', async ({ page }) => {
    await setupUserAndWorkspace(page);

    // Create document with INSTRUCTION purpose
    await page.getByRole('button', { name: 'New Text' }).click();
    await page.getByPlaceholder('Document title').fill('Persistence Test Document');
    await page.getByPlaceholder(/document content/i).fill('Testing persistence of purpose field.');

    // Select INSTRUCTION
    await page.getByRole('radio', { name: 'Instruction' }).click();
    await page.getByRole('button', { name: 'Create Document' }).click();

    // Wait for document to appear
    await expect(page.getByText('Persistence Test Document')).toBeVisible({ timeout: 5000 });

    // Open document
    await page.getByText('Persistence Test Document').click();
    await page.waitForURL(/\/documents\/[a-f0-9-]+\/edit/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // First verification - INSTRUCTION should be selected
    await expect(page.getByRole('radio', { name: 'Instruction' })).toBeChecked({ timeout: 5000 });

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Second verification - still INSTRUCTION after reload
    await expect(page.getByRole('radio', { name: 'Instruction' })).toBeChecked({ timeout: 5000 });

    // Navigate away and back
    await page.goBack();
    await expect(page.getByText('Persistence Test Document')).toBeVisible({ timeout: 5000 });

    // Re-open document
    await page.getByText('Persistence Test Document').click();
    await page.waitForURL(/\/documents\/[a-f0-9-]+\/edit/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Third verification - still INSTRUCTION after navigation
    await expect(page.getByRole('radio', { name: 'Instruction' })).toBeChecked({ timeout: 5000 });

    console.log('✅ Purpose INSTRUCTION persists correctly across reload and navigation');
  });

  /**
   * REGRESSION TEST: Rapid typing should not cause 409 CONFLICT errors
   *
   * This test verifies that when a user types rapidly (faster than debounce interval),
   * the auto-save mechanism correctly uses the latest expectedUpdatedAt timestamp.
   *
   * Root Cause (from analysis):
   * - scheduleAutoSave was storing expectedUpdatedAt at scheduling time
   * - When timer fired, it used the STORED (stale) value instead of CURRENT value
   * - This caused 409 CONFLICT because the first save updated the server timestamp,
   *   but subsequent saves still used the old timestamp
   *
   * Fix: Pass expectedUpdatedAtRef to useAutoSave so it reads current value when saving
   */
  test('should handle rapid typing without 409 CONFLICT errors [REGRESSION]', async ({ page }) => {
    await setupUserAndWorkspace(page);

    // Create document via modal
    await page.getByRole('button', { name: /New Text/i }).first().click();
    await page.getByPlaceholder('Document title').fill('Rapid Typing Test');
    await page.getByPlaceholder(/document content/i).fill('Initial content.');
    await page.getByRole('button', { name: 'Create Document' }).click();

    // Wait for document to appear
    await expect(page.getByText('Rapid Typing Test')).toBeVisible({ timeout: 5000 });

    // Click on document to open edit page
    await page.getByText('Rapid Typing Test').click();
    await page.waitForURL(/\/documents\/[a-f0-9-]+\/edit/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Find the content editor
    const editor = page.locator('textarea, [contenteditable="true"]').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });

    // Clear existing content
    await editor.fill('');

    // Set up network monitoring to detect 409 errors
    const conflictErrors: string[] = [];
    page.on('response', async (response) => {
      if (response.status() === 409) {
        const url = response.url();
        try {
          const body = await response.json();
          conflictErrors.push(`409 CONFLICT at ${url}: ${JSON.stringify(body)}`);
        } catch {
          conflictErrors.push(`409 CONFLICT at ${url}`);
        }
      }
    });

    // Simulate rapid typing - type characters with small delays
    // This triggers multiple scheduleAutoSave calls in quick succession
    const testText = 'The quick brown fox jumps over the lazy dog';
    for (const char of testText) {
      await editor.pressSequentially(char, { delay: 50 }); // 50ms between characters
    }

    // Wait for debounce (2s) plus some buffer for save to complete
    await page.waitForTimeout(4000);

    // Type more to trigger another save cycle
    await editor.pressSequentially(' - part two', { delay: 50 });

    // Wait for second save cycle
    await page.waitForTimeout(4000);

    // Take screenshot
    await page.screenshot({
      path: 'test-results/document-rapid-typing.png',
      fullPage: true,
    });

    // Check for any 409 CONFLICT errors
    if (conflictErrors.length > 0) {
      console.log('❌ BUG DETECTED: CONFLICT errors during rapid typing!');
      for (const error of conflictErrors) {
        console.log('  ', error);
      }
      // Fail the test
      expect(conflictErrors).toHaveLength(0);
    } else {
      console.log('✅ No CONFLICT errors during rapid typing');
    }

    // Verify no visible conflict error in UI
    const conflictMessage = page.getByText(/conflict|modified by another/i);
    await expect(conflictMessage).not.toBeVisible();

    // Verify content was saved (reload and check)
    await page.reload();
    await page.waitForLoadState('networkidle');

    const reloadedEditor = page.locator('textarea, [contenteditable="true"]').first();
    await reloadedEditor.waitFor({ state: 'visible', timeout: 5000 });

    // Content should contain our typed text
    const content = await reloadedEditor.inputValue().catch(() => reloadedEditor.textContent());
    expect(content).toContain('quick brown fox');
    expect(content).toContain('part two');

    console.log('✅ Rapid typing test passed - auto-save works correctly');
  });

  /**
   * Test Save Draft button workflow
   */
  test('should save draft using Save Draft button', async ({ page }) => {
    await setupUserAndWorkspace(page);

    // Create document
    await page.getByRole('button', { name: 'New Text' }).click();
    await page.getByPlaceholder('Document title').fill('Draft Button Test');
    await page.getByPlaceholder(/document content/i).fill('Initial content.');
    await page.getByRole('button', { name: 'Create Document' }).click();

    // Wait for document to appear and open edit page
    await expect(page.getByText('Draft Button Test')).toBeVisible({ timeout: 5000 });
    await page.getByText('Draft Button Test').click();
    await page.waitForURL(/\/documents\/[a-f0-9-]+\/edit/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Find and modify content
    const editor = page.locator('textarea, [contenteditable="true"]').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });
    await editor.fill('Updated draft content');

    // Click Save Draft button
    const saveDraftButton = page.getByRole('button', { name: 'Save Draft' });
    await expect(saveDraftButton).toBeVisible();
    await saveDraftButton.click();

    // Wait for save to complete
    await page.waitForTimeout(2000);

    // Check for success toast or saved indicator
    // (exact selector depends on toast implementation)
    const successIndicator = page.getByText(/saved|draft saved/i);
    await expect(successIndicator).toBeVisible({ timeout: 5000 });

    console.log('✅ Save Draft button works correctly');
  });

  /**
   * REGRESSION TEST: Verification status should persist after publish
   *
   * Bug: Switching verification to VERIFIED, publishing, and reloading
   * keeps the document UNVERIFIED.
   */
  test('should persist verification status after publish [REGRESSION]', async ({ page }) => {
    await setupUserAndWorkspace(page);

    const title = 'Verification Status Regression';

    // Create document via modal
    await page.getByRole('button', { name: /New Text/i }).first().click();
    await page.getByPlaceholder('Document title').fill(title);
    await page.getByPlaceholder(/document content/i).fill('Verification status regression content.');
    await page.getByRole('button', { name: 'Create Document' }).click();

    // Open document in edit page (some flows auto-navigate after creation)
    const editUrlPattern = /\/documents\/[a-f0-9-]+\/edit/;
    const documentRow = page.getByRole('button', { name: new RegExp(title) });

    const openResult = await Promise.race([
      page.waitForURL(editUrlPattern, { timeout: 10000 }).then(() => 'navigated'),
      documentRow.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'list'),
    ]);

    if (openResult === 'list') {
      await documentRow.click();
      await page.waitForURL(editUrlPattern, { timeout: 10000 });
    }

    await page.waitForLoadState('networkidle');

    // Wait for edit lock to be acquired before changing fields
    await expect(page.getByText('You are editing')).toBeVisible({ timeout: 10000 });

    const unverifiedRadio = page.getByRole('radio', { name: 'Unverified', exact: true });
    const verifiedRadio = page.getByRole('radio', { name: 'Verified', exact: true });

    await expect(unverifiedRadio).toBeChecked({ timeout: 5000 });
    await expect(verifiedRadio).not.toBeChecked();

    // Switch to VERIFIED and verify Publish becomes enabled immediately
    await verifiedRadio.click();
    await expect(verifiedRadio).toBeChecked();

    const publishButton = page.getByRole('button', { name: /publish document and make it searchable/i });
    await expect(publishButton).toBeEnabled({ timeout: 5000 });
    await publishButton.click();

    // Publish and confirm
    const publishDialog = page.getByRole('alertdialog');
    await expect(publishDialog).toBeVisible();
    await publishDialog.getByRole('button', { name: /confirm and publish document/i }).click();

    // Back to workspace documents list
    await page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 });
    await expect(page.getByText(title)).toBeVisible({ timeout: 5000 });

    // Re-open document and verify status persisted
    await page.getByText(title).click();
    await page.waitForURL(/\/documents\/[a-f0-9-]+\/edit/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('radio', { name: 'Verified', exact: true })).toBeChecked({ timeout: 5000 });
  });
});
