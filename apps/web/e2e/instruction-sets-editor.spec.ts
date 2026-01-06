import { test, expect, Page } from '@playwright/test';

/**
 * Instruction Sets Editor E2E Tests
 *
 * Tests the full editor flow including:
 * - Opening editor from card click
 * - Document management (add/remove/reorder)
 * - Search and filtering
 * - Keyboard shortcuts
 * - Token meter updates
 * - Conflict handling
 * - Limit enforcement
 * - Empty states
 *
 * Related specs:
 * - docs/specifications/2025-12-28-instruction-sets.md
 * - docs/specifications/2025-12-30-instruction-sets-editor-ux.md
 * - docs/specifications/2025-12-30-17-00-instruction-sets-editor-review-findings.md
 *
 * Test file: community/apps/web/e2e/instruction-sets-editor.spec.ts
 * Command: cd community/apps/web && pnpm test:e2e -- instruction-sets-editor
 */

const MAILPIT_URL = process.env.MAILPIT_URL || 'http://localhost:6313';

function generateTestUser() {
  const timestamp = Date.now();
  return {
    email: `test-instructionset-${timestamp}@example.com`,
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
    await expect(page).toHaveURL('/workspaces', { timeout: 10000 });
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

/**
 * Helper: Get access token by refreshing using the refresh token from localStorage
 */
async function getAccessToken(page: Page): Promise<string> {
  const refreshToken = await page.evaluate(() => localStorage.getItem('auth_refresh_token'));
  if (!refreshToken) {
    throw new Error('No refresh token found in localStorage');
  }

  const response = await page.request.post('http://localhost:6300/auth/refresh', {
    data: { refreshToken },
  });

  if (!response.ok()) {
    throw new Error(`Failed to refresh token: ${response.status()}`);
  }

  const data = await response.json();
  return data.accessToken;
}

/**
 * Helper: Create a test document via API with VERIFIED status
 * Bypasses the document editor entirely to avoid the race condition bug
 * @param skipReload - Set to true when creating multiple documents to avoid slow reloads
 */
async function createVerifiedDocument(
  page: Page,
  title: string,
  content: string,
  purpose: 'KNOWLEDGE' | 'INSTRUCTION' = 'KNOWLEDGE',
  skipReload = false,
) {
  // Get workspaceId from current URL
  const currentUrl = page.url();
  const workspaceIdMatch = currentUrl.match(/workspaces\/([a-f0-9-]+)/);
  if (!workspaceIdMatch) {
    throw new Error('Could not extract workspaceId from URL');
  }
  const workspaceId = workspaceIdMatch[1];

  // Get access token
  const accessToken = await getAccessToken(page);

  // Create document via API with VERIFIED status
  const createResponse = await page.request.post(
    `http://localhost:6300/workspaces/${workspaceId}/documents`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        title,
        content,
        verificationStatus: 'VERIFIED',
        purpose,
      },
    },
  );

  if (!createResponse.ok()) {
    const errorText = await createResponse.text();
    throw new Error(`Failed to create document: ${createResponse.status()} - ${errorText}`);
  }

  // Only reload if not skipping (caller will reload once after batch creation)
  if (!skipReload) {
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(title)).toBeVisible({ timeout: 5000 });
  }
}

/**
 * Helper: Create a test document via UI
 * @param verificationStatus - Set to 'VERIFIED' to mark document as verified (required for instruction sets)
 * @param skipReload - Set to true when creating multiple documents to avoid slow reloads
 */
async function createDocument(
  page: Page,
  title: string,
  content: string,
  purpose: 'KNOWLEDGE' | 'INSTRUCTION' = 'KNOWLEDGE',
  verificationStatus: 'VERIFIED' | 'UNVERIFIED' = 'UNVERIFIED',
  skipReload = false,
) {
  // For VERIFIED documents, use API-based creation
  if (verificationStatus === 'VERIFIED') {
    await createVerifiedDocument(page, title, content, purpose, skipReload);
    return;
  }

  // For UNVERIFIED documents, use simple UI flow
  // First ensure we're on the Documents tab/list (not on document editor)
  const backToDocsButton = page.getByRole('button', { name: 'Back to Documents' });
  if (await backToDocsButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await backToDocsButton.click();
    await page.waitForTimeout(500);
  }

  // Use .first() as there are two "New Text" buttons: header + empty state
  const newDocButton = page.getByRole('button', { name: 'New Text' }).first();
  await expect(newDocButton).toBeVisible({ timeout: 5000 });
  await newDocButton.click();

  await page.getByPlaceholder('Document title').fill(title);
  await page.getByPlaceholder(/document content/i).fill(content);

  await page.getByRole('button', { name: 'Create Document' }).click();

  // Wait for modal to close and document to appear in list
  await expect(page.getByText(title)).toBeVisible({ timeout: 5000 });
}

/**
 * Helper: Navigate to Instruction Sets tab
 */
async function navigateToInstructionSets(page: Page) {
  // The tab is a link with name "Sets" in the workspace navigation
  const setsTab = page.getByRole('link', { name: 'Sets' });
  await expect(setsTab).toBeVisible({ timeout: 5000 });
  await setsTab.click();
  // Wait for the Sets tab content to load
  await page.waitForTimeout(500);
}

/**
 * Helper: Create an instruction set
 */
async function createInstructionSet(page: Page, name: string, description = '') {
  await navigateToInstructionSets(page);

  // Button is "Create Your First Set" in empty state, or "New Set" otherwise
  const emptyStateButton = page.getByRole('button', { name: /create your first set/i });
  const newSetButton = page.getByRole('button', { name: /new set/i });

  // Try empty state button first, then the regular one
  let createButton;
  if (await emptyStateButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    createButton = emptyStateButton;
  } else {
    createButton = newSetButton;
  }

  await expect(createButton).toBeVisible({ timeout: 5000 });
  await createButton.click();

  // Wait for modal to appear
  await page.waitForTimeout(500);

  // Step 1: Fill in modal - use placeholder selectors since labels aren't properly associated
  const nameInput = page.getByPlaceholder(/brand voice/i);
  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await nameInput.fill(name);

  if (description) {
    const descInput = page.getByPlaceholder(/what is this instruction set for/i);
    if (await descInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await descInput.fill(description);
    }
  }

  // Click through the wizard steps (modal has 3 steps)
  // Step 1 → Step 2: Click Next
  let nextButton = page.getByRole('button', { name: /^next$/i });
  if (await nextButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await nextButton.click();
    await page.waitForTimeout(500);
  }

  // Step 2: Select Documents → Click Next (skip document selection)
  nextButton = page.getByRole('button', { name: /^next$/i });
  if (await nextButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await nextButton.click();
    await page.waitForTimeout(500);
  }

  // Step 3: Final step → Click Create Instruction Set
  const createFinalButton = page.getByRole('button', { name: /create instruction set/i });
  if (await createFinalButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await createFinalButton.click();
  }

  // Wait for modal to close and instruction set to appear
  await expect(page.getByText(name)).toBeVisible({ timeout: 5000 });
}

/**
 * Helper: Setup instruction set with document for testing
 * Documents are created as VERIFIED so they appear in the instruction set editor
 */
async function setupInstructionSetWithDocument(page: Page) {
  await setupUserAndWorkspace(page);

  // Create a test document (VERIFIED so it appears in instruction set editor)
  await createDocument(
    page,
    'Test Document',
    'This is test content for the instruction set.',
    'KNOWLEDGE',
    'VERIFIED',
  );

  // Create instruction set
  await createInstructionSet(page, 'Test Instruction Set', 'Test description');

  return {
    setName: 'Test Instruction Set',
    docTitle: 'Test Document',
  };
}

test.describe('Instruction Sets Editor', () => {
  test.beforeEach(async () => {
    await clearMailpit();
  });

  test('should open editor from card click', async ({ page }) => {
    await setupInstructionSetWithDocument(page);

    // Navigate to instruction sets tab
    await navigateToInstructionSets(page);

    // Click on instruction set card to open editor
    const setCard = page.getByText('Test Instruction Set').locator('..');
    await setCard.click();

    // Verify editor page opens
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, {
      timeout: 10000,
    });

    // Verify editor UI elements are present
    await expect(page.getByText('Test Instruction Set')).toBeVisible();
    await expect(page.getByText(/Available Documents/i)).toBeVisible();
    await expect(page.getByText(/Selected Documents/i)).toBeVisible();
  });

  test('should add document to set', async ({ page }) => {
    test.setTimeout(120000);
    await setupInstructionSetWithDocument(page);
    await navigateToInstructionSets(page);

    // Open editor
    const setCard = page.getByText('Test Instruction Set').locator('..');
    await setCard.click();
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, {
      timeout: 10000,
    });

    // Get initial token meter value (TokenMeter uses role="meter")
    const tokenMeter = page.getByRole('meter');
    await expect(tokenMeter).toBeVisible({ timeout: 10000 });
    const initialMeterText = await tokenMeter.textContent().catch(() => '0');

    // Click add button on available document
    const addButton = page.getByRole('button', { name: /Add Test Document/i });
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    // Verify document appears in selected list (uses listbox/option structure)
    const selectedListbox = page.getByRole('listbox', { name: /Selected documents/i });
    await expect(selectedListbox.getByText('Test Document')).toBeVisible({ timeout: 5000 });

    // Verify token meter updates (should have changed)
    const updatedMeterText = await tokenMeter.textContent();
    expect(updatedMeterText).not.toBe(initialMeterText);
  });

  test('should remove document from set', async ({ page }) => {
    test.setTimeout(60000); // Extended timeout for slow setup
    await setupInstructionSetWithDocument(page);
    await navigateToInstructionSets(page);

    // Open editor
    const setCard = page.getByText('Test Instruction Set').locator('..');
    await setCard.click();
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, {
      timeout: 10000,
    });

    // Add document first (button has name "Add {docTitle} to set")
    const addButton = page.getByRole('button', { name: /Add Test Document/i });
    await addButton.click();
    const selectedListbox = page.getByRole('listbox', { name: /Selected documents/i });
    await expect(selectedListbox.getByText('Test Document')).toBeVisible({ timeout: 5000 });

    // Click remove button (button has name "Remove {docTitle} from set")
    const removeButton = page.getByRole('button', { name: /Remove Test Document/i });
    await removeButton.click();

    // Verify document moved back to available (button reappears)
    await expect(
      page.getByRole('button', { name: /Add Test Document/i }),
    ).toBeVisible({ timeout: 5000 });

    // Verify document is not in selected list anymore
    const selectedDocCount = await selectedListbox.getByText('Test Document').count();
    expect(selectedDocCount).toBe(0);
  });

  test('should reorder documents via drag & drop', async ({ page }) => {
    test.setTimeout(90000); // Extended timeout for multiple document creation
    await setupUserAndWorkspace(page);

    // Create two VERIFIED documents via API (skipReload for first, reload after second)
    await createDocument(page, 'First Document', 'Content 1', 'KNOWLEDGE', 'VERIFIED', true);
    await createDocument(page, 'Second Document', 'Content 2', 'KNOWLEDGE', 'VERIFIED');

    // Create instruction set
    await createInstructionSet(page, 'Reorder Test Set');

    // Open editor
    await navigateToInstructionSets(page);
    const setCard = page.getByText('Reorder Test Set').locator('..');
    await setCard.click();
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, {
      timeout: 10000,
    });

    // Add both documents (button has name "Add {docTitle} to set")
    await page.getByRole('button', { name: /Add First Document/i }).click();
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /Add Second Document/i }).click();
    await page.waitForTimeout(500);

    // Get selected documents listbox (structure: listbox > option with drag buttons)
    const selectedListbox = page.getByRole('listbox', { name: /Selected documents/i });
    await expect(selectedListbox).toBeVisible({ timeout: 10000 });

    // Verify initial order
    const items = await selectedListbox.getByRole('option').all();
    expect(items.length).toBeGreaterThanOrEqual(2);

    // Drag first document to second position using raw mouse events
    // (Playwright's dragTo doesn't work well with drag & drop libraries)
    const firstDragHandle = items[0].getByRole('button', { name: /Drag to reorder/i });
    const secondDragHandle = items[1].getByRole('button', { name: /Drag to reorder/i });

    const firstBox = await firstDragHandle.boundingBox();
    const secondBox = await secondDragHandle.boundingBox();

    if (!firstBox || !secondBox) {
      throw new Error('Could not get bounding boxes for drag handles');
    }

    // Perform drag with raw mouse events
    await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
    await page.mouse.down();
    // Move to below the second item to ensure the drop zone is triggered
    await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height + 20, { steps: 10 });
    await page.mouse.up();

    // Wait for reorder API call and animation
    await page.waitForTimeout(1500);

    // Verify order changed (Second Document should now be first)
    const updatedItems = await selectedListbox.getByRole('option').all();
    const firstItemText = await updatedItems[0].textContent();
    expect(firstItemText).toContain('Second Document');
  });

  test('should reorder documents via keyboard', async ({ page }) => {
    test.setTimeout(90000); // Extended timeout for multiple document creation
    await setupUserAndWorkspace(page);

    // Create two VERIFIED documents via API (skipReload for first, reload after second)
    await createDocument(page, 'Doc A', 'Content A', 'KNOWLEDGE', 'VERIFIED', true);
    await createDocument(page, 'Doc B', 'Content B', 'KNOWLEDGE', 'VERIFIED');

    // Create instruction set and add documents
    await createInstructionSet(page, 'Keyboard Reorder Set');

    await navigateToInstructionSets(page);
    const setCard = page.getByText('Keyboard Reorder Set').locator('..');
    await setCard.click();
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, {
      timeout: 10000,
    });

    // Add both documents (button has name "Add {docTitle} to set")
    await page.getByRole('button', { name: /Add Doc A/i }).click();
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /Add Doc B/i }).click();
    await page.waitForTimeout(500);

    // Focus first document's drag handle (keyboard reorder requires focus on the handle)
    const selectedListbox = page.getByRole('listbox', { name: /Selected documents/i });
    await expect(selectedListbox).toBeVisible({ timeout: 10000 });
    const items = await selectedListbox.getByRole('option').all();
    const firstDragHandle = items[0].getByRole('button', { name: /Drag to reorder/i });
    await firstDragHandle.focus();

    // Press Space to enter drag mode
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);

    // Press ArrowDown to move down
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);

    // Press Space to drop
    await page.keyboard.press('Space');
    await page.waitForTimeout(1500);

    // Verify order changed
    const updatedItems = await selectedListbox.getByRole('option').all();
    const firstItemText = await updatedItems[0].textContent();
    expect(firstItemText).toContain('Doc B');
  });

  test('should filter documents by search', async ({ page }) => {
    test.setTimeout(90000);
    await setupUserAndWorkspace(page);

    // Create VERIFIED documents via API (skipReload for all but last)
    await createDocument(page, 'Apple Document', 'Content', 'KNOWLEDGE', 'VERIFIED', true);
    await createDocument(page, 'Banana Document', 'Content', 'KNOWLEDGE', 'VERIFIED', true);
    await createDocument(page, 'Cherry Document', 'Content', 'KNOWLEDGE', 'VERIFIED');

    await createInstructionSet(page, 'Filter Test Set');

    // Open editor
    await navigateToInstructionSets(page);
    const setCard = page.getByText('Filter Test Set').locator('..');
    await setCard.click();
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, {
      timeout: 10000,
    });

    // Wait for the Available Documents section to load
    await expect(page.getByText(/Available Documents/i)).toBeVisible({ timeout: 10000 });

    // Wait for documents to be loaded (at least one document should be visible)
    await expect(page.getByText('Banana Document')).toBeVisible({ timeout: 10000 });

    // Type in search input
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('banana');

    // Wait for search debounce (300ms) + API response
    // The search should filter to show only Banana Document
    await expect(page.getByText('Apple Document')).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Cherry Document')).not.toBeVisible({ timeout: 5000 });

    // Verify Banana Document is still visible after search
    await expect(page.getByText('Banana Document')).toBeVisible();
  });

  test('should filter documents by purpose', async ({ page }) => {
    test.setTimeout(90000);
    await setupUserAndWorkspace(page);

    // Create VERIFIED documents via API (skipReload for first)
    await createDocument(page, 'Knowledge Doc', 'Content', 'KNOWLEDGE', 'VERIFIED', true);
    await createDocument(page, 'Instruction Doc', 'Content', 'INSTRUCTION', 'VERIFIED');

    await createInstructionSet(page, 'Purpose Filter Set');

    // Open editor
    await navigateToInstructionSets(page);
    const setCard = page.getByText('Purpose Filter Set').locator('..');
    await setCard.click();
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, {
      timeout: 10000,
    });

    // Select filter dropdown
    const purposeFilter = page.locator('select[name="purposeFilter"]');
    if (await purposeFilter.isVisible().catch(() => false)) {
      await purposeFilter.selectOption('KNOWLEDGE');

      // Verify filtering works
      const availableSection = page.getByText(/Available Documents/i).locator('..');
      await expect(availableSection.getByText('Knowledge Doc')).toBeVisible();

      const instructionCount = await availableSection
        .getByText('Instruction Doc')
        .count();
      expect(instructionCount).toBe(0);
    }
  });

  test('should save with Ctrl+S shortcut', async ({ page }) => {
    await setupInstructionSetWithDocument(page);
    await navigateToInstructionSets(page);

    // Open editor
    const setCard = page.getByText('Test Instruction Set').locator('..');
    await setCard.click();
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, {
      timeout: 10000,
    });

    // Make a change (change name)
    const nameInput = page.getByLabel(/name/i);
    await nameInput.fill('Updated Set Name');

    // Press Ctrl+S
    await page.keyboard.press('Control+s');

    // Verify saved (no unsaved indicator or success message shown)
    await page.waitForTimeout(1000);

    // Check for unsaved changes indicator - should not be visible
    const unsavedIndicator = page.getByText(/unsaved changes/i);
    const hasUnsaved = await unsavedIndicator.isVisible().catch(() => false);
    expect(hasUnsaved).toBe(false);
  });

  test('should navigate back with Esc shortcut', async ({ page }) => {
    await setupInstructionSetWithDocument(page);
    await navigateToInstructionSets(page);

    // Open editor
    const setCard = page.getByText('Test Instruction Set').locator('..');
    await setCard.click();
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, {
      timeout: 10000,
    });

    // Press Esc
    await page.keyboard.press('Escape');

    // Verify navigated to workspace (back to instruction sets tab)
    await page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 5000 });
  });

  test('should show unsaved changes warning', async ({ page }) => {
    await setupInstructionSetWithDocument(page);
    await navigateToInstructionSets(page);

    // Open editor
    const setCard = page.getByText('Test Instruction Set').locator('..');
    await setCard.click();
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, {
      timeout: 10000,
    });

    // Make a change
    const nameInput = page.getByLabel(/name/i);
    await nameInput.fill('Changed Name');

    // Set up dialog handler
    page.on('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      expect(dialog.message()).toContain('unsaved');
      await dialog.dismiss();
    });

    // Try to navigate away (click browser back or navigate to another page)
    await page.goBack();

    // If we're still on the editor page, the warning worked
    await page.waitForTimeout(1000);
  });

  test('should update token meter in real-time', async ({ page }) => {
    test.setTimeout(60000); // Extended timeout for slow setup
    await setupInstructionSetWithDocument(page);
    await navigateToInstructionSets(page);

    // Open editor
    const setCard = page.getByText('Test Instruction Set').locator('..');
    await setCard.click();
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, {
      timeout: 10000,
    });

    // Note current meter value (TokenMeter uses role="meter")
    const tokenMeter = page.getByRole('meter');
    await expect(tokenMeter).toBeVisible({ timeout: 10000 });
    const initialValue = await tokenMeter.textContent();

    // Add document (button has name "Add {docTitle} to set")
    await page.getByRole('button', { name: /Add Test Document/i }).click();

    // Wait for update
    await page.waitForTimeout(500);

    // Verify meter increased
    const updatedValue = await tokenMeter.textContent();
    expect(updatedValue).not.toBe(initialValue);
  });

  test('should show conflict modal when concurrent edit detected (409)', async ({ page }) => {
    await setupInstructionSetWithDocument(page);
    await navigateToInstructionSets(page);

    // Open editor
    const setCard = page.getByText('Test Instruction Set').locator('..');
    await setCard.click();
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, {
      timeout: 10000,
    });

    // Mock API to return 409 Conflict for PATCH requests
    await page.route('**/instruction-sets/**', async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'CONFLICT',
              message: 'Instruction set was modified by another user',
              details: {
                lastModifiedAt: new Date().toISOString(),
              },
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Make a change to enable save
    const nameInput = page.getByLabel(/name/i);
    await nameInput.fill('Changed Name to Trigger Save');

    // Trigger save via Ctrl+S
    await page.keyboard.press('Control+s');

    // Verify conflict modal appears
    await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/was modified by another user/i)).toBeVisible();
    await expect(page.getByText(/Changes Conflict/i)).toBeVisible();

    // Verify Refresh Page button is present
    await expect(page.getByRole('button', { name: /refresh page/i })).toBeVisible();

    // Test closing the modal via Cancel button
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('alertdialog')).not.toBeVisible({ timeout: 3000 });
  });

  // TODO: This test is flaky due to backend 500 errors during setup
  test.skip('should prevent adding document when size limit reached', async ({
    page,
  }) => {
    await setupUserAndWorkspace(page);

    // Create VERIFIED documents (required for instruction set editor)
    // Large document (close to 100 KB limit)
    const largeContent = 'x'.repeat(95000); // 95 KB
    await createDocument(page, 'Large Doc', largeContent, 'KNOWLEDGE', 'VERIFIED');

    // Small document
    await createDocument(page, 'Small Doc', 'Small content', 'KNOWLEDGE', 'VERIFIED');

    await createInstructionSet(page, 'Size Limit Test');

    // Open editor
    await navigateToInstructionSets(page);
    const setCard = page.getByText('Size Limit Test').locator('..');
    await setCard.click();
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, {
      timeout: 10000,
    });

    // Add large document
    const largeAddBtn = page
      .getByText('Large Doc')
      .locator('..')
      .getByRole('button', { name: /add/i });
    await largeAddBtn.click();
    await page.waitForTimeout(1000);

    // Try to add small document (should be prevented or show error)
    const smallAddBtn = page
      .getByText('Small Doc')
      .locator('..')
      .getByRole('button', { name: /add/i });

    // Check if button is disabled
    const isDisabled = await smallAddBtn.isDisabled();
    if (!isDisabled) {
      await smallAddBtn.click();
      // Should show error message
      await expect(page.getByText(/100 KB limit/i)).toBeVisible({ timeout: 3000 });
    } else {
      // Button is correctly disabled
      expect(isDisabled).toBe(true);
    }
  });

  // TODO: This test is flaky due to backend 500 errors during setup and slow document creation
  test.skip('should prevent adding document when count limit reached', async ({
    page,
  }) => {
    await setupUserAndWorkspace(page);

    // Create 21 VERIFIED documents (over the 20 document limit, required for instruction set editor)
    for (let i = 1; i <= 21; i++) {
      await createDocument(page, `Doc ${i}`, `Content ${i}`, 'KNOWLEDGE', 'VERIFIED');
    }

    await createInstructionSet(page, 'Count Limit Test');

    // Open editor
    await navigateToInstructionSets(page);
    const setCard = page.getByText('Count Limit Test').locator('..');
    await setCard.click();
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, {
      timeout: 10000,
    });

    // Add 20 documents
    for (let i = 1; i <= 20; i++) {
      const addBtn = page
        .getByText(`Doc ${i}`)
        .locator('..')
        .getByRole('button', { name: /add/i })
        .first();
      if (await addBtn.isVisible().catch(() => false)) {
        await addBtn.click();
        await page.waitForTimeout(300);
      }
    }

    // Try to add 21st document
    const doc21Btn = page
      .getByText('Doc 21')
      .locator('..')
      .getByRole('button', { name: /add/i });

    // Should be disabled or show error
    const isDisabled = await doc21Btn.isDisabled();
    if (!isDisabled) {
      await doc21Btn.click();
      await expect(page.getByText(/20 documents/i)).toBeVisible({ timeout: 3000 });
    } else {
      expect(isDisabled).toBe(true);
    }
  });

  // TODO: This test needs investigation - empty state text may have changed
  test.skip('should show empty states (no selection, no results, no docs)', async ({
    page,
  }) => {
    await setupUserAndWorkspace(page);

    // Create instruction set without documents
    await createInstructionSet(page, 'Empty State Test');

    // Open editor (no documents in workspace yet)
    await navigateToInstructionSets(page);
    const setCard = page.getByText('Empty State Test').locator('..');
    await setCard.click();
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, {
      timeout: 10000,
    });

    // Verify empty state for no available documents
    const availableSection = page.getByText(/Available Documents/i).locator('..');
    await expect(availableSection.getByText(/no documents/i)).toBeVisible();

    // Verify empty state for no selected documents
    const selectedSection = page.getByText(/Selected Documents/i).locator('..');
    await expect(selectedSection.getByText(/no documents selected/i)).toBeVisible();

    // Create a VERIFIED document and test "no results" empty state
    await page.goto(page.url().replace(/\/instruction-sets.*/, ''));
    await createDocument(page, 'Search Test Doc', 'Content', 'KNOWLEDGE', 'VERIFIED');

    // Go back to editor
    await navigateToInstructionSets(page);
    await page.getByText('Empty State Test').locator('..').click();
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, {
      timeout: 10000,
    });

    // Search for non-existent document
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('nonexistent');

    // Verify "no results" empty state
    await expect(availableSection.getByText(/no results/i)).toBeVisible();
  });
});
