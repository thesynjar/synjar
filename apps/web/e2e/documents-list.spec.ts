import { test, expect, Page } from '@playwright/test';

/**
 * Document List Filters E2E Tests
 *
 * Covers:
 * - Verification and processing filters
 * - Empty filtered state with reset button
 *
 * Test file: community/apps/web/e2e/documents-list.spec.ts
 * Command: cd community/apps/web && pnpm test:e2e -- documents-list
 */

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
const API_ORIGIN = 'http://localhost:6300';
const USER = {
  id: 'user-1',
  email: 'doc-list@example.com',
  name: 'Doc List User',
};

const documents = [
  {
    id: 'doc-verified',
    title: 'Verified Handbook',
    content: '',
    contentType: 'FILE',
    originalFilename: 'handbook.pdf',
    fileSize: 1200,
    verificationStatus: 'VERIFIED',
    processingStatus: 'COMPLETED',
    purpose: 'KNOWLEDGE',
    createdAt: '2025-01-01T10:00:00.000Z',
    tags: [],
    hasDraft: false,
  },
  {
    id: 'doc-unverified-failed',
    title: 'Unverified Checklist',
    content: '',
    contentType: 'FILE',
    originalFilename: 'checklist.pdf',
    fileSize: 2300,
    verificationStatus: 'UNVERIFIED',
    processingStatus: 'FAILED',
    purpose: 'KNOWLEDGE',
    createdAt: '2025-01-02T10:00:00.000Z',
    tags: [],
    hasDraft: false,
  },
  {
    id: 'doc-unverified-pending',
    title: 'Unverified Draft Notes',
    content: 'Draft content',
    contentType: 'TEXT',
    originalFilename: null,
    fileSize: null,
    verificationStatus: 'UNVERIFIED',
    processingStatus: 'PENDING',
    purpose: 'INSTRUCTION',
    createdAt: '2025-01-03T10:00:00.000Z',
    tags: [],
    hasDraft: true,
  },
];

async function stubAuth(page: Page) {
  await page.route('**/auth/refresh', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== API_ORIGIN) {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresIn: 3600,
        user: USER,
      }),
    });
  });
}

async function stubWorkspaceApi(page: Page) {
  await page.route('**/workspaces**', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== API_ORIGIN) {
      await route.continue();
      return;
    }

    const segments = url.pathname.split('/').filter(Boolean);
    const workspaceIndex = segments.indexOf('workspaces');

    if (workspaceIndex === -1) {
      await route.continue();
      return;
    }

    const workspaceId = segments[workspaceIndex + 1];
    const nextSegment = segments[workspaceIndex + 2];

    if (!workspaceId) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: WORKSPACE_ID,
            name: 'Acme Workspace',
            description: 'Docs for QA',
            documentCount: documents.length,
          },
        ]),
      });
      return;
    }

    if (nextSegment === 'documents') {
      const verificationStatus = url.searchParams.get('verificationStatus');
      const processingStatus = url.searchParams.get('processingStatus');
      const pageParam = Number(url.searchParams.get('page') || '1');

      const filtered = documents.filter((doc) => {
        if (verificationStatus && doc.verificationStatus !== verificationStatus) {
          return false;
        }
        if (processingStatus && doc.processingStatus !== processingStatus) {
          return false;
        }
        return true;
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          documents: filtered,
          pagination: {
            page: Number.isFinite(pageParam) ? pageParam : 1,
            limit: 20,
            total: filtered.length,
            totalPages: 1,
          },
        }),
      });
      return;
    }

    if (segments.length === workspaceIndex + 2) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: WORKSPACE_ID,
          name: 'Acme Workspace',
          description: 'Docs for QA',
        }),
      });
      return;
    }

    await route.continue();
  });
}

async function setupSession(page: Page) {
  await page.addInitScript((workspaceId) => {
    localStorage.setItem('auth_refresh_token', 'test-refresh-token');
    localStorage.setItem('auth_workspace_id', workspaceId);
  }, WORKSPACE_ID);
}

test.describe('Document list filters', () => {
  test.beforeEach(async ({ page }) => {
    await stubAuth(page);
    await stubWorkspaceApi(page);
    await setupSession(page);
  });

  test('should filter by verification and processing status', async ({ page }) => {
    await page.goto(`/workspaces/${WORKSPACE_ID}?tab=documents`);

    await expect(page.getByText('Verified Handbook')).toBeVisible();
    await expect(page.getByText('Unverified Checklist')).toBeVisible();

    await page.getByRole('radio', { name: 'Unverified' }).click();

    await expect(page.locator('text=Verified Handbook')).toHaveCount(0);
    await expect(page.getByText('Unverified Checklist')).toBeVisible();

    await page.getByRole('radio', { name: 'Failed' }).click();

    await expect(page.locator('text=Unverified Draft Notes')).toHaveCount(0);
    await expect(page.getByText('Unverified Checklist')).toBeVisible();
    await expect(page).toHaveURL(/verificationStatus=UNVERIFIED/);
    await expect(page).toHaveURL(/processingStatus=FAILED/);
  });

  test('should reset filters from empty state', async ({ page }) => {
    await page.goto(
      `/workspaces/${WORKSPACE_ID}?tab=documents&verificationStatus=VERIFIED&processingStatus=FAILED&page=2`
    );

    await expect(page.getByText('No documents match filters.')).toBeVisible();

    await page.getByRole('button', { name: /reset filters/i }).click();

    await expect(page).toHaveURL(/tab=documents/);
    await expect(page).toHaveURL(/page=1/);
    await expect(page).not.toHaveURL(/verificationStatus/);
    await expect(page).not.toHaveURL(/processingStatus/);
    await expect(page.getByText('Verified Handbook')).toBeVisible();
  });
});
