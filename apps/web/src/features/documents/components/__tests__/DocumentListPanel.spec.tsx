import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { DocumentListPanel } from '../DocumentListPanel';

const mockGet = vi.fn();

vi.mock('@/shared/api/client', () => ({
  createApiClient: () => ({
    get: mockGet,
    post: vi.fn().mockReturnValue({ json: () => Promise.resolve({}) }),
    delete: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock('@/features/auth/model/authStore', () => ({
  useAuthStore: () => ({
    getAccessToken: vi.fn(),
    getRefreshToken: vi.fn(),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  }),
}));

vi.mock('@/shared/ui', () => ({
  toast: { error: vi.fn() },
  LoadingSpinner: () => null,
}));

function PanelHarness() {
  const [searchParams] = useSearchParams();

  return (
    <div>
      <DocumentListPanel workspaceId="ws-1" />
      <div data-testid="location-search">{searchParams.toString()}</div>
    </div>
  );
}

describe('DocumentListPanel', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockImplementation(() => ({
      json: () =>
        Promise.resolve({
          documents: [],
          pagination: { page: 2, limit: 20, total: 0, totalPages: 0 },
        }),
    }));
  });

  it('should include verification and processing filters in API request', async () => {
    render(
      <MemoryRouter initialEntries={['/?tab=documents&verificationStatus=UNVERIFIED&processingStatus=FAILED&page=2']}>
        <DocumentListPanel workspaceId="ws-1" />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled();
    });

    expect(mockGet).toHaveBeenCalledWith(
      'workspaces/ws-1/documents?verificationStatus=UNVERIFIED&processingStatus=FAILED&page=2&limit=20'
    );
  });

  it('should reset filters and pagination from empty filtered state', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/?tab=documents&verificationStatus=UNVERIFIED&processingStatus=FAILED&page=3']}>
        <Routes>
          <Route path="/" element={<PanelHarness />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('No documents match filters.');
    await user.click(screen.getByRole('button', { name: /reset filters/i }));

    await waitFor(() => {
      const locationSearch = screen.getByTestId('location-search').textContent || '';
      expect(locationSearch).toContain('tab=documents');
      expect(locationSearch).toContain('page=1');
      expect(locationSearch).not.toContain('verificationStatus=');
      expect(locationSearch).not.toContain('processingStatus=');
    });
  });
});
