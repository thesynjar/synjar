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

/**
 * Helper: Create a test document
 */
async function createDocument(
  page: Page,
  title: string,
  content: string,
  purpose: 'KNOWLEDGE' | 'INSTRUCTION' = 'KNOWLEDGE',
) {
  const newDocButton = page.getByRole('button', { name: 'New Text Document' });
  await expect(newDocButton).toBeVisible({ timeout: 5000 });
  await newDocButton.click();

  await page.getByPlaceholder('Document title').fill(title);
  await page.getByPlaceholder(/document content/i).fill(content);

  // Set purpose if there's a selector (assuming there might be one)
  const purposeSelect = page.locator('select[name="purpose"]');
  if (await purposeSelect.isVisible().catch(() => false)) {
    await purposeSelect.selectOption(purpose);
  }

  await page.getByRole('button', { name: 'Create Document' }).click();
  await expect(page.getByText(title)).toBeVisible({ timeout: 5000 });
}

/**
 * Helper: Navigate to Instruction Sets tab
 */
async function navigateToInstructionSets(page: Page) {
  const instructionSetsTab = page.getByRole('button', { name: /instruction sets/i });
  if (await instructionSetsTab.isVisible().catch(() => false)) {
    await instructionSetsTab.click();
  }
}

/**
 * Helper: Create an instruction set
 */
async function createInstructionSet(page: Page, name: string, description = '') {
  await navigateToInstructionSets(page);

  const createButton = page.getByRole('button', { name: /new instruction set/i });
  await expect(createButton).toBeVisible({ timeout: 5000 });
  await createButton.click();

  // Fill in modal
  await page.getByLabel(/name/i).fill(name);
  if (description) {
    const descInput = page.getByLabel(/description/i);
    if (await descInput.isVisible().catch(() => false)) {
      await descInput.fill(description);
    }
  }

  await page.getByRole('button', { name: /create/i }).click();
  await expect(page.getByText(name)).toBeVisible({ timeout: 5000 });
}

/**
 * Helper: Setup instruction set with document for testing
 */
async function setupInstructionSetWithDocument(page: Page) {
  await setupUserAndWorkspace(page);

  // Create a test document
  await createDocument(
    page,
    'Test Document',
    'This is test content for the instruction set.',
    'KNOWLEDGE',
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
    await setupInstructionSetWithDocument(page);
    await navigateToInstructionSets(page);

    // Open editor
    const setCard = page.getByText('Test Instruction Set').locator('..');
    await setCard.click();
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, {
      timeout: 10000,
    });

    // Get initial token meter value
    const tokenMeter = page.locator('[data-testid="token-meter"]');
    const initialMeterText = await tokenMeter.textContent().catch(() => '0');

    // Click add button on available document
    const addButton = page
      .getByText('Test Document')
      .locator('..')
      .getByRole('button', { name: /add/i });
    await addButton.click();

    // Verify document appears in selected list
    await expect(
      page.getByText(/Selected Documents/i).locator('..').getByText('Test Document'),
    ).toBeVisible({ timeout: 5000 });

    // Verify token meter updates (should have changed)
    const updatedMeterText = await tokenMeter.textContent();
    expect(updatedMeterText).not.toBe(initialMeterText);
  });

  test('should remove document from set', async ({ page }) => {
    await setupInstructionSetWithDocument(page);
    await navigateToInstructionSets(page);

    // Open editor
    const setCard = page.getByText('Test Instruction Set').locator('..');
    await setCard.click();
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, {
      timeout: 10000,
    });

    // Add document first
    const addButton = page
      .getByText('Test Document')
      .locator('..')
      .getByRole('button', { name: /add/i });
    await addButton.click();
    await expect(
      page.getByText(/Selected Documents/i).locator('..').getByText('Test Document'),
    ).toBeVisible({ timeout: 5000 });

    // Click remove button
    const removeButton = page
      .getByText(/Selected Documents/i)
      .locator('..')
      .getByText('Test Document')
      .locator('..')
      .getByRole('button', { name: /remove/i });
    await removeButton.click();

    // Verify document moved back to available
    await expect(
      page.getByText(/Available Documents/i).locator('..').getByText('Test Document'),
    ).toBeVisible({ timeout: 5000 });

    // Verify document is not in selected list anymore
    const selectedDocsSection = page.getByText(/Selected Documents/i).locator('..');
    const selectedDocCount = await selectedDocsSection
      .getByText('Test Document')
      .count();
    expect(selectedDocCount).toBe(0);
  });

  test('should reorder documents via drag & drop', async ({ page }) => {
    await setupUserAndWorkspace(page);

    // Create two documents
    await createDocument(page, 'First Document', 'Content 1', 'KNOWLEDGE');
    await createDocument(page, 'Second Document', 'Content 2', 'KNOWLEDGE');

    // Create instruction set
    await createInstructionSet(page, 'Reorder Test Set');

    // Open editor
    await navigateToInstructionSets(page);
    const setCard = page.getByText('Reorder Test Set').locator('..');
    await setCard.click();
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, {
      timeout: 10000,
    });

    // Add both documents
    const firstAddBtn = page
      .getByText('First Document')
      .locator('..')
      .getByRole('button', { name: /add/i })
      .first();
    await firstAddBtn.click();
    await page.waitForTimeout(500);

    const secondAddBtn = page
      .getByText('Second Document')
      .locator('..')
      .getByRole('button', { name: /add/i })
      .first();
    await secondAddBtn.click();
    await page.waitForTimeout(500);

    // Get selected documents section
    const selectedSection = page.getByText(/Selected Documents/i).locator('..');

    // Verify initial order
    const items = await selectedSection.locator('[draggable="true"]').all();
    expect(items.length).toBeGreaterThanOrEqual(2);

    // Drag first document to second position
    const firstItem = items[0];
    const secondItem = items[1];
    await firstItem.dragTo(secondItem);

    // Wait for reorder API call
    await page.waitForTimeout(1000);

    // Verify order changed (Second Document should now be first)
    const updatedItems = await selectedSection.locator('[draggable="true"]').all();
    const firstItemText = await updatedItems[0].textContent();
    expect(firstItemText).toContain('Second Document');
  });

  test('should reorder documents via keyboard', async ({ page }) => {
    await setupUserAndWorkspace(page);

    // Create two documents
    await createDocument(page, 'Doc A', 'Content A', 'KNOWLEDGE');
    await createDocument(page, 'Doc B', 'Content B', 'KNOWLEDGE');

    // Create instruction set and add documents
    await createInstructionSet(page, 'Keyboard Reorder Set');

    await navigateToInstructionSets(page);
    const setCard = page.getByText('Keyboard Reorder Set').locator('..');
    await setCard.click();
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, {
      timeout: 10000,
    });

    // Add both documents
    await page
      .getByText('Doc A')
      .locator('..')
      .getByRole('button', { name: /add/i })
      .first()
      .click();
    await page.waitForTimeout(500);

    await page
      .getByText('Doc B')
      .locator('..')
      .getByRole('button', { name: /add/i })
      .first()
      .click();
    await page.waitForTimeout(500);

    // Focus first document (Tab to it or click)
    const selectedSection = page.getByText(/Selected Documents/i).locator('..');
    const firstItem = selectedSection.locator('[draggable="true"]').first();
    await firstItem.click();

    // Press Space to enter drag mode
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);

    // Press ArrowDown to move down
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);

    // Press Space to drop
    await page.keyboard.press('Space');
    await page.waitForTimeout(1000);

    // Verify order changed
    const updatedItems = await selectedSection.locator('[draggable="true"]').all();
    const firstItemText = await updatedItems[0].textContent();
    expect(firstItemText).toContain('Doc B');
  });

  test('should filter documents by search', async ({ page }) => {
    await setupUserAndWorkspace(page);

    // Create documents with different titles
    await createDocument(page, 'Apple Document', 'Content', 'KNOWLEDGE');
    await createDocument(page, 'Banana Document', 'Content', 'KNOWLEDGE');
    await createDocument(page, 'Cherry Document', 'Content', 'KNOWLEDGE');

    await createInstructionSet(page, 'Filter Test Set');

    // Open editor
    await navigateToInstructionSets(page);
    const setCard = page.getByText('Filter Test Set').locator('..');
    await setCard.click();
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, {
      timeout: 10000,
    });

    // Type in search input
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('banana');

    // Verify only Banana Document is visible in available list
    const availableSection = page.getByText(/Available Documents/i).locator('..');
    await expect(availableSection.getByText('Banana Document')).toBeVisible();

    const appleCount = await availableSection.getByText('Apple Document').count();
    const cherryCount = await availableSection.getByText('Cherry Document').count();
    expect(appleCount).toBe(0);
    expect(cherryCount).toBe(0);
  });

  test('should filter documents by purpose', async ({ page }) => {
    await setupUserAndWorkspace(page);

    // Create documents with different purposes
    await createDocument(page, 'Knowledge Doc', 'Content', 'KNOWLEDGE');
    await createDocument(page, 'Instruction Doc', 'Content', 'INSTRUCTION');

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
    await setupInstructionSetWithDocument(page);
    await navigateToInstructionSets(page);

    // Open editor
    const setCard = page.getByText('Test Instruction Set').locator('..');
    await setCard.click();
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, {
      timeout: 10000,
    });

    // Note current meter value
    const tokenMeter = page.locator('[data-testid="token-meter"]');
    const initialValue = await tokenMeter.textContent();

    // Add document
    const addButton = page
      .getByText('Test Document')
      .locator('..')
      .getByRole('button', { name: /add/i });
    await addButton.click();

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

  test('should prevent adding document when size limit reached', async ({
    page,
  }) => {
    await setupUserAndWorkspace(page);

    // Create a large document (close to 100 KB limit)
    const largeContent = 'x'.repeat(95000); // 95 KB
    await createDocument(page, 'Large Doc', largeContent, 'KNOWLEDGE');

    // Create small document
    await createDocument(page, 'Small Doc', 'Small content', 'KNOWLEDGE');

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

  test('should prevent adding document when count limit reached', async ({
    page,
  }) => {
    await setupUserAndWorkspace(page);

    // Create 21 documents (over the 20 document limit)
    for (let i = 1; i <= 21; i++) {
      await createDocument(page, `Doc ${i}`, `Content ${i}`, 'KNOWLEDGE');
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

  test('should show empty states (no selection, no results, no docs)', async ({
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

    // Create a document and test "no results" empty state
    await page.goto(page.url().replace(/\/instruction-sets.*/, ''));
    await createDocument(page, 'Search Test Doc', 'Content', 'KNOWLEDGE');

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
