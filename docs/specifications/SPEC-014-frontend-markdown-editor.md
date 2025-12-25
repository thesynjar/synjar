# SPEC-014: Frontend - Markdown Editor

**Data:** 2025-12-24
**Status:** Draft
**Priorytet:** P1 (Enhanced UX)
**Zależności:** SPEC-013 (Frontend Documents)

---

## 1. Cel biznesowy

Wbudowany edytor markdown do tworzenia i edycji dokumentów tekstowych z podglądem na żywo.

### Wartość MVP

- Pisanie w markdown z syntax highlighting
- Podgląd renderowanego markdown
- Split view (edytor + podgląd)
- Podstawowy toolbar

---

## 2. Wymagania funkcjonalne

### 2.1 Funkcjonalności edytora

1. **Syntax highlighting**
   - Headers, bold, italic
   - Code blocks z language detection
   - Links, images
   - Lists (ordered, unordered)
   - Blockquotes

2. **Toolbar**
   - Bold, Italic, Strikethrough
   - Headers (H1-H3)
   - Lists (bullet, numbered)
   - Link, Image
   - Code (inline, block)
   - Quote
   - Undo/Redo

3. **View modes**
   - Edit only
   - Preview only
   - Split view (default)

4. **Keyboard shortcuts**
   - Ctrl+B: Bold
   - Ctrl+I: Italic
   - Ctrl+K: Link
   - Ctrl+Shift+C: Code block
   - Tab: Indent list

---

## 3. Stack technologiczny

| Biblioteka | Użycie |
|------------|--------|
| CodeMirror 6 | Editor engine |
| @codemirror/lang-markdown | Markdown support |
| react-markdown | Preview rendering |
| remark-gfm | GitHub Flavored Markdown |
| rehype-highlight | Code syntax highlighting |

---

## 4. Implementacja

### 4.1 Struktura plików

```
apps/web/src/shared/components/markdown/
├── MarkdownEditor.tsx
├── MarkdownPreview.tsx
├── EditorToolbar.tsx
├── useMarkdownEditor.ts
└── markdown.css
```

### 4.2 MarkdownEditor Component

```typescript
// src/shared/components/markdown/MarkdownEditor.tsx

import { useCallback, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorToolbar } from './EditorToolbar';
import { MarkdownPreview } from './MarkdownPreview';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
  disabled?: boolean;
}

type ViewMode = 'edit' | 'preview' | 'split';

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  minHeight = 300,
  disabled = false,
}: MarkdownEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [editorView, setEditorView] = useState<EditorView | null>(null);

  const editorRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;

      const state = EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          markdown(),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChange(update.state.doc.toString());
            }
          }),
          EditorView.theme({
            '&': { minHeight: `${minHeight}px` },
            '.cm-scroller': { minHeight: `${minHeight}px` },
            '.cm-content': { minHeight: `${minHeight - 20}px` },
          }),
          EditorState.readOnly.of(disabled),
        ],
      });

      const view = new EditorView({ state, parent: node });
      setEditorView(view);

      return () => view.destroy();
    },
    [minHeight, disabled]
  );

  // Sync external value changes
  useEffect(() => {
    if (editorView && value !== editorView.state.doc.toString()) {
      editorView.dispatch({
        changes: {
          from: 0,
          to: editorView.state.doc.length,
          insert: value,
        },
      });
    }
  }, [value, editorView]);

  const insertText = useCallback(
    (before: string, after: string = '') => {
      if (!editorView) return;

      const { from, to } = editorView.state.selection.main;
      const selectedText = editorView.state.sliceDoc(from, to);

      editorView.dispatch({
        changes: { from, to, insert: `${before}${selectedText}${after}` },
        selection: { anchor: from + before.length + selectedText.length },
      });
      editorView.focus();
    },
    [editorView]
  );

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Toolbar */}
      <EditorToolbar
        onAction={insertText}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        disabled={disabled}
      />

      {/* Editor/Preview area */}
      <div
        className={cn(
          'flex',
          viewMode === 'split' && 'divide-x'
        )}
      >
        {/* Editor */}
        {viewMode !== 'preview' && (
          <div
            className={cn(
              'flex-1 overflow-auto',
              viewMode === 'split' && 'w-1/2'
            )}
          >
            <div ref={editorRef} className="h-full" />
          </div>
        )}

        {/* Preview */}
        {viewMode !== 'edit' && (
          <div
            className={cn(
              'flex-1 overflow-auto p-4 bg-gray-50',
              viewMode === 'split' && 'w-1/2'
            )}
            style={{ minHeight }}
          >
            <MarkdownPreview content={value} />
          </div>
        )}
      </div>
    </div>
  );
}
```

### 4.3 Editor Toolbar

```typescript
// src/shared/components/markdown/EditorToolbar.tsx

interface EditorToolbarProps {
  onAction: (before: string, after?: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  disabled?: boolean;
}

const toolbarActions = [
  { icon: BoldIcon, label: 'Bold', before: '**', after: '**', shortcut: 'Ctrl+B' },
  { icon: ItalicIcon, label: 'Italic', before: '_', after: '_', shortcut: 'Ctrl+I' },
  { icon: StrikethroughIcon, label: 'Strikethrough', before: '~~', after: '~~' },
  { type: 'separator' },
  { icon: Heading1Icon, label: 'Heading 1', before: '# ', after: '' },
  { icon: Heading2Icon, label: 'Heading 2', before: '## ', after: '' },
  { icon: Heading3Icon, label: 'Heading 3', before: '### ', after: '' },
  { type: 'separator' },
  { icon: ListIcon, label: 'Bullet List', before: '- ', after: '' },
  { icon: ListOrderedIcon, label: 'Numbered List', before: '1. ', after: '' },
  { icon: CheckSquareIcon, label: 'Task List', before: '- [ ] ', after: '' },
  { type: 'separator' },
  { icon: LinkIcon, label: 'Link', before: '[', after: '](url)', shortcut: 'Ctrl+K' },
  { icon: ImageIcon, label: 'Image', before: '![alt](', after: ')' },
  { icon: CodeIcon, label: 'Inline Code', before: '`', after: '`' },
  { icon: TerminalIcon, label: 'Code Block', before: '```\n', after: '\n```' },
  { icon: QuoteIcon, label: 'Quote', before: '> ', after: '' },
];

export function EditorToolbar({
  onAction,
  viewMode,
  onViewModeChange,
  disabled,
}: EditorToolbarProps) {
  return (
    <div className="flex items-center justify-between px-2 py-1 border-b bg-gray-50">
      {/* Formatting buttons */}
      <div className="flex items-center gap-0.5">
        {toolbarActions.map((action, index) =>
          action.type === 'separator' ? (
            <div key={index} className="w-px h-6 bg-gray-300 mx-1" />
          ) : (
            <Tooltip key={index} content={`${action.label} ${action.shortcut || ''}`}>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onAction(action.before!, action.after)}
                disabled={disabled}
              >
                <action.icon className="w-4 h-4" />
              </Button>
            </Tooltip>
          )
        )}
      </div>

      {/* View mode toggle */}
      <div className="flex items-center gap-1 bg-gray-200 rounded-md p-0.5">
        <Button
          variant={viewMode === 'edit' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onViewModeChange('edit')}
        >
          <EditIcon className="w-4 h-4 mr-1" />
          Edit
        </Button>
        <Button
          variant={viewMode === 'split' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onViewModeChange('split')}
        >
          <ColumnsIcon className="w-4 h-4 mr-1" />
          Split
        </Button>
        <Button
          variant={viewMode === 'preview' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onViewModeChange('preview')}
        >
          <EyeIcon className="w-4 h-4 mr-1" />
          Preview
        </Button>
      </div>
    </div>
  );
}
```

### 4.4 Markdown Preview

```typescript
// src/shared/components/markdown/MarkdownPreview.tsx

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

export function MarkdownPreview({ content, className }: MarkdownPreviewProps) {
  if (!content.trim()) {
    return (
      <p className="text-gray-400 italic">
        Nothing to preview yet...
      </p>
    );
  }

  return (
    <ReactMarkdown
      className={cn('prose prose-sm max-w-none', className)}
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        // Custom link handling (open in new tab)
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:underline"
          >
            {children}
          </a>
        ),
        // Custom code block
        code: ({ inline, className, children }) => {
          if (inline) {
            return (
              <code className="px-1 py-0.5 bg-gray-100 rounded text-sm">
                {children}
              </code>
            );
          }
          return (
            <code className={className}>
              {children}
            </code>
          );
        },
        // Task list checkboxes
        input: ({ type, checked }) => {
          if (type === 'checkbox') {
            return (
              <input
                type="checkbox"
                checked={checked}
                disabled
                className="mr-2"
              />
            );
          }
          return <input type={type} />;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
```

### 4.5 Keyboard Shortcuts Hook

```typescript
// src/shared/components/markdown/useMarkdownEditor.ts

export function useMarkdownShortcuts(
  editorView: EditorView | null,
  insertText: (before: string, after: string) => void,
) {
  useEffect(() => {
    if (!editorView) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'b':
            e.preventDefault();
            insertText('**', '**');
            break;
          case 'i':
            e.preventDefault();
            insertText('_', '_');
            break;
          case 'k':
            e.preventDefault();
            insertText('[', '](url)');
            break;
        }
      }

      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        insertText('```\n', '\n```');
      }
    };

    const dom = editorView.dom;
    dom.addEventListener('keydown', handleKeyDown);
    return () => dom.removeEventListener('keydown', handleKeyDown);
  }, [editorView, insertText]);
}
```

---

## 5. UI/UX

### 5.1 Editor mockup

```
┌─────────────────────────────────────────────────────────────┐
│ [B] [I] [S] │ [H1][H2][H3] │ [•][1.][☐] │ [🔗][📷][<>] [Edit][Split][Preview] │
├──────────────────────────────┬──────────────────────────────┤
│                              │                              │
│  # Product Guide             │  Product Guide               │
│                              │  ═══════════════             │
│  This is the **official**    │  This is the official        │
│  product guide.              │  product guide.              │
│                              │                              │
│  ## Features                 │  Features                    │
│                              │  ────────                    │
│  - Fast search               │  • Fast search               │
│  - Smart chunking            │  • Smart chunking            │
│  - Public API                │  • Public API                │
│                              │                              │
│  ```javascript               │  ┌─────────────────────────┐ │
│  const api = new API();      │  │ const api = new API();  │ │
│  ```                         │  └─────────────────────────┘ │
│                              │                              │
├──────────────────────────────┴──────────────────────────────┤
│  ↩ Undo  ↪ Redo                             Lines: 15 │ Ln 8│
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Testy

```typescript
describe('MarkdownEditor', () => {
  it('renders with initial value', () => {
    render(<MarkdownEditor value="# Hello" onChange={() => {}} />);

    expect(screen.getByText('# Hello')).toBeInTheDocument();
  });

  it('calls onChange on edit', async () => {
    const onChange = vi.fn();
    render(<MarkdownEditor value="" onChange={onChange} />);

    await userEvent.type(screen.getByRole('textbox'), 'test');

    expect(onChange).toHaveBeenCalled();
  });

  it('toggles between view modes', async () => {
    render(<MarkdownEditor value="# Test" onChange={() => {}} />);

    // Default is split
    expect(screen.getByText('# Test')).toBeInTheDocument(); // Editor
    expect(screen.getByRole('heading', { name: 'Test' })).toBeInTheDocument(); // Preview

    // Switch to edit only
    await userEvent.click(screen.getByRole('button', { name: /edit/i }));

    expect(screen.queryByRole('heading', { name: 'Test' })).not.toBeInTheDocument();
  });

  it('inserts bold on toolbar click', async () => {
    const onChange = vi.fn();
    render(<MarkdownEditor value="test" onChange={onChange} />);

    // Select text
    // ... (complex selection simulation)

    await userEvent.click(screen.getByLabelText(/bold/i));

    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('**'));
  });
});

describe('MarkdownPreview', () => {
  it('renders markdown correctly', () => {
    render(<MarkdownPreview content="# Title\n\n**bold** text" />);

    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument();
    expect(screen.getByText('bold')).toHaveClass('font-bold');
  });

  it('renders code blocks with syntax highlighting', () => {
    render(<MarkdownPreview content="```js\nconst x = 1;\n```" />);

    expect(screen.getByText('const')).toBeInTheDocument();
  });
});
```

---

## 7. Definition of Done

- [ ] MarkdownEditor z CodeMirror
- [ ] EditorToolbar z akcjami formatowania
- [ ] MarkdownPreview z react-markdown
- [ ] Keyboard shortcuts
- [ ] View mode toggle (edit/split/preview)
- [ ] Syntax highlighting (editor + preview)
- [ ] GFM support (tables, task lists)
- [ ] Unit testy
- [ ] Accessibility (keyboard navigation)

---

## 8. Estymacja

| Zadanie | Złożoność |
|---------|-----------|
| Editor setup | M |
| Toolbar | S |
| Preview | S |
| Shortcuts | S |
| Testy | M |
| **TOTAL** | **M** |

---

## 9. Następna specyfikacja

Po wdrożeniu: **SPEC-015: Frontend - Search**
