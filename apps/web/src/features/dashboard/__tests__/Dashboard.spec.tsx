import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from '../Dashboard';

// Valid UUIDs for testing
const WORKSPACE_1_ID = '550e8400-e29b-41d4-a716-446655440001';
const WORKSPACE_2_ID = '550e8400-e29b-41d4-a716-446655440002';
const WORKSPACE_3_ID = '550e8400-e29b-41d4-a716-446655440003';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock API client
const mockApiGet = vi.fn();
vi.mock('../../../shared/api/client', () => ({
  createApiClient: () => ({
    get: () => ({
      json: mockApiGet,
    }),
  }),
}));

// Mock auth store
vi.mock('../../auth/model/authStore', () => ({
  useAuthStore: () => ({
    getAccessToken: () => 'test-token',
    getRefreshToken: () => 'test-refresh-token',
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
    getWorkspaceId: () => null,
  }),
}));

// Mock useLastWorkspace hook
const mockGetLastWorkspace = vi.fn();
const mockSetLastWorkspace = vi.fn();
vi.mock('../../workspaces/hooks', () => ({
  useLastWorkspace: () => ({
    getLastWorkspace: mockGetLastWorkspace,
    setLastWorkspace: mockSetLastWorkspace,
  }),
}));

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLastWorkspace.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('should show loading spinner while fetching workspaces', () => {
      // Never resolve the API call to keep loading state
      mockApiGet.mockReturnValue(new Promise(() => {}));

      render(<Dashboard />);

      expect(screen.getByRole('heading', { name: /workspaces/i })).toBeInTheDocument();
      // Loading spinner has animate-spin class
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('auto-redirect for single workspace user', () => {
    it('should auto-redirect to workspace when user has exactly one workspace', async () => {
      const singleWorkspace = [
        { id: WORKSPACE_1_ID, name: 'My Workspace', description: null, documentCount: 5 },
      ];
      mockApiGet.mockResolvedValue(singleWorkspace);

      render(<Dashboard />);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          `/workspaces/${WORKSPACE_1_ID}`,
          { replace: true }
        );
      });
    });

    it('should store last workspace on auto-redirect for single workspace', async () => {
      const singleWorkspace = [
        { id: WORKSPACE_1_ID, name: 'My Workspace', description: null, documentCount: 5 },
      ];
      mockApiGet.mockResolvedValue(singleWorkspace);

      render(<Dashboard />);

      await waitFor(() => {
        expect(mockSetLastWorkspace).toHaveBeenCalledWith(WORKSPACE_1_ID);
      });
    });
  });

  describe('multi-workspace user without lastWorkspaceId', () => {
    it('should NOT auto-redirect when user has multiple workspaces and no lastWorkspaceId', async () => {
      const multipleWorkspaces = [
        { id: WORKSPACE_1_ID, name: 'Workspace 1', description: 'First', documentCount: 3 },
        { id: WORKSPACE_2_ID, name: 'Workspace 2', description: 'Second', documentCount: 7 },
      ];
      mockApiGet.mockResolvedValue(multipleWorkspaces);
      mockGetLastWorkspace.mockReturnValue(null);

      render(<Dashboard />);

      // Wait for workspaces to load and render
      await waitFor(() => {
        expect(screen.getByText('Workspace 1')).toBeInTheDocument();
      });

      // Should show workspace list, not redirect
      expect(screen.getByText('Workspace 2')).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should display all workspaces in a list', async () => {
      const multipleWorkspaces = [
        { id: WORKSPACE_1_ID, name: 'Alpha', description: 'First project', documentCount: 10 },
        { id: WORKSPACE_2_ID, name: 'Beta', description: 'Second project', documentCount: 20 },
        { id: WORKSPACE_3_ID, name: 'Gamma', description: null, documentCount: 0 },
      ];
      mockApiGet.mockResolvedValue(multipleWorkspaces);

      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('Alpha')).toBeInTheDocument();
      });

      expect(screen.getByText('Beta')).toBeInTheDocument();
      expect(screen.getByText('Gamma')).toBeInTheDocument();
      expect(screen.getByText('First project')).toBeInTheDocument();
      expect(screen.getByText('Second project')).toBeInTheDocument();
      expect(screen.getByText('10 documents')).toBeInTheDocument();
      expect(screen.getByText('20 documents')).toBeInTheDocument();
      expect(screen.getByText('0 documents')).toBeInTheDocument();
    });
  });

  describe('multi-workspace user with lastWorkspaceId', () => {
    it('should auto-redirect when lastWorkspaceId matches existing workspace', async () => {
      const multipleWorkspaces = [
        { id: WORKSPACE_1_ID, name: 'Workspace 1', description: null, documentCount: 3 },
        { id: WORKSPACE_2_ID, name: 'Workspace 2', description: null, documentCount: 7 },
      ];
      mockApiGet.mockResolvedValue(multipleWorkspaces);
      mockGetLastWorkspace.mockReturnValue(WORKSPACE_2_ID);

      render(<Dashboard />);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          `/workspaces/${WORKSPACE_2_ID}`,
          { replace: true }
        );
      });
    });

    it('should NOT auto-redirect when lastWorkspaceId does not match any workspace', async () => {
      const multipleWorkspaces = [
        { id: WORKSPACE_1_ID, name: 'Workspace 1', description: null, documentCount: 3 },
        { id: WORKSPACE_2_ID, name: 'Workspace 2', description: null, documentCount: 7 },
      ];
      mockApiGet.mockResolvedValue(multipleWorkspaces);
      // Return a workspace ID that doesn't exist in the list
      mockGetLastWorkspace.mockReturnValue(WORKSPACE_3_ID);

      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('Workspace 1')).toBeInTheDocument();
      });

      expect(screen.getByText('Workspace 2')).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('empty state rendering', () => {
    it('should show empty state when user has no workspaces', async () => {
      mockApiGet.mockResolvedValue([]);

      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('No workspaces yet')).toBeInTheDocument();
      });

      expect(screen.getByText(/Create your first workspace/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create workspace/i })).toBeInTheDocument();
    });

    it('should not auto-redirect when there are no workspaces', async () => {
      mockApiGet.mockResolvedValue([]);

      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('No workspaces yet')).toBeInTheDocument();
      });

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('workspace card interaction', () => {
    it('should navigate to workspace when card is clicked', async () => {
      const user = userEvent.setup();
      const multipleWorkspaces = [
        { id: WORKSPACE_1_ID, name: 'Clickable Workspace', description: null, documentCount: 5 },
        { id: WORKSPACE_2_ID, name: 'Another Workspace', description: null, documentCount: 3 },
      ];
      mockApiGet.mockResolvedValue(multipleWorkspaces);
      mockGetLastWorkspace.mockReturnValue(null);

      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('Clickable Workspace')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Clickable Workspace'));

      expect(mockSetLastWorkspace).toHaveBeenCalledWith(WORKSPACE_1_ID);
      expect(mockNavigate).toHaveBeenCalledWith(`/workspaces/${WORKSPACE_1_ID}`);
    });

    it('should store last workspace when navigating via card click', async () => {
      const user = userEvent.setup();
      const workspaces = [
        { id: WORKSPACE_1_ID, name: 'First', description: null, documentCount: 1 },
        { id: WORKSPACE_2_ID, name: 'Second', description: null, documentCount: 2 },
      ];
      mockApiGet.mockResolvedValue(workspaces);
      mockGetLastWorkspace.mockReturnValue(null);

      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('Second')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Second'));

      expect(mockSetLastWorkspace).toHaveBeenCalledWith(WORKSPACE_2_ID);
    });
  });

  describe('error handling', () => {
    it('should handle API error gracefully and show empty state', async () => {
      mockApiGet.mockRejectedValue(new Error('Network error'));

      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<Dashboard />);

      // When API fails, workspaces remain empty, so empty state should show
      await waitFor(() => {
        expect(screen.getByText('No workspaces yet')).toBeInTheDocument();
      });

      expect(mockNavigate).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('header elements', () => {
    it('should render workspaces heading', async () => {
      mockApiGet.mockResolvedValue([]);

      render(<Dashboard />);

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.getByText('No workspaces yet')).toBeInTheDocument();
      });

      // Use exact match for main heading text
      expect(screen.getByRole('heading', { name: 'Workspaces', level: 1 })).toBeInTheDocument();
    });

    it('should render new workspace button', async () => {
      mockApiGet.mockResolvedValue([]);

      render(<Dashboard />);

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.getByText('No workspaces yet')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /new workspace/i })).toBeInTheDocument();
    });
  });
});
