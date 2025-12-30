import { useState, useEffect, useRef, useCallback } from 'react';
import { TagPill } from './TagPill';

interface TagSuggestion {
  id: string;
  name: string;
  documentCount: number;
}

interface TagInputProps {
  workspaceId: string;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  disabled?: boolean;
  maxTags?: number;
  apiClient: {
    get: (url: string) => { json: <T>() => Promise<T> };
  };
}

const MAX_TAGS_DEFAULT = 10;

export function TagInput({
  workspaceId,
  selectedTags,
  onTagsChange,
  disabled = false,
  maxTags = MAX_TAGS_DEFAULT,
  apiClient,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Fetch autocomplete suggestions
  const fetchSuggestions = useCallback(async (query: string) => {
    setIsLoading(true);
    try {
      const tags = await apiClient
        .get(`workspaces/${workspaceId}/tags/autocomplete?q=${encodeURIComponent(query)}`)
        .json<TagSuggestion[]>();

      // Filter out already selected tags
      const filtered = tags.filter(tag => !selectedTags.includes(tag.name));
      setSuggestions(filtered);
    } catch (error) {
      console.error('Failed to fetch tag suggestions:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, workspaceId, selectedTags]);

  // Debounced fetch on input change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (showSuggestions) {
        fetchSuggestions(inputValue);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [inputValue, showSuggestions, fetchSuggestions]);

  // Reset highlight when suggestions change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [suggestions]);

  const normalizeTagName = (name: string): string => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const handleAddTag = (tagName: string) => {
    const normalized = normalizeTagName(tagName);

    if (!normalized || normalized.length < 2) {
      return;
    }

    if (selectedTags.includes(normalized)) {
      setInputValue('');
      setShowSuggestions(false);
      return;
    }

    if (selectedTags.length >= maxTags) {
      return;
    }

    onTagsChange([...selectedTags, normalized]);
    setInputValue('');
    setShowSuggestions(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const handleRemoveTag = (tagName: string) => {
    onTagsChange(selectedTags.filter(t => t !== tagName));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        handleAddTag(suggestions[highlightedIndex].name);
      } else if (inputValue.trim()) {
        handleAddTag(inputValue);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setHighlightedIndex(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev =>
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Backspace' && !inputValue && selectedTags.length > 0) {
      handleRemoveTag(selectedTags[selectedTags.length - 1]);
    }
  };

  const handleFocus = () => {
    setShowSuggestions(true);
    fetchSuggestions(inputValue);
  };

  const handleBlur = () => {
    // Delay to allow click on suggestion
    setTimeout(() => {
      setShowSuggestions(false);
      setHighlightedIndex(-1);
    }, 200);
  };

  const normalizedInput = normalizeTagName(inputValue);
  const canCreateNew = normalizedInput.length >= 2 &&
    !selectedTags.includes(normalizedInput) &&
    !suggestions.some(s => s.name === normalizedInput) &&
    selectedTags.length < maxTags;

  return (
    <div className="space-y-2">
      {/* Label */}
      <label className="block text-sm font-medium text-slate-400">
        Tags
      </label>

      {/* Selected tags */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedTags.map(tag => (
            <TagPill
              key={tag}
              name={tag}
              onRemove={disabled ? undefined : () => handleRemoveTag(tag)}
            />
          ))}
        </div>
      )}

      {/* Input with autocomplete */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={disabled || selectedTags.length >= maxTags}
          placeholder={
            selectedTags.length >= maxTags
              ? `Maximum ${maxTags} tags reached`
              : 'Add tag...'
          }
          className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-60"
          aria-label="Add tag"
          aria-describedby="tag-help"
          aria-expanded={showSuggestions}
          aria-controls="tag-suggestions"
          role="combobox"
          aria-autocomplete="list"
        />

        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" />
          </div>
        )}

        {/* Autocomplete suggestions */}
        {showSuggestions && !disabled && (suggestions.length > 0 || canCreateNew) && (
          <div
            ref={suggestionsRef}
            id="tag-suggestions"
            className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg max-h-60 overflow-auto"
            role="listbox"
          >
            {suggestions.map((tag, index) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => handleAddTag(tag.name)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`w-full px-4 py-2 text-left transition-colors ${
                  index === highlightedIndex
                    ? 'bg-slate-700'
                    : 'hover:bg-slate-700'
                }`}
                role="option"
                aria-selected={index === highlightedIndex}
              >
                <span className="text-white">{tag.name}</span>
                <span className="text-slate-400 text-sm ml-2">
                  ({tag.documentCount} {tag.documentCount === 1 ? 'doc' : 'docs'})
                </span>
              </button>
            ))}

            {/* Create new tag option */}
            {canCreateNew && (
              <button
                type="button"
                onClick={() => handleAddTag(inputValue)}
                onMouseEnter={() => setHighlightedIndex(suggestions.length)}
                className={`w-full px-4 py-2 text-left transition-colors border-t border-slate-700 ${
                  highlightedIndex === suggestions.length
                    ? 'bg-slate-700'
                    : 'hover:bg-slate-700'
                }`}
                role="option"
                aria-selected={highlightedIndex === suggestions.length}
              >
                <span className="text-slate-400">Create </span>
                <span className="text-white">"{normalizedInput}"</span>
              </button>
            )}
          </div>
        )}

        {/* No matching tags */}
        {showSuggestions && !disabled && inputValue && suggestions.length === 0 && !canCreateNew && !isLoading && (
          <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg p-3 text-slate-400 text-sm">
            {normalizedInput.length < 2
              ? 'Tag must be at least 2 characters'
              : selectedTags.includes(normalizedInput)
                ? 'Tag already added'
                : 'No matching tags'
            }
          </div>
        )}
      </div>

      {/* Help text */}
      {!disabled && (
        <p id="tag-help" className="text-xs text-slate-500">
          Type to search or create tags. {selectedTags.length}/{maxTags} tags used.
        </p>
      )}
    </div>
  );
}
