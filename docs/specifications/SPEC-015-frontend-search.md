# SPEC-015: Frontend - Search

**Data:** 2025-12-24
**Status:** Draft
**Priorytet:** P1 (Core feature)
**Zależności:** SPEC-013 (Frontend Documents)

---

## 1. Cel biznesowy

Wyszukiwanie semantyczne w bazie wiedzy - główna funkcjonalność RAG dla użytkowników.

### Wartość MVP

- Wyszukiwanie semantyczne po treści dokumentów
- Filtrowanie po tagach
- Wyświetlanie wyników z relevance score
- Podgląd kontekstu (chunk content)

---

## 2. Wymagania funkcjonalne

### 2.1 Funkcjonalności

1. **Search input**
   - Pole tekstowe na zapytanie
   - Debounce (300ms)
   - Clear button
   - Search history (ostatnie 5)

2. **Filtry**
   - Tagi (multi-select)
   - Status weryfikacji
   - Include unverified toggle

3. **Wyniki**
   - Lista wyników z score
   - Tytuł dokumentu
   - Fragment tekstu (highlighted)
   - Tagi
   - Link do dokumentu

4. **Empty states**
   - Brak wyników
   - Brak zapytania (placeholder)

---

## 3. Implementacja

### 3.1 Struktura plików

```
apps/web/src/features/search/
├── pages/
│   └── SearchPage.tsx
├── components/
│   ├── SearchInput.tsx
│   ├── SearchFilters.tsx
│   ├── SearchResults.tsx
│   ├── SearchResultCard.tsx
│   └── SearchEmptyState.tsx
├── hooks/
│   └── useSearch.ts
└── api/
    └── search.api.ts
```

### 3.2 Search Page

```typescript
// src/features/search/pages/SearchPage.tsx

export function SearchPage() {
  const { workspaceId } = useParams();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({
    tags: [],
    includeUnverified: false,
  });

  const debouncedQuery = useDebounce(query, 300);

  const {
    results,
    isLoading,
    isError,
  } = useSearch(workspaceId!, debouncedQuery, filters);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Search</h1>
        <p className="text-gray-600">
          Find information in your knowledge base
        </p>
      </div>

      {/* Search Input */}
      <SearchInput
        value={query}
        onChange={setQuery}
        isLoading={isLoading}
      />

      {/* Filters */}
      <SearchFilters
        filters={filters}
        onChange={setFilters}
        workspaceId={workspaceId!}
      />

      {/* Results */}
      {!debouncedQuery ? (
        <SearchEmptyState type="no-query" />
      ) : isLoading ? (
        <SearchResultsSkeleton />
      ) : isError ? (
        <Alert variant="error">
          Failed to search. Please try again.
        </Alert>
      ) : results.length === 0 ? (
        <SearchEmptyState type="no-results" query={query} />
      ) : (
        <SearchResults results={results} query={debouncedQuery} />
      )}
    </div>
  );
}
```

### 3.3 Search Input

```typescript
// src/features/search/components/SearchInput.tsx

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  isLoading?: boolean;
}

export function SearchInput({ value, onChange, isLoading }: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keyboard shortcut: Ctrl+K to focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="relative">
      <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />

      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ask a question or search for information..."
        className={cn(
          'w-full pl-12 pr-12 py-4 text-lg',
          'border-2 rounded-xl',
          'focus:outline-none focus:border-primary-500',
          'placeholder:text-gray-400'
        )}
      />

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute right-14 top-1/2 -translate-y-1/2">
          <Spinner className="w-5 h-5" />
        </div>
      )}

      {/* Clear button */}
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
        >
          <XIcon className="w-5 h-5 text-gray-400" />
        </button>
      )}

      {/* Keyboard hint */}
      <div className="absolute right-4 top-full mt-1 text-xs text-gray-400">
        Press <kbd className="px-1 py-0.5 bg-gray-100 rounded">Ctrl+K</kbd> to focus
      </div>
    </div>
  );
}
```

### 3.4 Search Filters

```typescript
// src/features/search/components/SearchFilters.tsx

interface SearchFiltersProps {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
  workspaceId: string;
}

export function SearchFilters({
  filters,
  onChange,
  workspaceId,
}: SearchFiltersProps) {
  const { tags } = useWorkspaceTags(workspaceId);

  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* Tags filter */}
      <div className="flex items-center gap-2">
        <TagIcon className="w-4 h-4 text-gray-500" />
        <MultiSelect
          options={tags.map(t => ({ value: t, label: t }))}
          value={filters.tags}
          onChange={(tags) => onChange({ ...filters, tags })}
          placeholder="Filter by tags..."
          className="min-w-48"
        />
      </div>

      {/* Include unverified toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <Switch
          checked={filters.includeUnverified}
          onChange={(checked) =>
            onChange({ ...filters, includeUnverified: checked })
          }
        />
        <span className="text-sm text-gray-600">
          Include unverified sources
        </span>
      </label>

      {/* Clear filters */}
      {(filters.tags.length > 0 || filters.includeUnverified) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ tags: [], includeUnverified: false })}
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}
```

### 3.5 Search Results

```typescript
// src/features/search/components/SearchResults.tsx

interface SearchResultsProps {
  results: SearchResult[];
  query: string;
}

export function SearchResults({ results, query }: SearchResultsProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Found {results.length} result{results.length !== 1 ? 's' : ''}
      </p>

      <div className="space-y-3">
        {results.map((result) => (
          <SearchResultCard
            key={result.chunkId}
            result={result}
            query={query}
          />
        ))}
      </div>
    </div>
  );
}
```

### 3.6 Search Result Card

```typescript
// src/features/search/components/SearchResultCard.tsx

interface SearchResultCardProps {
  result: SearchResult;
  query: string;
}

export function SearchResultCard({ result, query }: SearchResultCardProps) {
  const { workspaceId } = useParams();

  // Highlight matching text
  const highlightedContent = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/);
    let content = result.content;

    words.forEach((word) => {
      if (word.length < 3) return;
      const regex = new RegExp(`(${escapeRegex(word)})`, 'gi');
      content = content.replace(regex, '<mark>$1</mark>');
    });

    return content;
  }, [result.content, query]);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Link
              to={`/workspaces/${workspaceId}/documents/${result.documentId}`}
              className="font-medium text-lg hover:text-primary-600"
            >
              {result.title}
            </Link>
            <VerificationBadge status={result.verificationStatus} size="sm" />
          </div>

          {/* Relevance score */}
          <div className="flex items-center gap-1 text-sm">
            <span className="text-gray-500">Relevance:</span>
            <RelevanceScore score={result.score} />
          </div>
        </div>

        {/* Content excerpt */}
        <p
          className="text-gray-600 text-sm line-clamp-3 mb-3"
          dangerouslySetInnerHTML={{ __html: highlightedContent }}
        />

        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {result.tags.map((tag) => (
            <TagBadge key={tag} tag={tag} size="sm" />
          ))}
        </div>

        {/* File indicator */}
        {result.fileUrl && (
          <div className="mt-2 flex items-center gap-1 text-sm text-gray-500">
            <FileIcon className="w-4 h-4" />
            <span>From uploaded file</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RelevanceScore({ score }: { score: number }) {
  const percentage = Math.round(score * 100);
  const color =
    percentage >= 80 ? 'text-green-600' :
    percentage >= 60 ? 'text-amber-600' :
    'text-gray-600';

  return (
    <span className={cn('font-medium', color)}>
      {percentage}%
    </span>
  );
}
```

### 3.7 Empty States

```typescript
// src/features/search/components/SearchEmptyState.tsx

interface SearchEmptyStateProps {
  type: 'no-query' | 'no-results';
  query?: string;
}

export function SearchEmptyState({ type, query }: SearchEmptyStateProps) {
  if (type === 'no-query') {
    return (
      <div className="text-center py-12">
        <SearchIcon className="w-16 h-16 mx-auto text-gray-300 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Start searching
        </h3>
        <p className="text-gray-500 max-w-md mx-auto">
          Enter a question or keywords to search your knowledge base.
          Try asking something like "How do I handle refunds?"
        </p>

        {/* Search suggestions */}
        <div className="mt-6">
          <p className="text-sm text-gray-500 mb-2">Try searching for:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {['procedures', 'policies', 'FAQ', 'how to'].map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                size="sm"
                onClick={() => {/* set query */}}
              >
                {suggestion}
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center py-12">
      <SearchXIcon className="w-16 h-16 mx-auto text-gray-300 mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        No results found
      </h3>
      <p className="text-gray-500 max-w-md mx-auto">
        No documents match "{query}".
        Try different keywords or check your filters.
      </p>

      <div className="mt-6 space-x-2">
        <Button variant="outline" onClick={() => {/* clear filters */}}>
          Clear filters
        </Button>
        <Button asChild>
          <Link to="../documents/new">
            Create a document
          </Link>
        </Button>
      </div>
    </div>
  );
}
```

### 3.8 useSearch Hook

```typescript
// src/features/search/hooks/useSearch.ts

interface SearchFilters {
  tags: string[];
  includeUnverified: boolean;
}

export function useSearch(
  workspaceId: string,
  query: string,
  filters: SearchFilters,
) {
  return useQuery({
    queryKey: ['search', workspaceId, query, filters],
    queryFn: async () => {
      if (!query.trim()) return [];

      const response = await apiClient.post(
        `/workspaces/${workspaceId}/search`,
        {
          query,
          tags: filters.tags.length > 0 ? filters.tags : undefined,
          includeUnverified: filters.includeUnverified,
          limit: 20,
        }
      );

      return response.data.results as SearchResult[];
    },
    enabled: query.trim().length > 0,
    staleTime: 30 * 1000, // 30 seconds
  });
}
```

---

## 4. UI/UX

### 4.1 Search Page mockup

```
┌─────────────────────────────────────────────────────────────┐
│  Search                                                     │
│  Find information in your knowledge base                    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🔍  How do I handle customer refunds?           ✕  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                          Press Ctrl+K       │
│                                                             │
│  🏷️ [support] [policies]        ☑ Include unverified       │
│                                                             │
│  Found 3 results                                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Refund Policy ✓                     Relevance: 92% │    │
│  │                                                     │    │
│  │ Customers can request a **refund** within 14 days  │    │
│  │ of purchase. To process the **refund**, follow...  │    │
│  │                                                     │    │
│  │ [support] [policies]                               │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Customer Service Guide ✓               Relevance: 78%│   │
│  │ ...                                                 │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Testy

```typescript
describe('SearchPage', () => {
  it('shows placeholder when no query', () => {
    render(<SearchPage />);

    expect(screen.getByText(/start searching/i)).toBeInTheDocument();
  });

  it('shows loading state while searching', async () => {
    mockSearch.mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<SearchPage />);
    await userEvent.type(screen.getByRole('textbox'), 'test query');

    await waitFor(() => {
      expect(screen.getByTestId('spinner')).toBeInTheDocument();
    });
  });

  it('displays search results', async () => {
    mockSearch.mockResolvedValue({
      results: [
        {
          documentId: '1',
          title: 'Test Doc',
          content: 'Test content',
          score: 0.85,
          verificationStatus: 'VERIFIED',
          tags: ['test'],
        },
      ],
    });

    render(<SearchPage />);
    await userEvent.type(screen.getByRole('textbox'), 'test');

    await waitFor(() => {
      expect(screen.getByText('Test Doc')).toBeInTheDocument();
      expect(screen.getByText('85%')).toBeInTheDocument();
    });
  });

  it('highlights matching text', async () => {
    mockSearch.mockResolvedValue({
      results: [
        { content: 'This is a test document', ... },
      ],
    });

    render(<SearchPage />);
    await userEvent.type(screen.getByRole('textbox'), 'test');

    await waitFor(() => {
      const mark = document.querySelector('mark');
      expect(mark).toHaveTextContent('test');
    });
  });
});
```

---

## 6. Definition of Done

- [ ] SearchPage
- [ ] SearchInput z debounce
- [ ] SearchFilters (tags, verification)
- [ ] SearchResults list
- [ ] SearchResultCard z highlighting
- [ ] Empty states (no query, no results)
- [ ] useSearch hook
- [ ] Keyboard shortcut (Ctrl+K)
- [ ] Unit testy
- [ ] E2E test search flow

---

## 7. Estymacja

| Zadanie | Złożoność |
|---------|-----------|
| SearchPage | M |
| SearchInput | S |
| SearchFilters | S |
| SearchResults | M |
| Highlighting | S |
| Testy | M |
| **TOTAL** | **M** |

---

## 8. Następna specyfikacja

Po wdrożeniu: **SPEC-016: Frontend - Public Links**
