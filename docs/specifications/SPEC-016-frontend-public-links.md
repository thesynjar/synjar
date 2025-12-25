# SPEC-016: Frontend - Public Links

**Data:** 2025-12-24
**Status:** Draft
**Priorytet:** P1 (Core feature)
**Zależności:** SPEC-012 (Frontend Dashboard)

---

## 1. Cel biznesowy

Zarządzanie publicznymi linkami - tworzenie, konfiguracja, monitorowanie dostępu zewnętrznego do bazy wiedzy.

### Wartość MVP

- Tworzenie publicznych linków
- Konfiguracja zakresu (tagi)
- Data wygaśnięcia
- Kopiowanie URL
- Lista aktywnych linków

---

## 2. Wymagania funkcjonalne

### 2.1 Strony

| Strona | URL | Opis |
|--------|-----|------|
| Public Links List | /workspaces/:id/public-links | Lista linków |
| Create Link | Modal | Tworzenie linku |
| Link Details | Sheet/Modal | Szczegóły i URL |

### 2.2 Funkcjonalności

1. **Lista linków**
   - Nazwa linku
   - Status (active/expired)
   - Dozwolone tagi
   - Data wygaśnięcia
   - Akcje (copy, edit, delete)

2. **Tworzenie linku**
   - Nazwa (opcjonalna)
   - Dozwolone tagi (multi-select lub wszystkie)
   - Data wygaśnięcia (opcjonalna)
   - Generowany URL

3. **Szczegóły linku**
   - URL do skopiowania
   - Przykład użycia (curl)
   - QR code (opcjonalnie)

---

## 3. Implementacja

### 3.1 Struktura plików

```
apps/web/src/features/public-links/
├── pages/
│   └── PublicLinksPage.tsx
├── components/
│   ├── PublicLinksList.tsx
│   ├── PublicLinkCard.tsx
│   ├── CreateLinkModal.tsx
│   ├── LinkDetailsSheet.tsx
│   ├── CopyUrlButton.tsx
│   └── UsageExample.tsx
├── hooks/
│   ├── usePublicLinks.ts
│   └── usePublicLinkMutations.ts
└── api/
    └── public-links.api.ts
```

### 3.2 Public Links Page

```typescript
// src/features/public-links/pages/PublicLinksPage.tsx

export function PublicLinksPage() {
  const { workspaceId } = useParams();
  const { links, isLoading } = usePublicLinks(workspaceId!);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedLink, setSelectedLink] = useState<PublicLink | null>(null);

  const activeLinks = links.filter(l => l.isActive && !isExpired(l));
  const expiredLinks = links.filter(l => !l.isActive || isExpired(l));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Public Links</h1>
          <p className="text-gray-600">
            Share your knowledge base with external systems
          </p>
        </div>

        <Button onClick={() => setIsCreateOpen(true)}>
          <LinkIcon className="w-4 h-4 mr-2" />
          Create Link
        </Button>
      </div>

      {/* Info banner */}
      <Alert>
        <InfoIcon className="w-4 h-4" />
        <AlertDescription>
          Public links allow external systems (like LLMs) to search your
          knowledge base without authentication.{' '}
          <Link to="/docs/public-api" className="underline">
            Learn more
          </Link>
        </AlertDescription>
      </Alert>

      {/* Links list */}
      {isLoading ? (
        <PublicLinksListSkeleton />
      ) : links.length === 0 ? (
        <EmptyState
          icon={<LinkIcon />}
          title="No public links yet"
          description="Create a public link to share your knowledge base with external systems."
          action={
            <Button onClick={() => setIsCreateOpen(true)}>
              Create your first link
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {/* Active links */}
          {activeLinks.length > 0 && (
            <section>
              <h2 className="text-lg font-medium mb-3">
                Active Links ({activeLinks.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {activeLinks.map((link) => (
                  <PublicLinkCard
                    key={link.id}
                    link={link}
                    onClick={() => setSelectedLink(link)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Expired links */}
          {expiredLinks.length > 0 && (
            <section>
              <h2 className="text-lg font-medium mb-3 text-gray-500">
                Expired Links ({expiredLinks.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2 opacity-60">
                {expiredLinks.map((link) => (
                  <PublicLinkCard
                    key={link.id}
                    link={link}
                    onClick={() => setSelectedLink(link)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Modals */}
      <CreateLinkModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        workspaceId={workspaceId!}
      />

      <LinkDetailsSheet
        link={selectedLink}
        onClose={() => setSelectedLink(null)}
      />
    </div>
  );
}
```

### 3.3 Public Link Card

```typescript
// src/features/public-links/components/PublicLinkCard.tsx

interface PublicLinkCardProps {
  link: PublicLink;
  onClick: () => void;
}

export function PublicLinkCard({ link, onClick }: PublicLinkCardProps) {
  const isExpired = link.expiresAt && new Date(link.expiresAt) < new Date();
  const { mutate: copyUrl } = useCopyToClipboard();

  return (
    <Card
      className={cn(
        'cursor-pointer hover:shadow-md transition-shadow',
        isExpired && 'opacity-60'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <LinkIcon className="w-5 h-5 text-gray-400" />
            <h3 className="font-medium">
              {link.name || 'Unnamed Link'}
            </h3>
          </div>

          <StatusBadge
            status={isExpired ? 'expired' : link.isActive ? 'active' : 'disabled'}
          />
        </div>

        {/* Tags scope */}
        <div className="mb-3">
          {link.allowedTags.length === 0 ? (
            <span className="text-sm text-gray-500">All documents</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {link.allowedTags.slice(0, 3).map((tag) => (
                <TagBadge key={tag} tag={tag} size="sm" />
              ))}
              {link.allowedTags.length > 3 && (
                <span className="text-xs text-gray-500">
                  +{link.allowedTags.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>

        {/* Expiration */}
        {link.expiresAt && (
          <p className="text-sm text-gray-500">
            {isExpired ? (
              <span className="text-red-600">
                Expired {formatRelativeTime(link.expiresAt)}
              </span>
            ) : (
              <>Expires {formatRelativeTime(link.expiresAt)}</>
            )}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              copyUrl(buildPublicUrl(link.token));
            }}
          >
            <CopyIcon className="w-4 h-4 mr-1" />
            Copy URL
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: 'active' | 'expired' | 'disabled' }) {
  const config = {
    active: { color: 'bg-green-100 text-green-700', label: 'Active' },
    expired: { color: 'bg-red-100 text-red-700', label: 'Expired' },
    disabled: { color: 'bg-gray-100 text-gray-700', label: 'Disabled' },
  };

  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', config[status].color)}>
      {config[status].label}
    </span>
  );
}
```

### 3.4 Create Link Modal

```typescript
// src/features/public-links/components/CreateLinkModal.tsx

const createLinkSchema = z.object({
  name: z.string().optional(),
  allowedTags: z.array(z.string()),
  expiresAt: z.date().optional(),
  allTags: z.boolean(),
});

export function CreateLinkModal({
  open,
  onClose,
  workspaceId,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  const { tags } = useWorkspaceTags(workspaceId);
  const [createdLink, setCreatedLink] = useState<PublicLink | null>(null);

  const form = useForm({
    resolver: zodResolver(createLinkSchema),
    defaultValues: {
      name: '',
      allowedTags: [],
      expiresAt: undefined,
      allTags: true,
    },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: async (data: z.infer<typeof createLinkSchema>) => {
      const response = await apiClient.post(
        `/workspaces/${workspaceId}/public-links`,
        {
          name: data.name || undefined,
          allowedTags: data.allTags ? [] : data.allowedTags,
          expiresAt: data.expiresAt?.toISOString(),
        }
      );
      return response.data;
    },
    onSuccess: (link) => {
      queryClient.invalidateQueries({ queryKey: ['public-links'] });
      setCreatedLink(link);
    },
  });

  const handleClose = () => {
    setCreatedLink(null);
    form.reset();
    onClose();
  };

  // Show created link
  if (createdLink) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircleIcon className="w-5 h-5 text-green-500" />
              Link Created
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-gray-600">
              Your public link is ready. Copy the URL below to use it.
            </p>

            <CopyableUrl url={buildPublicUrl(createdLink.token)} />

            <UsageExample token={createdLink.token} />
          </div>

          <DialogFooter>
            <Button onClick={handleClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Public Link</DialogTitle>
          <DialogDescription>
            Generate a link to share your knowledge base with external systems.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit((data) => mutate(data))}>
          <div className="space-y-4">
            {/* Name */}
            <FormField label="Name (optional)">
              <Input
                {...form.register('name')}
                placeholder="e.g., ChatGPT Integration"
              />
            </FormField>

            {/* Tags scope */}
            <FormField label="Access scope">
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    {...form.register('allTags')}
                    value="true"
                    checked={form.watch('allTags')}
                    onChange={() => form.setValue('allTags', true)}
                  />
                  <span>All documents</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={!form.watch('allTags')}
                    onChange={() => form.setValue('allTags', false)}
                  />
                  <span>Only specific tags</span>
                </label>

                {!form.watch('allTags') && (
                  <MultiSelect
                    options={tags.map(t => ({ value: t, label: t }))}
                    value={form.watch('allowedTags')}
                    onChange={(tags) => form.setValue('allowedTags', tags)}
                    placeholder="Select tags..."
                  />
                )}
              </div>
            </FormField>

            {/* Expiration */}
            <FormField label="Expiration (optional)">
              <DatePicker
                value={form.watch('expiresAt')}
                onChange={(date) => form.setValue('expiresAt', date)}
                placeholder="Never expires"
                minDate={new Date()}
              />
            </FormField>
          </div>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" loading={isPending}>
              Create Link
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

### 3.5 Link Details Sheet

```typescript
// src/features/public-links/components/LinkDetailsSheet.tsx

export function LinkDetailsSheet({
  link,
  onClose,
}: {
  link: PublicLink | null;
  onClose: () => void;
}) {
  const { mutate: deleteLink } = useDeletePublicLink();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!link) return null;

  const publicUrl = buildPublicUrl(link.token);

  return (
    <Sheet open={!!link} onOpenChange={onClose}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{link.name || 'Public Link'}</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* URL */}
          <section>
            <h3 className="text-sm font-medium mb-2">Public URL</h3>
            <CopyableUrl url={publicUrl} />
          </section>

          {/* Search endpoint */}
          <section>
            <h3 className="text-sm font-medium mb-2">Search Endpoint</h3>
            <CopyableUrl url={`${publicUrl}/search`} />
          </section>

          {/* Usage example */}
          <section>
            <h3 className="text-sm font-medium mb-2">Usage Example</h3>
            <UsageExample token={link.token} />
          </section>

          {/* Details */}
          <section>
            <h3 className="text-sm font-medium mb-2">Details</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Status</dt>
                <dd>
                  <StatusBadge
                    status={
                      isExpired(link) ? 'expired' :
                      link.isActive ? 'active' : 'disabled'
                    }
                  />
                </dd>
              </div>

              <div className="flex justify-between">
                <dt className="text-gray-500">Scope</dt>
                <dd>
                  {link.allowedTags.length === 0
                    ? 'All documents'
                    : link.allowedTags.join(', ')}
                </dd>
              </div>

              <div className="flex justify-between">
                <dt className="text-gray-500">Created</dt>
                <dd>{formatDate(link.createdAt)}</dd>
              </div>

              {link.expiresAt && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Expires</dt>
                  <dd>{formatDate(link.expiresAt)}</dd>
                </div>
              )}
            </dl>
          </section>

          {/* Actions */}
          <section className="pt-4 border-t">
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <TrashIcon className="w-4 h-4 mr-2" />
              Delete Link
            </Button>
          </section>
        </div>

        {/* Delete confirmation */}
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Public Link?</AlertDialogTitle>
              <AlertDialogDescription>
                This will immediately revoke access for any system using this link.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  deleteLink(link.id);
                  onClose();
                }}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
```

### 3.6 Usage Example Component

```typescript
// src/features/public-links/components/UsageExample.tsx

export function UsageExample({ token }: { token: string }) {
  const baseUrl = import.meta.env.VITE_API_URL || window.location.origin;
  const searchUrl = `${baseUrl}/api/v1/public/${token}/search`;

  const curlExample = `curl -X GET "${searchUrl}?query=How%20to%20process%20refunds&limit=5"`;

  const pythonExample = `import requests

response = requests.get(
    "${searchUrl}",
    params={"query": "How to process refunds", "limit": 5}
)
results = response.json()`;

  return (
    <Tabs defaultValue="curl">
      <TabsList>
        <TabsTrigger value="curl">cURL</TabsTrigger>
        <TabsTrigger value="python">Python</TabsTrigger>
      </TabsList>

      <TabsContent value="curl">
        <CodeBlock language="bash" code={curlExample} copyable />
      </TabsContent>

      <TabsContent value="python">
        <CodeBlock language="python" code={pythonExample} copyable />
      </TabsContent>
    </Tabs>
  );
}
```

### 3.7 API Response Structure

#### Public Document Response

```typescript
interface PublicDocumentDto {
  id: string;
  title: string;
  content: string;
  tags: string[];
  verificationStatus: VerificationStatus;
  fileUrl: string | null;  // Pre-signed URL (expires in 1 hour)
  createdAt: Date;
}
```

#### Public Search Result Response

```typescript
interface PublicSearchResultDto {
  documentId: string;
  chunkId: string;
  title: string;
  content: string;
  score: number;
  tags: string[];
  fileUrl: string | null;  // Pre-signed URL (expires in 1 hour)
}
```

**Note:** `fileUrl` contains a pre-signed URL valid for 1 hour. External systems should download the file within this timeframe.

---

## 4. UI/UX

### 4.1 Public Links List mockup

```
┌─────────────────────────────────────────────────────────────┐
│  Public Links                                [Create Link]  │
│  Share your knowledge base with external systems            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ℹ️ Public links allow external systems to search    │    │
│  │    your knowledge base without authentication.      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Active Links (2)                                           │
│                                                             │
│  ┌─────────────────────────┐  ┌─────────────────────────┐   │
│  │ 🔗 ChatGPT Integration  │  │ 🔗 Customer Bot         │   │
│  │                  Active │  │                  Active │   │
│  │                         │  │                         │   │
│  │ All documents           │  │ [support] [faq]         │   │
│  │                         │  │                         │   │
│  │ Never expires           │  │ Expires in 25 days      │   │
│  │                         │  │                         │   │
│  │ [Copy URL]              │  │ [Copy URL]              │   │
│  └─────────────────────────┘  └─────────────────────────┘   │
│                                                             │
│  Expired Links (1)                                          │
│                                                             │
│  ┌─────────────────────────┐                                │
│  │ 🔗 Old Integration      │                                │
│  │                 Expired │                                │
│  │ Expired 5 days ago      │                                │
│  └─────────────────────────┘                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Definition of Done

- [ ] PublicLinksPage
- [ ] PublicLinkCard
- [ ] CreateLinkModal
- [ ] LinkDetailsSheet
- [ ] CopyableUrl component
- [ ] UsageExample z code snippets
- [ ] usePublicLinks hook
- [ ] Delete confirmation
- [ ] Unit testy
- [ ] E2E test create link

---

## 6. Estymacja

| Zadanie | Złożoność |
|---------|-----------|
| PublicLinksPage | S |
| CreateLinkModal | M |
| LinkDetailsSheet | M |
| UsageExample | S |
| Hooks + API | S |
| Testy | S |
| **TOTAL** | **M** |

---

## 7. Podsumowanie specyfikacji

To kończy serię specyfikacji dla MVP Synjar:

| # | Specyfikacja | Priorytet | Złożoność |
|---|--------------|-----------|-----------|
| 001 | RLS | P0 | M |
| 002 | Plan/Subscription | P0 | M |
| 003 | Workspace Limit | P0 | S |
| 004 | Document Limit | P0 | S |
| 005 | Storage Limit | P0 | M |
| 006 | Usage Tracking | P1 | M |
| 007 | Fixed-size Chunking | P1 | M |
| 008 | Chunking Strategy | P1 | S |
| 009 | Conflict Auditor | P2 | L |
| 010 | Recommendations | P2 | M |
| 011 | Frontend Auth | P0 | M |
| 012 | Frontend Dashboard | P0 | M |
| 013 | Frontend Documents | P0 | L |
| 014 | Frontend Markdown | P1 | M |
| 015 | Frontend Search | P1 | M |
| 016 | Frontend Public Links | P1 | M |

**Rekomendowana kolejność implementacji:**
1. SPEC-001 → SPEC-003/004/005 (fundamenty) - Plan/Subscription w enterprise
2. SPEC-011 → SPEC-012 → SPEC-013 (frontend core)
3. SPEC-006 → SPEC-007 → SPEC-008 (usage + chunking)
4. SPEC-015 → SPEC-016 (frontend features)
5. SPEC-014 (markdown editor)
6. SPEC-009 → SPEC-010 (premium features)
