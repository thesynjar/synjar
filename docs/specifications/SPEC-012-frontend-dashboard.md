# SPEC-012: Frontend - Dashboard

**Data:** 2025-12-24
**Status:** Draft
**Priorytet:** P0 (Core UI)
**Zależności:** SPEC-011 (Frontend Auth)

---

## 1. Cel biznesowy

Dashboard jako główny punkt wejścia do aplikacji - lista workspace'ów, szybkie statystyki, nawigacja.

### Wartość MVP

- Widok wszystkich workspace'ów usera
- Tworzenie nowego workspace'a
- Szybkie statystyki (dokumenty, storage)
- Nawigacja do workspace'a

---

## 2. Wymagania funkcjonalne

### 2.1 Strony

| Strona | URL | Opis |
|--------|-----|------|
| Dashboard | / | Lista workspace'ów |
| New Workspace | /workspaces/new | Modal/formularz tworzenia |

### 2.2 Komponenty Dashboard

1. **Header**
   - Logo
   - User menu (profile, logout)
   - Plan badge (FREE/PREMIUM)

2. **Workspace List**
   - Karty workspace'ów
   - Role badge (OWNER/MEMBER)
   - Quick stats (docs count, storage)
   - Create new button

3. **Usage Summary**
   - Workspaces: X/Y
   - Storage: X MB / Y MB
   - Progress bar

4. **Quick Actions**
   - Create workspace
   - Upgrade plan (for FREE users)

---

## 3. Implementacja

### 3.1 Struktura plików

```
apps/web/src/features/
├── dashboard/
│   ├── pages/
│   │   └── DashboardPage.tsx
│   ├── components/
│   │   ├── WorkspaceCard.tsx
│   │   ├── WorkspaceList.tsx
│   │   ├── UsageSummary.tsx
│   │   ├── CreateWorkspaceModal.tsx
│   │   └── EmptyState.tsx
│   ├── hooks/
│   │   └── useWorkspaces.ts
│   └── api/
│       └── workspaces.api.ts
└── layout/
    ├── AppLayout.tsx
    ├── Header.tsx
    ├── Sidebar.tsx
    └── UserMenu.tsx
```

### 3.2 Dashboard Page

```typescript
// src/features/dashboard/pages/DashboardPage.tsx

import { useWorkspaces } from '../hooks/useWorkspaces';
import { useUsage } from '@/features/usage/hooks/useUsage';
import { WorkspaceList } from '../components/WorkspaceList';
import { UsageSummary } from '../components/UsageSummary';
import { CreateWorkspaceModal } from '../components/CreateWorkspaceModal';

export function DashboardPage() {
  const { workspaces, isLoading } = useWorkspaces();
  const { usage } = useUsage();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Your Workspaces
          </h1>
          <p className="text-gray-600 mt-1">
            Manage your knowledge bases
          </p>
        </div>

        <Button
          onClick={() => setIsCreateModalOpen(true)}
          disabled={!usage?.workspaces.canCreate}
        >
          <PlusIcon className="w-4 h-4 mr-2" />
          New Workspace
        </Button>
      </div>

      {/* Usage Summary */}
      {usage && (
        <UsageSummary
          workspaces={usage.workspaces}
          storage={usage.storage}
          className="mb-8"
        />
      )}

      {/* Workspace List */}
      {workspaces.length === 0 ? (
        <EmptyState
          title="No workspaces yet"
          description="Create your first workspace to start building your knowledge base."
          action={
            <Button onClick={() => setIsCreateModalOpen(true)}>
              Create Workspace
            </Button>
          }
        />
      ) : (
        <WorkspaceList workspaces={workspaces} />
      )}

      {/* Create Modal */}
      <CreateWorkspaceModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </div>
  );
}
```

### 3.3 Workspace Card

```typescript
// src/features/dashboard/components/WorkspaceCard.tsx

interface WorkspaceCardProps {
  workspace: Workspace;
}

export function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  const navigate = useNavigate();

  return (
    <Card
      className="hover:shadow-lg transition-shadow cursor-pointer"
      onClick={() => navigate(`/workspaces/${workspace.id}`)}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{workspace.name}</CardTitle>
          <RoleBadge role={workspace.role} />
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Documents</span>
            <p className="font-medium">{workspace.documentsCount}</p>
          </div>
          <div>
            <span className="text-gray-500">Storage</span>
            <p className="font-medium">{formatBytes(workspace.storageBytes)}</p>
          </div>
        </div>

        {workspace.role === 'OWNER' && (
          <div className="mt-4">
            <ProgressBar
              value={workspace.documentsCount}
              max={workspace.documentsLimit}
              label="Documents"
            />
          </div>
        )}
      </CardContent>

      <CardFooter className="text-xs text-gray-500">
        Updated {formatRelativeTime(workspace.updatedAt)}
      </CardFooter>
    </Card>
  );
}
```

### 3.4 Usage Summary

```typescript
// src/features/dashboard/components/UsageSummary.tsx

interface UsageSummaryProps {
  workspaces: {
    current: number;
    limit: number;
    percentUsed: number;
  };
  storage: {
    currentMb: number;
    limitMb: number;
    percentUsed: number;
  };
  className?: string;
}

export function UsageSummary({
  workspaces,
  storage,
  className,
}: UsageSummaryProps) {
  const { user } = useAuth();

  return (
    <Card className={className}>
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          {/* Plan Info */}
          <div className="flex items-center gap-3">
            <PlanBadge plan={user?.plan} />
            <span className="text-sm text-gray-600">
              {user?.plan === 'FREE' && (
                <Link to="/plans" className="text-primary-600 hover:underline">
                  Upgrade for more
                </Link>
              )}
            </span>
          </div>

          {/* Stats */}
          <div className="flex gap-8">
            <UsageStat
              label="Workspaces"
              current={workspaces.current}
              limit={workspaces.limit}
              percent={workspaces.percentUsed}
            />
            <UsageStat
              label="Storage"
              current={`${storage.currentMb.toFixed(1)} MB`}
              limit={`${storage.limitMb} MB`}
              percent={storage.percentUsed}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UsageStat({
  label,
  current,
  limit,
  percent,
}: {
  label: string;
  current: string | number;
  limit: string | number;
  percent: number;
}) {
  const isWarning = percent > 80;
  const isCritical = percent > 95;

  return (
    <div className="text-right">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={cn(
        "font-medium",
        isCritical && "text-red-600",
        isWarning && !isCritical && "text-amber-600"
      )}>
        {current} / {limit}
      </p>
      <div className="w-24 h-1.5 bg-gray-200 rounded-full mt-1">
        <div
          className={cn(
            "h-full rounded-full",
            isCritical ? "bg-red-500" :
            isWarning ? "bg-amber-500" : "bg-primary-500"
          )}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}
```

### 3.5 Create Workspace Modal

```typescript
// src/features/dashboard/components/CreateWorkspaceModal.tsx

const createWorkspaceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
});

export function CreateWorkspaceModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { mutate, isPending, error } = useMutation({
    mutationFn: (data: { name: string }) =>
      apiClient.post('/workspaces', data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['usage'] });
      onClose();
      navigate(`/workspaces/${response.data.id}`);
    },
  });

  const form = useForm({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: { name: '' },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Workspace</DialogTitle>
          <DialogDescription>
            A workspace is a container for your documents and knowledge base.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit((data) => mutate(data))}>
          {error && (
            <Alert variant="error" className="mb-4">
              {getErrorMessage(error)}
            </Alert>
          )}

          <FormField
            label="Workspace Name"
            error={form.formState.errors.name?.message}
          >
            <Input
              {...form.register('name')}
              placeholder="My Knowledge Base"
              autoFocus
            />
          </FormField>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

### 3.6 Hooks

```typescript
// src/features/dashboard/hooks/useWorkspaces.ts

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const response = await apiClient.get('/workspaces');
      return response.data as Workspace[];
    },
  });
}

// src/features/usage/hooks/useUsage.ts

export function useUsage() {
  return useQuery({
    queryKey: ['usage'],
    queryFn: async () => {
      const response = await apiClient.get('/usage');
      return response.data as UserUsage;
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}
```

---

## 4. UI/UX

### 4.1 Dashboard mockup

```
┌─────────────────────────────────────────────────────────────┐
│  📚 Synjar                             [User ▼] [FREE]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Your Workspaces                        [+ New Workspace]   │
│  Manage your knowledge bases                                │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ FREE Plan                    Workspaces: 1/1  ████  │    │
│  │ Upgrade for more            Storage: 45/100 MB ███  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ My Knowledge    │  │                 │                   │
│  │ Base            │  │  + Create new   │                   │
│  │ ─────────────── │  │    workspace    │                   │
│  │ OWNER           │  │                 │                   │
│  │                 │  │                 │                   │
│  │ Docs: 42        │  │                 │                   │
│  │ Storage: 45 MB  │  │                 │                   │
│  │                 │  │                 │                   │
│  │ ████████░░ 42%  │  │                 │                   │
│  │                 │  │                 │                   │
│  │ Updated 2h ago  │  │                 │                   │
│  └─────────────────┘  └─────────────────┘                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Testy

```typescript
describe('DashboardPage', () => {
  it('shows empty state when no workspaces', async () => {
    mockWorkspaces([]);

    render(<DashboardPage />);

    expect(screen.getByText(/no workspaces yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create workspace/i }))
      .toBeInTheDocument();
  });

  it('shows workspace list', async () => {
    mockWorkspaces([
      { id: '1', name: 'Test Workspace', role: 'OWNER', documentsCount: 10 },
    ]);

    render(<DashboardPage />);

    expect(screen.getByText('Test Workspace')).toBeInTheDocument();
    expect(screen.getByText('OWNER')).toBeInTheDocument();
  });

  it('disables create button when limit reached', async () => {
    mockUsage({ workspaces: { current: 1, limit: 1, canCreate: false } });

    render(<DashboardPage />);

    expect(screen.getByRole('button', { name: /new workspace/i }))
      .toBeDisabled();
  });
});
```

---

## 6. Definition of Done

- [ ] AppLayout z Header
- [ ] DashboardPage
- [ ] WorkspaceCard component
- [ ] WorkspaceList component
- [ ] UsageSummary component
- [ ] CreateWorkspaceModal
- [ ] useWorkspaces hook
- [ ] useUsage hook
- [ ] Empty state
- [ ] Loading skeleton
- [ ] Unit testy
- [ ] Responsive design

---

## 7. Estymacja

| Zadanie | Złożoność |
|---------|-----------|
| Layout + Header | S |
| Dashboard page | M |
| Workspace card | S |
| Usage summary | S |
| Create modal | S |
| Hooks + API | S |
| Testy | M |
| **TOTAL** | **M** |

---

## 8. Następna specyfikacja

Po wdrożeniu: **SPEC-013: Frontend - Documents**
