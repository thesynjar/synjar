import { useParams, useLocation, Link } from 'react-router-dom';

/**
 * MainNav - Primary navigation for workspace sections
 *
 * Shows Documents | Search Links | Instruction Sets links in the header
 * Uses query params (?tab=xxx) to maintain compatibility with existing URL structure
 *
 * See: docs/specifications/2025-12-30-navigation-redesign.md (Section 2.2)
 */
interface MainNavProps {
  className?: string;
}

type TabId = 'documents' | 'search-links' | 'instruction-sets';

interface NavItem {
  id: TabId;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'documents', label: 'Documents' },
  { id: 'search-links', label: 'Search Links' },
  { id: 'instruction-sets', label: 'Sets' },
];

export function MainNav({ className = '' }: MainNavProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const location = useLocation();

  // Determine active tab from URL
  const getActiveTab = (): TabId | null => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get('tab') as TabId | null;

    // Check for explicit tab param
    if (tabParam && NAV_ITEMS.some((item) => item.id === tabParam)) {
      return tabParam;
    }

    // Default to documents when on workspace detail page without tab param
    if (workspaceId && !location.pathname.includes('/documents/')) {
      return 'documents';
    }

    return null;
  };

  const activeTab = getActiveTab();

  // If no workspace selected, don't show nav items
  if (!workspaceId) {
    return null;
  }

  return (
    <nav className={`flex items-center gap-1 ${className}`} aria-label="Workspace navigation">
      {NAV_ITEMS.map((item) => {
        const isActive = activeTab === item.id;
        return (
          <Link
            key={item.id}
            to={`/workspaces/${workspaceId}?tab=${item.id}`}
            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              isActive
                ? 'text-white bg-slate-700'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
