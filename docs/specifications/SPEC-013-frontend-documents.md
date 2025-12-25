# SPEC-013: Frontend - Documents

**Data:** 2025-12-24
**Status:** Draft
**Priorytet:** P0 (Core UI)
**Zależności:** SPEC-012 (Frontend Dashboard)

---

## 1. Cel biznesowy

Zarządzanie dokumentami w workspace - lista, upload plików, tworzenie tekstowych, filtrowanie.

### Wartość MVP

- Lista dokumentów z filtrowaniem po tagach i statusie
- Upload plików (drag & drop)
- Tworzenie dokumentów tekstowych
- Podgląd dokumentu
- Usuwanie dokumentów

---

## 2. Wymagania funkcjonalne

### 2.1 Strony

| Strona | URL | Opis |
|--------|-----|------|
| Documents List | /workspaces/:id/documents | Lista dokumentów |
| Document Detail | /workspaces/:id/documents/:docId | Szczegóły dokumentu |
| New Document | /workspaces/:id/documents/new | Tworzenie dokumentu |

### 2.2 Funkcjonalności

1. **Lista dokumentów**
   - Tabela/karty z dokumentami
   - Filtrowanie: tagi, status weryfikacji, status przetwarzania
   - Wyszukiwanie po tytule
   - Paginacja
   - Sortowanie (data, tytuł)

2. **Upload plików**
   - Drag & drop zone
   - Obsługa PDF, DOCX, TXT, MD
   - Progress bar
   - Multiple files
   - Walidacja rozmiaru

3. **Tworzenie tekstowe**
   - Tytuł + treść (markdown)
   - Tagi
   - Status weryfikacji
   - Opis źródła

4. **Podgląd dokumentu**
   - Metadata
   - Treść (rendered markdown)
   - Lista chunków
   - Tagi (edytowalne)
   - Status (edytowalny)

---

## 3. Implementacja

### 3.1 Struktura plików

```
apps/web/src/features/documents/
├── pages/
│   ├── DocumentsPage.tsx
│   ├── DocumentDetailPage.tsx
│   └── NewDocumentPage.tsx
├── components/
│   ├── DocumentList.tsx
│   ├── DocumentCard.tsx
│   ├── DocumentTable.tsx
│   ├── DocumentFilters.tsx
│   ├── FileUploadZone.tsx
│   ├── UploadProgress.tsx
│   ├── DocumentForm.tsx
│   ├── DocumentPreview.tsx
│   ├── ChunksList.tsx
│   ├── TagsInput.tsx
│   └── VerificationBadge.tsx
├── hooks/
│   ├── useDocuments.ts
│   ├── useDocument.ts
│   ├── useUploadDocument.ts
│   └── useDocumentMutations.ts
└── api/
    └── documents.api.ts
```

### 3.2 Documents Page

```typescript
// src/features/documents/pages/DocumentsPage.tsx

export function DocumentsPage() {
  const { workspaceId } = useParams();
  const [filters, setFilters] = useState<DocumentFilters>({});
  const [view, setView] = useState<'table' | 'grid'>('table');

  const {
    documents,
    isLoading,
    pagination,
    setPage,
  } = useDocuments(workspaceId!, filters);

  const [isUploadOpen, setIsUploadOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-gray-600">
            {pagination.total} documents in this workspace
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsUploadOpen(true)}>
            <UploadIcon className="w-4 h-4 mr-2" />
            Upload Files
          </Button>
          <Button asChild>
            <Link to={`/workspaces/${workspaceId}/documents/new`}>
              <PlusIcon className="w-4 h-4 mr-2" />
              New Document
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <DocumentFilters
        filters={filters}
        onChange={setFilters}
        viewMode={view}
        onViewModeChange={setView}
      />

      {/* List */}
      {isLoading ? (
        <DocumentsSkeleton />
      ) : documents.length === 0 ? (
        <EmptyState
          icon={<DocumentIcon />}
          title="No documents yet"
          description="Upload files or create text documents to build your knowledge base."
          actions={
            <>
              <Button onClick={() => setIsUploadOpen(true)}>
                Upload Files
              </Button>
              <Button variant="outline" asChild>
                <Link to={`/workspaces/${workspaceId}/documents/new`}>
                  Create Document
                </Link>
              </Button>
            </>
          }
        />
      ) : view === 'table' ? (
        <DocumentTable documents={documents} />
      ) : (
        <DocumentGrid documents={documents} />
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <Pagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          onPageChange={setPage}
        />
      )}

      {/* Upload Modal */}
      <FileUploadModal
        open={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        workspaceId={workspaceId!}
      />
    </div>
  );
}
```

### 3.3 File Upload Zone

```typescript
// src/features/documents/components/FileUploadZone.tsx

interface FileUploadZoneProps {
  workspaceId: string;
  onUploadComplete: () => void;
  maxFileSizeMb: number;
}

export function FileUploadZone({
  workspaceId,
  onUploadComplete,
  maxFileSizeMb,
}: FileUploadZoneProps) {
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const { uploadFile } = useUploadDocument(workspaceId);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const newFiles = acceptedFiles.map((file) => ({
        id: crypto.randomUUID(),
        file,
        progress: 0,
        status: 'pending' as const,
      }));

      setFiles((prev) => [...prev, ...newFiles]);

      // Upload files sequentially
      for (const uploadFile of newFiles) {
        try {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === uploadFile.id ? { ...f, status: 'uploading' } : f
            )
          );

          await uploadFile(uploadFile.file, (progress) => {
            setFiles((prev) =>
              prev.map((f) =>
                f.id === uploadFile.id ? { ...f, progress } : f
              )
            );
          });

          setFiles((prev) =>
            prev.map((f) =>
              f.id === uploadFile.id
                ? { ...f, status: 'complete', progress: 100 }
                : f
            )
          );
        } catch (error) {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === uploadFile.id
                ? { ...f, status: 'error', error: getErrorMessage(error) }
                : f
            )
          );
        }
      }

      onUploadComplete();
    },
    [uploadFile, onUploadComplete]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
    },
    maxSize: maxFileSizeMb * 1024 * 1024,
  });

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer',
          'transition-colors',
          isDragActive
            ? 'border-primary-500 bg-primary-50'
            : 'border-gray-300 hover:border-gray-400'
        )}
      >
        <input {...getInputProps()} />
        <UploadCloudIcon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
        <p className="text-lg font-medium">
          {isDragActive ? 'Drop files here' : 'Drag & drop files here'}
        </p>
        <p className="text-sm text-gray-500 mt-1">
          or click to select files
        </p>
        <p className="text-xs text-gray-400 mt-2">
          PDF, DOCX, TXT, MD up to {maxFileSizeMb} MB each
        </p>
      </div>

      {/* Upload Progress */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file) => (
            <UploadProgressItem key={file.id} file={file} />
          ))}
        </div>
      )}
    </div>
  );
}

function UploadProgressItem({ file }: { file: UploadingFile }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
      <FileIcon className="w-8 h-8 text-gray-400" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.file.name}</p>
        <p className="text-xs text-gray-500">
          {formatBytes(file.file.size)}
        </p>
      </div>

      <div className="w-32">
        {file.status === 'uploading' && (
          <div className="space-y-1">
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 transition-all"
                style={{ width: `${file.progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 text-right">
              {file.progress}%
            </p>
          </div>
        )}
        {file.status === 'complete' && (
          <CheckCircleIcon className="w-5 h-5 text-green-500" />
        )}
        {file.status === 'error' && (
          <div className="flex items-center gap-1 text-red-500">
            <XCircleIcon className="w-5 h-5" />
            <span className="text-xs">Failed</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

### 3.4 Document Form (New/Edit)

```typescript
// src/features/documents/components/DocumentForm.tsx

const documentSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  content: z.string().min(1, 'Content is required'),
  verificationStatus: z.enum(['VERIFIED', 'UNVERIFIED']),
  sourceDescription: z.string().optional(),
  tags: z.array(z.string()),
});

interface DocumentFormProps {
  workspaceId: string;
  initialData?: Partial<DocumentFormData>;
  onSubmit: (data: DocumentFormData) => Promise<void>;
  isSubmitting: boolean;
}

export function DocumentForm({
  workspaceId,
  initialData,
  onSubmit,
  isSubmitting,
}: DocumentFormProps) {
  const form = useForm({
    resolver: zodResolver(documentSchema),
    defaultValues: {
      title: '',
      content: '',
      verificationStatus: 'UNVERIFIED' as const,
      sourceDescription: '',
      tags: [],
      ...initialData,
    },
  });

  const { existingTags } = useWorkspaceTags(workspaceId);

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* Title */}
      <FormField
        label="Title"
        error={form.formState.errors.title?.message}
        required
      >
        <Input
          {...form.register('title')}
          placeholder="Document title"
        />
      </FormField>

      {/* Content */}
      <FormField
        label="Content"
        description="Supports Markdown formatting"
        error={form.formState.errors.content?.message}
        required
      >
        <MarkdownEditor
          value={form.watch('content')}
          onChange={(value) => form.setValue('content', value)}
          placeholder="Write your document content here..."
          minHeight={300}
        />
      </FormField>

      {/* Verification Status */}
      <FormField label="Verification Status">
        <RadioGroup
          value={form.watch('verificationStatus')}
          onValueChange={(value) =>
            form.setValue('verificationStatus', value as any)
          }
        >
          <RadioGroupItem value="VERIFIED">
            <div className="flex items-center gap-2">
              <CheckCircleIcon className="w-4 h-4 text-green-500" />
              <span>Verified</span>
            </div>
            <p className="text-xs text-gray-500">
              This is a trusted, fact-checked source
            </p>
          </RadioGroupItem>
          <RadioGroupItem value="UNVERIFIED">
            <div className="flex items-center gap-2">
              <AlertCircleIcon className="w-4 h-4 text-amber-500" />
              <span>Unverified</span>
            </div>
            <p className="text-xs text-gray-500">
              This source needs verification (e.g., email, draft)
            </p>
          </RadioGroupItem>
        </RadioGroup>
      </FormField>

      {/* Source Description */}
      <FormField
        label="Source Description"
        description="Optional - describe where this content came from"
      >
        <Input
          {...form.register('sourceDescription')}
          placeholder="e.g., Email from customer, GPT-4 generated report"
        />
      </FormField>

      {/* Tags */}
      <FormField
        label="Tags"
        description="Add tags to organize your documents"
      >
        <TagsInput
          value={form.watch('tags')}
          onChange={(tags) => form.setValue('tags', tags)}
          suggestions={existingTags}
          placeholder="Add a tag..."
        />
      </FormField>

      {/* Submit */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" asChild>
          <Link to={`/workspaces/${workspaceId}/documents`}>Cancel</Link>
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {initialData ? 'Save Changes' : 'Create Document'}
        </Button>
      </div>
    </form>
  );
}
```

### 3.5 Document Detail Page

```typescript
// src/features/documents/pages/DocumentDetailPage.tsx

export function DocumentDetailPage() {
  const { workspaceId, documentId } = useParams();
  const { document, isLoading } = useDocument(documentId!);
  const [isEditing, setIsEditing] = useState(false);

  if (isLoading) return <DocumentDetailSkeleton />;
  if (!document) return <NotFound />;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <VerificationBadge status={document.verificationStatus} />
            <ProcessingBadge status={document.processingStatus} />
          </div>
          <h1 className="text-2xl font-bold">{document.title}</h1>
          <p className="text-gray-500 text-sm mt-1">
            Created {formatDate(document.createdAt)}
            {document.sourceDescription && (
              <> &middot; Source: {document.sourceDescription}</>
            )}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsEditing(true)}>
            <EditIcon className="w-4 h-4 mr-2" />
            Edit
          </Button>
          <DeleteDocumentButton documentId={document.id} />
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2">
        {document.tags.map((tag) => (
          <TagBadge key={tag.id} tag={tag} />
        ))}
        <AddTagButton documentId={document.id} />
      </div>

      {/* Content */}
      <Card>
        <CardHeader>
          <CardTitle>Content</CardTitle>
        </CardHeader>
        <CardContent>
          {document.contentType === 'FILE' ? (
            <FilePreview document={document} />
          ) : (
            <MarkdownPreview content={document.content} />
          )}
        </CardContent>
      </Card>

      {/* Chunks */}
      {document.processingStatus === 'COMPLETED' && (
        <Card>
          <CardHeader>
            <CardTitle>Chunks ({document.chunks.length})</CardTitle>
            <CardDescription>
              How this document was split for search
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChunksList chunks={document.chunks} />
          </CardContent>
        </Card>
      )}

      {/* Edit Sheet */}
      <EditDocumentSheet
        document={document}
        open={isEditing}
        onClose={() => setIsEditing(false)}
      />
    </div>
  );
}
```

### 3.6 Hooks

```typescript
// src/features/documents/hooks/useDocuments.ts

export function useDocuments(
  workspaceId: string,
  filters: DocumentFilters = {},
) {
  const [page, setPage] = useState(1);
  const limit = 20;

  const query = useQuery({
    queryKey: ['documents', workspaceId, filters, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        ...(filters.tags && { tags: filters.tags.join(',') }),
        ...(filters.status && { status: filters.status }),
        ...(filters.processingStatus && {
          processingStatus: filters.processingStatus,
        }),
        ...(filters.search && { search: filters.search }),
      });

      const response = await apiClient.get(
        `/workspaces/${workspaceId}/documents?${params}`
      );
      return response.data as PaginatedResponse<Document>;
    },
  });

  return {
    documents: query.data?.items ?? [],
    isLoading: query.isLoading,
    pagination: {
      page,
      totalPages: query.data?.totalPages ?? 1,
      total: query.data?.total ?? 0,
    },
    setPage,
  };
}

// src/features/documents/hooks/useUploadDocument.ts

export function useUploadDocument(workspaceId: string) {
  const queryClient = useQueryClient();

  const uploadFile = async (
    file: File,
    onProgress?: (progress: number) => void,
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', file.name);

    const response = await apiClient.post(
      `/workspaces/${workspaceId}/documents`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) {
            onProgress?.(Math.round((e.loaded / e.total) * 100));
          }
        },
      }
    );

    queryClient.invalidateQueries({ queryKey: ['documents', workspaceId] });
    return response.data;
  };

  return { uploadFile };
}
```

---

## 4. UI/UX

### 4.1 Documents List mockup

```
┌─────────────────────────────────────────────────────────────┐
│  Documents                              [Upload] [+ New]    │
│  42 documents in this workspace                             │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 🔍 Search...    [Tags ▼] [Status ▼]    [Grid] [Table]│   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Title              │ Status    │ Tags      │ Updated │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │ 📄 Product Guide   │ ✓ Verified│ docs,prod │ 2h ago  │   │
│  │ 📄 Support FAQ     │ ✓ Verified│ support   │ 1d ago  │   │
│  │ 📎 Report.pdf      │ ⚠ Unverif.│ reports   │ 3d ago  │   │
│  │ 📄 Customer Email  │ 🔄 Process│ emails    │ 5m ago  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  [← Previous]  Page 1 of 3  [Next →]                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Definition of Done

- [ ] DocumentsPage z filtrowaniem
- [ ] DocumentTable i DocumentGrid
- [ ] FileUploadZone z drag & drop
- [ ] UploadProgress component
- [ ] DocumentForm (create/edit)
- [ ] DocumentDetailPage
- [ ] ChunksList component
- [ ] TagsInput component
- [ ] useDocuments hook
- [ ] useDocument hook
- [ ] useUploadDocument hook
- [ ] Paginacja
- [ ] Unit testy
- [ ] E2E test upload

---

## 6. Estymacja

| Zadanie | Złożoność |
|---------|-----------|
| Documents list page | M |
| File upload zone | M |
| Document form | M |
| Document detail | M |
| Hooks + API | S |
| Testy | M |
| **TOTAL** | **L** |

---

## 7. Następna specyfikacja

Po wdrożeniu: **SPEC-014: Frontend - Markdown Editor**
