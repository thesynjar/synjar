# SPEC-017: Workspace Tabs Navigation

**Date:** 2025-12-28
**Status:** Draft -> Reviewed
**Priority:** P1 (UX Enhancement)
**Dependencies:** SPEC-012 (Frontend Dashboard), SPEC-016 (Frontend Public Links)

---

## 1. Business Goal

Introduction of tab navigation in the workspace view to:
1. Increase discoverability of Public Links feature (key competitive advantage)
2. Provide a scalable structure for future features (Settings, Members, Activity)
3. Improve user experience according to industry standards (GitHub, Linear, Notion)

### 1.1 MVP Value

- Tabs: Documents, Public Links
- Deep linking to tabs
- Consistent navigation pattern in workspace

### 1.2 Bounded Context

**Context:** Workspace (according to [ecosystem.md](../ecosystem.md))

This specification covers **only the UI layer (Interfaces Layer)**:
- No changes in Domain Layer
- No changes in Application Layer
- No new aggregates/entities
- Frontend consumes existing Workspace aggregate through API

```
+------------------------------------------+
| Interfaces Layer (this specification)    |
| - WorkspacePage, WorkspaceTabs           |
| - React Router navigation                |
+------------------+-----------------------+
                   | HTTP API
                   v
+------------------------------------------+
| Application Layer (no changes)           |
| - WorkspaceService                       |
+------------------------------------------+
```

### 1.3 Why is this important?

Public Links is **the only feature competitors don't offer** (Dify, Quivr, Mem.ai, Notion AI).
Hiding it in Settings or behind a button will reduce adoption. A tab on par with Documents
emphasizes its importance in the "Memory for AI" value proposition.

---

## 2. User Stories

### US-1: Navigation between workspace sections
**As a** workspace member
**I want to** navigate between Documents and Public Links using tabs
**So that** I can easily access different workspace features

**Acceptance Criteria:**
- Given I'm on workspace Documents tab
- When I click "Public Links" tab
- Then URL changes to `/workspaces/:id/public-links`
- And Public Links tab becomes active
- And Public Links content is displayed

### US-2: Deep linking to tab
**As a** user sharing workspace link
**I want to** share direct link to Public Links tab
**So that** recipient lands on correct section

**Acceptance Criteria:**
- Given I have URL `/workspaces/123/public-links`
- When I open this URL in browser
- Then Public Links tab is active
- And Public Links content is displayed

### US-3: Backwards compatibility
**As a** user with bookmarked old URLs
**I want to** old workspace URLs still work
**So that** my bookmarks don't break

**Acceptance Criteria:**
- Given I have URL `/workspaces/123` (old format)
- When I open this URL in browser
- Then I'm redirected to `/workspaces/123/documents`
- And Documents tab is active

---

## 3. Functional Requirements

### 3.1 URL Structure

| URL | Tab | Description |
|-----|-----|-------------|
| `/workspaces/:id` | - | Redirect to `/workspaces/:id/documents` |
| `/workspaces/:id/documents` | Documents | Documents list (current functionality) |
| `/workspaces/:id/public-links` | Public Links | Public links management |
| `/workspaces/:id/settings` | Settings | (future) Workspace settings |

### 3.2 Components

1. **WorkspaceTabs**
   - Horizontal tabs below workspace header
   - Active tab visually highlighted
   - Navigation through React Router (not local state)
   - Accessibility: ARIA tabs pattern, keyboard navigation (Tab, Enter, Arrow keys)
   - **Visibility:** All tabs visible to all workspace members

2. **WorkspaceLayout**
   - Wrapper for all workspace pages
   - Contains: workspace header + tabs + outlet

3. **DocumentsTab**
   - Refactoring of current WorkspaceDetail.tsx
   - Upload, documents list, actions

4. **PublicLinksTab**
   - Implementation per SPEC-016
   - Links list, creation, details

### 3.3 Behavior

1. **Default tab**: Documents (redirect from `/workspaces/:id`)
2. **URL persistence**: Each tab has its own URL (bookmarkable)
3. **Navigation**: Tab click = React Router navigation
4. **State**: Each tab maintains its state (scroll, filters) within session
5. **Tab order**: Fixed (Documents -> Public Links -> Settings)

### 3.4 API Contracts

#### GET /workspaces/:id

Endpoint used by `useWorkspace` hook.

**Request:**
```http
GET /api/v1/workspaces/123
Authorization: Bearer <token>
X-Workspace-Id: 123
```

**Response 200:**
```json
{
  "id": "123",
  "name": "My Knowledge Base",
  "description": "Company documentation",
  "createdAt": "2025-12-28T10:00:00Z",
  "updatedAt": "2025-12-28T10:00:00Z"
}
```

**Response 403 (Not a member):**
```json
{
  "statusCode": 403,
  "message": "Access denied to workspace",
  "error": "Forbidden"
}
```

**Response 404 (Workspace not found):**
```json
{
  "statusCode": 404,
  "message": "Workspace not found",
  "error": "Not Found"
}
```

---

## 4. Implementation

### 4.1 File Structure

```
apps/web/src/features/workspaces/
├── pages/
│   └── WorkspacePage.tsx          # Layout with tabs
├── components/
│   ├── WorkspaceHeader.tsx        # Header (name, description, back link)
│   ├── WorkspaceTabs.tsx          # Tab navigation
│   ├── WorkspacePageSkeleton.tsx  # Loading skeleton
│   ├── WorkspaceNotFound.tsx      # 404 error state
│   ├── WorkspaceAccessDenied.tsx  # 403 error state
│   └── WorkspaceError.tsx         # Generic error state
├── tabs/
│   ├── DocumentsTab.tsx           # Documents tab content
│   └── PublicLinksTab.tsx         # Public Links tab content
└── hooks/
    └── useWorkspace.ts            # Hook for fetching workspace
```

### 4.2 Router Configuration

```typescript
// src/App.tsx

<Route path="/workspaces/:workspaceId" element={<WorkspacePage />}>
  <Route index element={<Navigate to="documents" replace />} />
  <Route path="documents" element={<DocumentsTab />} />
  <Route path="public-links" element={<PublicLinksTab />} />
  {/* Future: <Route path="settings" element={<SettingsTab />} /> */}
</Route>
```

### 4.3 WorkspacePage (Layout)

```typescript
// src/features/workspaces/pages/WorkspacePage.tsx

import { Outlet, useParams } from 'react-router-dom';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import { WorkspaceTabs } from '../components/WorkspaceTabs';
import { WorkspacePageSkeleton } from '../components/WorkspacePageSkeleton';
import { WorkspaceNotFound } from '../components/WorkspaceNotFound';
import { WorkspaceAccessDenied } from '../components/WorkspaceAccessDenied';
import { WorkspaceError } from '../components/WorkspaceError';
import { useWorkspace } from '../hooks/useWorkspace';

export function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { workspace, isLoading, error } = useWorkspace(workspaceId!);

  // Loading state
  if (isLoading) {
    return <WorkspacePageSkeleton />;
  }

  // Error states
  if (error) {
    if (error.status === 403) {
      return <WorkspaceAccessDenied />;
    }
    if (error.status === 404) {
      return <WorkspaceNotFound />;
    }
    return <WorkspaceError error={error} onRetry={() => window.location.reload()} />;
  }

  if (!workspace) {
    return <WorkspaceNotFound />;
  }

  return (
    <div>
      <WorkspaceHeader workspace={workspace} />
      <WorkspaceTabs workspaceId={workspaceId!} />
      <div className="mt-6">
        <Outlet context={{ workspace, workspaceId }} />
      </div>
    </div>
  );
}
```

### 4.4 WorkspaceTabs (with design tokens and keyboard navigation)

```typescript
// src/features/workspaces/components/WorkspaceTabs.tsx

import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useCallback, useRef } from 'react';
import { cn } from '@/shared/utils/cn';

interface Tab {
  id: string;
  label: string;
  path: string;
}

// Tab order is fixed and not configurable
const TABS: Tab[] = [
  { id: 'documents', label: 'Documents', path: 'documents' },
  { id: 'public-links', label: 'Public Links', path: 'public-links' },
  // Future: { id: 'settings', label: 'Settings', path: 'settings' },
];

interface WorkspaceTabsProps {
  workspaceId: string;
}

export function WorkspaceTabs({ workspaceId }: WorkspaceTabsProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const tabsRef = useRef<(HTMLAnchorElement | null)[]>([]);

  const currentTabIndex = TABS.findIndex(
    tab => location.pathname.includes(tab.path)
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    let newIndex = index;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        newIndex = index === 0 ? TABS.length - 1 : index - 1;
        break;
      case 'ArrowRight':
        e.preventDefault();
        newIndex = index === TABS.length - 1 ? 0 : index + 1;
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = TABS.length - 1;
        break;
      default:
        return;
    }

    tabsRef.current[newIndex]?.focus();
    navigate(`/workspaces/${workspaceId}/${TABS[newIndex].path}`);
  }, [navigate, workspaceId]);

  return (
    <nav
      className="border-b border-slate-700"
      role="tablist"
      aria-label="Workspace sections"
    >
      <div className="flex gap-1">
        {TABS.map((tab, index) => (
          <NavLink
            key={tab.id}
            ref={el => tabsRef.current[index] = el}
            to={`/workspaces/${workspaceId}/${tab.path}`}
            role="tab"
            tabIndex={index === currentTabIndex ? 0 : -1}
            aria-selected={index === currentTabIndex}
            onKeyDown={(e) => handleKeyDown(e, index)}
            data-testid={`tab-${tab.id}`}
            className={({ isActive }) =>
              cn(
                // Layout
                'px-4 py-3 text-sm font-medium',
                'border-b-2 -mb-px',
                // Transitions
                'transition-colors duration-150',
                // Focus ring for accessibility
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
                // Active state (design tokens)
                isActive
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
```

### 4.5 WorkspaceHeader

```typescript
// src/features/workspaces/components/WorkspaceHeader.tsx

import { Link } from 'react-router-dom';

interface WorkspaceHeaderProps {
  workspace: {
    name: string;
    description: string | null;
  };
}

export function WorkspaceHeader({ workspace }: WorkspaceHeaderProps) {
  return (
    <div className="mb-6">
      <Link
        to="/workspaces"
        className="text-slate-400 hover:text-white text-sm mb-2 inline-flex items-center gap-1 transition-colors"
      >
        <span aria-hidden="true">←</span>
        <span>Back to workspaces</span>
      </Link>
      <h1 className="text-2xl font-bold text-white">{workspace.name}</h1>
      {workspace.description && (
        <p className="text-slate-400 mt-1">{workspace.description}</p>
      )}
    </div>
  );
}
```

### 4.6 Loading Skeleton

```typescript
// src/features/workspaces/components/WorkspacePageSkeleton.tsx

export function WorkspacePageSkeleton() {
  return (
    <div className="animate-pulse" aria-label="Loading workspace...">
      {/* Header skeleton */}
      <div className="mb-6">
        <div className="h-4 w-32 bg-slate-700 rounded mb-2" />
        <div className="h-8 w-64 bg-slate-700 rounded mb-1" />
        <div className="h-4 w-96 bg-slate-700 rounded" />
      </div>

      {/* Tabs skeleton */}
      <div className="border-b border-slate-700 mb-6">
        <div className="flex gap-4">
          <div className="h-10 w-24 bg-slate-700 rounded" />
          <div className="h-10 w-28 bg-slate-700 rounded" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="space-y-4">
        <div className="h-32 bg-slate-800 rounded-xl border border-slate-700" />
        <div className="h-64 bg-slate-800 rounded-xl border border-slate-700" />
      </div>
    </div>
  );
}
```

### 4.7 Error States

```typescript
// src/features/workspaces/components/WorkspaceNotFound.tsx

import { Link } from 'react-router-dom';

export function WorkspaceNotFound() {
  return (
    <div className="text-center py-12" role="alert">
      <div className="text-6xl mb-4">🔍</div>
      <h2 className="text-xl font-semibold text-white mb-2">
        Workspace not found
      </h2>
      <p className="text-slate-400 mb-6">
        The workspace you're looking for doesn't exist or has been deleted.
      </p>
      <Link
        to="/workspaces"
        className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
      >
        Back to workspaces
      </Link>
    </div>
  );
}

// src/features/workspaces/components/WorkspaceAccessDenied.tsx

import { Link } from 'react-router-dom';

export function WorkspaceAccessDenied() {
  return (
    <div className="text-center py-12" role="alert">
      <div className="text-6xl mb-4">🔒</div>
      <h2 className="text-xl font-semibold text-white mb-2">
        Access denied
      </h2>
      <p className="text-slate-400 mb-6">
        You don't have permission to view this workspace.
        Contact the workspace owner if you need access.
      </p>
      <Link
        to="/workspaces"
        className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
      >
        Back to workspaces
      </Link>
    </div>
  );
}

// src/features/workspaces/components/WorkspaceError.tsx

interface WorkspaceErrorProps {
  error: Error;
  onRetry: () => void;
}

export function WorkspaceError({ error, onRetry }: WorkspaceErrorProps) {
  return (
    <div className="text-center py-12" role="alert">
      <div className="text-6xl mb-4">⚠️</div>
      <h2 className="text-xl font-semibold text-white mb-2">
        Something went wrong
      </h2>
      <p className="text-slate-400 mb-6">
        {error.message || 'Unable to load workspace. Please try again.'}
      </p>
      <button
        onClick={onRetry}
        className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
```

### 4.8 useWorkspace Hook

```typescript
// src/features/workspaces/hooks/useWorkspace.ts

import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '@/shared/api/useApiClient';

interface Workspace {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ApiError extends Error {
  status?: number;
}

export function useWorkspace(workspaceId: string) {
  const apiClient = useApiClient();

  return useQuery<Workspace, ApiError>({
    queryKey: ['workspace', workspaceId],
    queryFn: async () => {
      try {
        return await apiClient.get(`workspaces/${workspaceId}`).json<Workspace>();
      } catch (error: any) {
        const apiError = new Error(error.message) as ApiError;
        apiError.status = error.response?.status;
        throw apiError;
      }
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      // Don't retry on 403/404
      if (error.status === 403 || error.status === 404) return false;
      return failureCount < 3;
    },
  });
}
```

### 4.9 DocumentsTab (WorkspaceDetail refactoring)

```typescript
// src/features/workspaces/tabs/DocumentsTab.tsx

import { useOutletContext } from 'react-router-dom';
import { useState, useRef } from 'react';
// ... other imports

interface WorkspaceContext {
  workspace: Workspace;
  workspaceId: string;
}

export function DocumentsTab() {
  const { workspaceId } = useOutletContext<WorkspaceContext>();
  const [documents, setDocuments] = useState<Document[]>([]);
  // ... rest of logic from WorkspaceDetail (upload, documents list, modal)

  return (
    <div>
      {/* Upload area */}
      <UploadArea onUpload={handleFileUpload} isUploading={isUploading} />

      {/* Actions */}
      <div className="flex gap-3 mb-6">
        <button onClick={() => setShowNewDocModal(true)} className="...">
          New Text Document
        </button>
      </div>

      {/* Documents list */}
      <DocumentsList
        documents={documents}
        pagination={pagination}
        onDelete={handleDeleteDocument}
      />

      {/* Modal */}
      {showNewDocModal && (
        <NewDocumentModal onClose={() => setShowNewDocModal(false)} onCreate={handleCreate} />
      )}
    </div>
  );
}
```

---

## 5. UI/UX

### 5.1 Mockup - Workspace with tabs

```
+-------------------------------------------------------------+
|  Synjar                                  user@email.com [v]  |
+-------------------------------------------------------------+
|                                                              |
|  <- Back to workspaces                                       |
|  My Knowledge Base                                           |
|  Company documentation and procedures                        |
|                                                              |
|  +-------------+-------------+-------------+                 |
|  | Documents   | Public Links|             |                 |
|  | =========== |             |             | <- Active tab   |
|  +-------------+-------------+-------------+                 |
|  -----------------------------------------------------------  |
|                                                              |
|  [Tab content here - Documents or Public Links]              |
|                                                              |
+-------------------------------------------------------------+
```

### 5.2 Tab States

| State | Style | CSS Classes |
|-------|-------|-------------|
| Active | White text, blue line | `text-white border-blue-500` |
| Inactive | Gray text, no line | `text-slate-400 border-transparent` |
| Hover | Lighter text, gray line | `hover:text-slate-200 hover:border-slate-600` |
| Focus | Ring for accessibility | `focus-visible:ring-2 focus-visible:ring-blue-500` |

### 5.3 Error States UI

| State | Icon | Title | Action |
|-------|------|-------|--------|
| 404 Not Found | 🔍 | "Workspace not found" | "Back to workspaces" |
| 403 Access Denied | 🔒 | "Access denied" | "Back to workspaces" |
| Network Error | ⚠️ | "Something went wrong" | "Try again" |
| Loading | Skeleton | - | - |

### 5.4 Responsiveness

#### Desktop (>=640px)
- Tabs in single line
- Full text on tabs

#### Mobile (<640px)
- Horizontally scrollable tabs
- `overflow-x-auto` on container
- Scroll indicators (gradient fade) on edges
- Touch-friendly tap targets (min 44x44px)

```typescript
// Mobile scroll container
<div className="overflow-x-auto scrollbar-hide sm:overflow-visible">
  <nav className="flex gap-1 min-w-max sm:min-w-0">
    {/* tabs */}
  </nav>
</div>
```

#### Tablet (640px - 1024px)
- Desktop-like behavior
- Larger tap targets for touch

### 5.5 Sequence Diagram - User Navigation

```
+---------+     +-------------+     +------------+     +---------+
|  User   |     | React Router|     |useWorkspace|     | Backend |
+----+----+     +------+------+     +-----+------+     +----+----+
     |                 |                   |               |
     | Click tab       |                   |               |
     |---------------->|                   |               |
     |                 |                   |               |
     |                 | Update URL        |               |
     |                 |------------------>|               |
     |                 |                   |               |
     |                 |                   | GET /workspace|
     |                 |                   |-------------->|
     |                 |                   |               |
     |                 |                   |<--------------|
     |                 |                   |  workspace    |
     |                 |                   |               |
     |<-----------------------------------------|          |
     |     Render new tab content          |               |
     |                 |                   |               |
```

---

## 6. Accessibility

### 6.1 ARIA Pattern

```html
<nav role="tablist" aria-label="Workspace sections">
  <a role="tab"
     aria-selected="true"
     tabindex="0"
     href="/workspaces/1/documents">
    Documents
  </a>
  <a role="tab"
     aria-selected="false"
     tabindex="-1"
     href="/workspaces/1/public-links">
    Public Links
  </a>
</nav>
```

### 6.2 Keyboard Navigation (REQUIRED)

| Key | Action |
|-----|--------|
| Tab | Navigate to/from tab group |
| Enter/Space | Activate tab |
| Arrow Left | Previous tab (with wrap-around) |
| Arrow Right | Next tab (with wrap-around) |
| Home | First tab |
| End | Last tab |

### 6.3 Screen Reader

- `aria-label="Workspace sections"` on container
- `aria-selected` for active tab
- `role="tab"` for each tab
- Error states have `role="alert"`

---

## 7. Performance

### 7.1 Caching Strategy

```typescript
// useWorkspace hook
{
  staleTime: 5 * 60 * 1000,     // 5 minutes - data considered fresh
  gcTime: 30 * 60 * 1000,       // 30 minutes - cache retention
  refetchOnWindowFocus: false,  // Don't refetch on tab switch
}
```

### 7.2 Prefetching

```typescript
// Prefetch adjacent tab data on hover
function WorkspaceTabs({ workspaceId }) {
  const queryClient = useQueryClient();

  const prefetchPublicLinks = () => {
    queryClient.prefetchQuery({
      queryKey: ['public-links', workspaceId],
      queryFn: () => fetchPublicLinks(workspaceId),
      staleTime: 60 * 1000, // 1 minute
    });
  };

  return (
    <NavLink
      onMouseEnter={prefetchPublicLinks}
      // ...
    />
  );
}
```

### 7.3 Lazy Loading Tabs

```typescript
// src/App.tsx
const DocumentsTab = lazy(() => import('./features/workspaces/tabs/DocumentsTab'));
const PublicLinksTab = lazy(() => import('./features/workspaces/tabs/PublicLinksTab'));

<Route path="documents" element={
  <Suspense fallback={<TabSkeleton />}>
    <DocumentsTab />
  </Suspense>
} />
```

---

## 8. Migration

### 8.1 Migration Steps

1. **Phase 1**: Create WorkspacePage, WorkspaceTabs, WorkspaceHeader
2. **Phase 2**: Refactoring WorkspaceDetail -> DocumentsTab
3. **Phase 3**: Router update (nested routes)
4. **Phase 4**: Implement PublicLinksTab (per SPEC-016)
5. **Phase 5**: E2E tests

### 8.2 Breaking changes

- URL `/workspaces/:id` now redirects to `/workspaces/:id/documents`
- Existing links still work (redirect)

---

## 9. Tests

### 9.1 Test Fixtures

```typescript
// src/features/workspaces/__fixtures__/workspace.fixture.ts

export const mockWorkspace = {
  id: 'ws-123',
  name: 'Test Workspace',
  description: 'A test workspace for unit tests',
  createdAt: '2025-12-28T10:00:00Z',
  updatedAt: '2025-12-28T10:00:00Z',
};

export const mockWorkspaceNoDescription = {
  ...mockWorkspace,
  id: 'ws-456',
  description: null,
};

// API response fixtures
export const workspaceApiResponses = {
  success: mockWorkspace,
  notFound: {
    statusCode: 404,
    message: 'Workspace not found',
    error: 'Not Found',
  },
  forbidden: {
    statusCode: 403,
    message: 'Access denied to workspace',
    error: 'Forbidden',
  },
  serverError: {
    statusCode: 500,
    message: 'Internal server error',
    error: 'Internal Server Error',
  },
};
```

### 9.2 Unit Tests

```typescript
// src/features/workspaces/components/__tests__/WorkspaceTabs.spec.tsx

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { WorkspaceTabs } from '../WorkspaceTabs';

describe('WorkspaceTabs', () => {
  const renderWithRouter = (initialPath: string) => {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <WorkspaceTabs workspaceId="123" />
      </MemoryRouter>
    );
  };

  it('renders all tabs', () => {
    renderWithRouter('/workspaces/123/documents');

    expect(screen.getByRole('tab', { name: /documents/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /public links/i })).toBeInTheDocument();
  });

  it('highlights active tab based on URL', () => {
    renderWithRouter('/workspaces/123/documents');

    const documentsTab = screen.getByRole('tab', { name: /documents/i });
    expect(documentsTab).toHaveAttribute('aria-selected', 'true');
  });

  it('navigates with arrow keys', async () => {
    const user = userEvent.setup();
    renderWithRouter('/workspaces/123/documents');

    const documentsTab = screen.getByRole('tab', { name: /documents/i });
    documentsTab.focus();

    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: /public links/i })).toHaveFocus();
  });

  it('wraps around with arrow keys', async () => {
    const user = userEvent.setup();
    renderWithRouter('/workspaces/123/public-links');

    const publicLinksTab = screen.getByRole('tab', { name: /public links/i });
    publicLinksTab.focus();

    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: /documents/i })).toHaveFocus();
  });

  it('supports Home/End keys', async () => {
    const user = userEvent.setup();
    renderWithRouter('/workspaces/123/documents');

    const documentsTab = screen.getByRole('tab', { name: /documents/i });
    documentsTab.focus();

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: /public links/i })).toHaveFocus();

    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: /documents/i })).toHaveFocus();
  });
});
```

### 9.3 Error State Tests

```typescript
describe('WorkspacePage error states', () => {
  it('shows 404 page when workspace not found', async () => {
    server.use(
      rest.get('/api/v1/workspaces/:id', (req, res, ctx) => {
        return res(ctx.status(404), ctx.json(workspaceApiResponses.notFound));
      })
    );

    render(<WorkspacePage />, { route: '/workspaces/invalid' });

    await screen.findByText(/workspace not found/i);
    expect(screen.getByRole('link', { name: /back to workspaces/i })).toBeInTheDocument();
  });

  it('shows 403 page when access denied', async () => {
    server.use(
      rest.get('/api/v1/workspaces/:id', (req, res, ctx) => {
        return res(ctx.status(403), ctx.json(workspaceApiResponses.forbidden));
      })
    );

    render(<WorkspacePage />, { route: '/workspaces/forbidden' });

    await screen.findByText(/access denied/i);
  });

  it('shows retry button on network error', async () => {
    server.use(
      rest.get('/api/v1/workspaces/:id', (req, res, ctx) => {
        return res.networkError('Network error');
      })
    );

    render(<WorkspacePage />, { route: '/workspaces/123' });

    await screen.findByText(/something went wrong/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
```

### 9.4 E2E Tests (Playwright)

```typescript
// e2e/workspace-tabs.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Workspace Tabs Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    // Login fixture
  });

  test('navigates between workspace tabs', async ({ page }) => {
    // Given I'm on workspace documents tab
    await page.goto('/workspaces/123/documents');
    await expect(page.getByTestId('tab-documents')).toHaveAttribute('aria-selected', 'true');

    // When I click Public Links tab
    await page.getByTestId('tab-public-links').click();

    // Then URL changes and tab is active
    await expect(page).toHaveURL('/workspaces/123/public-links');
    await expect(page.getByTestId('tab-public-links')).toHaveAttribute('aria-selected', 'true');
  });

  test('redirects from /workspaces/:id to /documents', async ({ page }) => {
    // Given I navigate to workspace without tab path
    await page.goto('/workspaces/123');

    // Then I'm redirected to documents tab
    await expect(page).toHaveURL('/workspaces/123/documents');
  });

  test('keyboard navigation works', async ({ page }) => {
    await page.goto('/workspaces/123/documents');

    // Focus on documents tab
    await page.getByTestId('tab-documents').focus();

    // Press arrow right
    await page.keyboard.press('ArrowRight');

    // Public Links tab should be focused and URL changed
    await expect(page.getByTestId('tab-public-links')).toBeFocused();
    await expect(page).toHaveURL('/workspaces/123/public-links');
  });

  test('shows 404 for non-existent workspace', async ({ page }) => {
    await page.goto('/workspaces/non-existent');

    await expect(page.getByText(/workspace not found/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /back to workspaces/i })).toBeVisible();
  });

  test('shows access denied for unauthorized workspace', async ({ page }) => {
    await page.goto('/workspaces/forbidden-ws');

    await expect(page.getByText(/access denied/i)).toBeVisible();
  });
});
```

### 9.5 Acceptance Criteria (Given-When-Then)

```gherkin
Feature: Workspace Tabs Navigation

  Scenario: Navigate to Documents tab
    Given I am logged in as a workspace member
    And I am viewing workspace "My Workspace"
    When I click on the "Documents" tab
    Then I should see the Documents tab content
    And the URL should be "/workspaces/{id}/documents"
    And the "Documents" tab should be highlighted

  Scenario: Navigate to Public Links tab
    Given I am logged in as a workspace member
    And I am on the Documents tab of workspace "My Workspace"
    When I click on the "Public Links" tab
    Then I should see the Public Links tab content
    And the URL should be "/workspaces/{id}/public-links"
    And the "Public Links" tab should be highlighted

  Scenario: Deep link to Public Links
    Given I am logged in as a workspace member
    When I navigate directly to "/workspaces/123/public-links"
    Then I should see the Public Links tab content
    And the "Public Links" tab should be highlighted

  Scenario: Backwards compatibility redirect
    Given I am logged in as a workspace member
    When I navigate to old URL "/workspaces/123"
    Then I should be redirected to "/workspaces/123/documents"
    And I should see the Documents tab content

  Scenario: Keyboard navigation between tabs
    Given I am on the Documents tab
    And the Documents tab has focus
    When I press the right arrow key
    Then the "Public Links" tab should have focus
    And the URL should change to "/workspaces/{id}/public-links"

  Scenario: Access denied error
    Given I am logged in as a user
    And I am not a member of workspace "Private Workspace"
    When I try to access "/workspaces/private-id/documents"
    Then I should see "Access denied" message
    And I should see a "Back to workspaces" link

  Scenario: Workspace not found error
    Given I am logged in as a user
    When I navigate to "/workspaces/non-existent/documents"
    Then I should see "Workspace not found" message
    And I should see a "Back to workspaces" link
```

---

## 10. Definition of Done

### Components
- [ ] WorkspacePage layout component
- [ ] WorkspaceTabs component with keyboard navigation
- [ ] WorkspaceHeader component
- [ ] WorkspacePageSkeleton (loading state)
- [ ] WorkspaceNotFound (404 error state)
- [ ] WorkspaceAccessDenied (403 error state)
- [ ] WorkspaceError (generic error state)
- [ ] DocumentsTab (WorkspaceDetail refactoring)

### Infrastructure
- [ ] Router configuration (nested routes)
- [ ] Redirect from `/workspaces/:id` -> `/workspaces/:id/documents`
- [ ] useWorkspace hook with error handling

### Accessibility
- [ ] ARIA tabs pattern implemented
- [ ] Keyboard navigation (Tab, Enter, Arrow keys, Home, End)
- [ ] Screen reader tested
- [ ] Focus management

### Testing
- [ ] Unit tests for WorkspaceTabs (including keyboard nav)
- [ ] Unit tests for error states
- [ ] E2E test navigation between tabs
- [ ] E2E test error states

### Future (SPEC-016)
- [ ] PublicLinksTab (implementation per SPEC-016)

---

## 11. Estimation

| Task | Complexity |
|------|------------|
| WorkspacePage layout | S |
| WorkspaceTabs with keyboard nav | M |
| WorkspaceHeader | S |
| Error states (404, 403, generic) | S |
| Loading skeleton | S |
| DocumentsTab refactoring | M |
| Router configuration | S |
| useWorkspace hook | S |
| Accessibility | M |
| Unit tests | M |
| E2E tests | M |
| PublicLinksTab | M (separate spec) |
| **TOTAL** | **L** |

---

## 12. Related Documents

- [SPEC-016: Frontend Public Links](./SPEC-016-frontend-public-links.md)
- [ADR-2025-12-25: Signed URLs](../adr/ADR-2025-12-25-signed-urls-for-public-files.md)
- [UX Review: Public Links Placement](../../enterprise/docs/agents/ux-reviewer/reports/2025-12-28-15-41-public-links-placement-ux-review.md)
- [ecosystem.md - Bounded Contexts](../ecosystem.md)

---

## 13. Design Decisions

### 13.1 Why tabs instead of sidebar?

- Current application uses top-nav, not sidebar
- Tabs are lighter and don't require changing the entire layout
- Industry standard for workspace-level navigation

### 13.2 Why React Router instead of local state?

- Deep linking (bookmarks, sharing)
- Back/forward navigation works naturally
- SEO-friendly (if SSR in future)
- Easier testing

### 13.3 Why Documents as default tab?

- It's the main workspace feature (upload, manage docs)
- User flow: upload docs -> create public link
- Public Links is secondary action (after loading content)

### 13.4 Why all tabs visible to everyone?

- Currently no role system in workspace (everyone is equal)
- Implementation simplicity
- Role-based visibility can be added in future when roles appear

### 13.5 Why fixed tab order?

- UX predictability
- Documents as main feature always first
- No need for user-configurable order in MVP

---

## 14. Review History

### 2025-12-28 - Pre-Implementation Review

- **Reviewed by:** Claude (architecture, security, documentation, test, ux)
- **Status:** Approved with changes implemented
- **Findings:**
  - [architecture-reviewer report](../../docs/agents/architecture-reviewer/reports/2025-12-28-16-15-spec-review.md)
  - [security-reviewer report](../../docs/agents/security-reviewer/reports/2025-12-28-16-15-spec-review.md)
  - [documentation-reviewer report](../../docs/agents/documentation-reviewer/reports/2025-12-28-16-15-spec-review.md)
  - [test-reviewer report](../../docs/agents/test-reviewer/reports/2025-12-28-16-15-spec-review.md)
  - [ux-reviewer report](../../docs/agents/ux-reviewer/reports/2025-12-28-16-15-spec-review.md)

**Changes implemented:**
- Added Bounded Context section (1.2)
- Added User Stories section (2)
- Added API Contracts (3.4)
- Added Error States components (4.7)
- Added Loading Skeleton (4.6)
- Added keyboard navigation with Arrow keys as REQUIRED (4.4, 6.2)
- Added mobile/tablet responsiveness details (5.4)
- Added sequence diagram (5.5)
- Added Performance section with caching/prefetching (7)
- Added Test Fixtures (9.1)
- Added Given-When-Then acceptance criteria (9.5)
- Clarified tab visibility (all members) and tab order (fixed)
