import { test, expect, Page } from '@playwright/test';

/**
 * Document Pagination E2E Test
 *
 * REGRESSION TEST: "Document list pagination is broken - shows only 20 of 27 documents"
 *
 * User Flow (Main Documents List):
 * 1. User navigates to Documents tab in workspace
 * 2. Counter shows "27 documents" total
 * 3. Only 20 documents are displayed in the list
 * 4. User looks for pagination controls (page numbers, next/previous buttons)
 * 5. **EXPECTED**: Pagination controls visible (e.g., "Page 1 of 2", "Next" button)
 * 6. **ACTUAL BUG**: No pagination controls, cannot access remaining 7 documents
 *
 * User Flow (Add to Set Modal):
 * 1. User opens "Add to Set" modal in instruction set editor
 * 2. Modal shows "Available Documents" with search
 * 3. Counter shows 27 documents total
 * 4. Only 20 documents visible in list
 * 5. User searches for document #25 (not in first 20)
 * 6. **EXPECTED**: All 27 documents searchable, pagination or "load more" available
 * 7. **ACTUAL BUG**: Search doesn't find documents beyond first 20
 *
 * Prerequisites:
 *   cd community/apps/web && pnpm test:e2e -- document-pagination
 *
 * Environment:
 *   - Backend: NODE_ENV=test (auto-started by playwright.config.ts)
 *   - Frontend: http://localhost:6310 (from playwright.config.ts baseURL)
 *   - Database: Test database
 *   - External: Mailpit for email verification
 *
 * Related:
 *   - GitHub Issue: thesynjar/synjar#4
 *   - Similar test: community/apps/web/e2e/instruction-sets-editor.spec.ts
 *   - Analysis: docs/agents/problem-analyzer/reports/2026-01-06-12-22-problem-analysis.md
 */

const MAILPIT_URL = process.env.MAILPIT_URL || 'http://localhost:6313';
const TOTAL_DOCUMENTS = 27; // Exceeds default limit of 20

function generateTestUser() {
  const timestamp = Date.now();
  return {
    email: `test-pagination-${timestamp}@example.com`,
    password: 'TestPassword123!',
    workspaceName: `Pagination Test ${timestamp}`,
    name: 'Pagination Test User',
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
 * Helper: Create multiple documents in batch for pagination testing
 */
async function createDocumentsForPaginationTest(page: Page, count: number) {
  console.log(`Creating ${count} documents for pagination test...`);

  for (let i = 1; i <= count; i++) {
    await createVerifiedDocument(
      page,
      `Document ${i}`,
      `Content for document ${i}`,
      'KNOWLEDGE',
      true, // skipReload for batch creation
    );

    // Log progress every 5 documents
    if (i % 5 === 0) {
      console.log(`Created ${i}/${count} documents`);
    }
  }

  // Reload once after all documents created
  await page.reload();
  await page.waitForLoadState('networkidle');
  console.log(`All ${count} documents created`);
}

/**
 * Helper: Navigate to Documents tab
 */
async function navigateToDocuments(page: Page) {
  const docsTab = page.getByRole('link', { name: 'Documents' });
  await expect(docsTab).toBeVisible({ timeout: 5000 });
  await docsTab.click();
  await page.waitForTimeout(500);
}

test.describe('Document pagination [REGRESSION]', () => {
  test.beforeEach(async () => {
    await clearMailpit();
  });

  // Increase timeout for tests that create many documents
  test.setTimeout(120000);

  test('should display pagination controls when documents exceed page limit (main list)', async ({
    page,
  }) => {
    // ARRANGE: Setup user, workspace, and create 27 documents
    await setupUserAndWorkspace(page);
    await createDocumentsForPaginationTest(page, TOTAL_DOCUMENTS);

    // Navigate to Documents tab
    await navigateToDocuments(page);

    // Wait for documents to load
    // UI sorts by newest first, so Document 27 should be visible first
    await expect(page.getByText('Document 27')).toBeVisible({ timeout: 10000 });

    // ASSERT: Verify 27 documents exist (counter shows correct total)
    await expect(page.getByText('Documents (27)')).toBeVisible();

    // ASSERT: First page shows newest documents (27, 26, 25...)
    await expect(page.getByText('Document 27')).toBeVisible();
    await expect(page.getByText('Document 26')).toBeVisible();

    // BUG DETECTION: Oldest documents (1-7) should NOT be visible without pagination
    // If bug exists: only 20 documents shown, no way to see Document 1-7
    // This verifies that not all documents are accessible
    const document1Visible = await page
      .getByRole('button', { name: /^Document 1$|^Document 1 / })
      .isVisible({ timeout: 1000 })
      .catch(() => false);

    // If Document 1 IS visible, it means all documents are loaded (no pagination needed or bug doesn't exist)
    // If Document 1 is NOT visible, we need pagination controls to access it - this is the bug!

    if (!document1Visible) {
      // BUG CONFIRMED: Document 1 not visible and no pagination to access it
      // ASSERT: Pagination controls should be visible to access older documents
      // This assertion will FAIL because no pagination controls exist = BUG DETECTED
      await expect(
        page.getByRole('navigation', { name: /pagination/i })
      ).toBeVisible();
    }

    // Alternative assertions for pagination
    // Should show current page indicator
    await expect(page.getByText(/page 1 of 2/i)).toBeVisible();

    // Should show "Next" button to navigate to page 2
    await expect(
      page.getByRole('button', { name: /next/i })
    ).toBeVisible();
  });

  test('should navigate to page 2 and show remaining documents', async ({
    page,
  }) => {
    // ARRANGE: Setup user, workspace, and create 27 documents
    await setupUserAndWorkspace(page);
    await createDocumentsForPaginationTest(page, TOTAL_DOCUMENTS);

    await navigateToDocuments(page);
    // API sorts by createdAt DESC (newest first), so Document 27 should be visible on page 1
    await expect(page.getByRole('button', { name: /^Document 27 / })).toBeVisible({ timeout: 10000 });

    // ACT: Click "Next" button to go to page 2
    // This will FAIL if pagination controls don't exist
    await page.getByRole('button', { name: /next/i }).click();

    // ASSERT: URL should reflect page 2
    await expect(page).toHaveURL(/page=2/);

    // ASSERT: Page 2 shows oldest documents (1-7)
    // With newest-first sorting: Page 1 has 27-8, Page 2 has 7-1
    await expect(page.getByRole('button', { name: /^Document 1 / })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Document 7 / })).toBeVisible();

    // Documents 8-27 should NOT be visible on page 2
    await expect(page.getByRole('button', { name: /^Document 27 / })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Document 8 / })).toHaveCount(0);

    // Should show "Previous" button to go back
    await expect(
      page.getByRole('button', { name: /previous/i })
    ).toBeVisible();
  });

  test('should navigate back to page 1 using Previous button', async ({
    page,
  }) => {
    // ARRANGE: Setup user, workspace, and create 27 documents
    await setupUserAndWorkspace(page);
    await createDocumentsForPaginationTest(page, TOTAL_DOCUMENTS);

    await navigateToDocuments(page);
    // API sorts by createdAt DESC (newest first), so Document 27 should be visible on page 1
    await expect(page.getByRole('button', { name: /^Document 27 / })).toBeVisible({ timeout: 10000 });

    // Go to page 2 first
    await page.getByRole('button', { name: /next/i }).click();
    // Page 2 shows oldest documents (1-7)
    await expect(page.getByRole('button', { name: /^Document 1 / })).toBeVisible();

    // ACT: Click "Previous" button
    await page.getByRole('button', { name: /previous/i }).click();

    // ASSERT: Back to page 1 (newest documents 27-8)
    await expect(page).toHaveURL(/page=1/);
    await expect(page.getByRole('button', { name: /^Document 27 / })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Document 8 / })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Document 7 / })).toHaveCount(0);
  });

  test('should show all documents in Add to Set modal or provide pagination', async ({
    page,
  }) => {
    // ARRANGE: Setup user, workspace, create documents, and create instruction set
    await setupUserAndWorkspace(page);
    await createDocumentsForPaginationTest(page, TOTAL_DOCUMENTS);

    // Navigate to Sets tab and create an instruction set
    const setsTab = page.getByRole('link', { name: 'Sets' });
    await expect(setsTab).toBeVisible({ timeout: 5000 });
    await setsTab.click();

    // Wait for Sets tab URL and content to load
    await page.waitForURL(/tab=instruction-sets/, { timeout: 5000 });
    // Wait for either empty state or sets list heading to be visible
    await expect(
      page.getByRole('heading', { name: /No Instruction Sets Yet/i }).or(
        page.getByRole('heading', { name: /Instruction Sets \(/i })
      )
    ).toBeVisible({ timeout: 5000 });

    // Create instruction set (use empty state button or regular button)
    const emptyStateButton = page.getByRole('button', { name: /create your first set/i });
    const newSetButton = page.getByRole('button', { name: /new set/i });

    let createButton;
    if (await emptyStateButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      createButton = emptyStateButton;
    } else {
      createButton = newSetButton;
    }

    await expect(createButton).toBeVisible({ timeout: 5000 });
    await createButton.click();

    // Fill modal
    const nameInput = page.getByPlaceholder(/brand voice/i);
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill('Pagination Test Set');

    // Click through wizard steps
    let nextButton = page.getByRole('button', { name: /^next$/i });
    if (await nextButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nextButton.click();
      await page.waitForTimeout(500);
    }

    nextButton = page.getByRole('button', { name: /^next$/i });
    if (await nextButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nextButton.click();
      await page.waitForTimeout(500);
    }

    const createFinalButton = page.getByRole('button', { name: /create instruction set/i });
    if (await createFinalButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createFinalButton.click();
    }

    // Wait for set to appear
    await expect(page.getByText('Pagination Test Set')).toBeVisible({ timeout: 5000 });

    // Click on the instruction set to open editor
    await page.getByText('Pagination Test Set').click();
    // Wait for editor page to load (URL changes to /edit)
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, { timeout: 10000 });

    // ACT & ASSERT: Available Documents panel should be visible with all documents
    await expect(page.getByText(/Available Documents/i)).toBeVisible({ timeout: 5000 });

    // Verify document count shows 27 total
    await expect(page.getByText('27 total')).toBeVisible({ timeout: 5000 });

    // Check if Document 27 is visible (should be first in list as newest)
    await expect(page.getByText('Document 27')).toBeVisible({ timeout: 5000 });

    // Also verify Document 1 is accessible (oldest, might need scrolling)
    // Scroll to find Document 1 if needed
    const doc1 = page.getByText('Document 1').first();
    await doc1.scrollIntoViewIfNeeded();
    await expect(doc1).toBeVisible({ timeout: 5000 });
  });

  test('should search across all documents in Add to Set modal', async ({
    page,
  }) => {
    // ARRANGE: Setup user, workspace, create documents, and instruction set
    await setupUserAndWorkspace(page);
    await createDocumentsForPaginationTest(page, TOTAL_DOCUMENTS);

    // Navigate to Sets and create set
    const setsTab = page.getByRole('link', { name: 'Sets' });
    await setsTab.click();

    // Wait for Sets tab URL and content to load
    await page.waitForURL(/tab=instruction-sets/, { timeout: 5000 });
    // Wait for either empty state or sets list heading to be visible
    await expect(
      page.getByRole('heading', { name: /No Instruction Sets Yet/i }).or(
        page.getByRole('heading', { name: /Instruction Sets \(/i })
      )
    ).toBeVisible({ timeout: 5000 });

    const emptyStateButton = page.getByRole('button', { name: /create your first set/i });
    const newSetButton = page.getByRole('button', { name: /new set/i });

    let createButton;
    if (await emptyStateButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      createButton = emptyStateButton;
    } else {
      createButton = newSetButton;
    }

    await createButton.click();

    const nameInput = page.getByPlaceholder(/brand voice/i);
    await nameInput.fill('Search Test Set');

    let nextButton = page.getByRole('button', { name: /^next$/i });
    if (await nextButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nextButton.click();
      await page.waitForTimeout(500);
    }

    nextButton = page.getByRole('button', { name: /^next$/i });
    if (await nextButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nextButton.click();
      await page.waitForTimeout(500);
    }

    const createFinalButton = page.getByRole('button', { name: /create instruction set/i });
    if (await createFinalButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createFinalButton.click();
    }

    await expect(page.getByText('Search Test Set')).toBeVisible({ timeout: 5000 });
    await page.getByText('Search Test Set').click();
    // Wait for editor page to load (URL changes to /edit)
    await page.waitForURL(/\/instruction-sets\/[a-f0-9-]+\/edit/, { timeout: 10000 });

    // Wait for Available Documents panel to be visible
    await expect(page.getByText(/Available Documents/i)).toBeVisible({ timeout: 5000 });

    // ACT: Search for document #25 (which would be on page 2 if paginated)
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('Document 25');

    // Wait for search debounce (300ms) + API response
    await page.waitForTimeout(500);

    // ASSERT: Document 25 should be found via server-side search
    await expect(page.getByText('Document 25')).toBeVisible({ timeout: 5000 });

    // Other documents should be filtered out
    await expect(page.getByText('Document 1').first()).not.toBeVisible({ timeout: 2000 });
    await expect(page.getByText('Document 10').first()).not.toBeVisible({ timeout: 2000 });
  });
});
