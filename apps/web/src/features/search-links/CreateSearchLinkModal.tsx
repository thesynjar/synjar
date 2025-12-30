import { useState } from 'react';
import { Tag } from './types';

interface CreateSearchLinkModalProps {
  tags: Tag[];
  onClose: () => void;
  onCreate: (data: { name?: string; allowedTags?: string[]; expiresAt?: string; includeUnverified?: boolean }) => Promise<void>;
}

export function CreateSearchLinkModal({ tags, onClose, onCreate }: CreateSearchLinkModalProps) {
  const [name, setName] = useState('');
  const [scopeType, setScopeType] = useState<'verified' | 'all' | 'tags'>('verified');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [expiryType, setExpiryType] = useState<'never' | 'custom'>('never');
  const [expiryDays, setExpiryDays] = useState(30);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const data: { name?: string; allowedTags?: string[]; expiresAt?: string; includeUnverified?: boolean } = {};

      if (name.trim()) {
        data.name = name.trim();
      }

      if (scopeType === 'tags' && selectedTags.length > 0) {
        data.allowedTags = selectedTags;
      }

      if (scopeType === 'all') {
        data.includeUnverified = true;
      }

      if (expiryType === 'custom') {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + expiryDays);
        data.expiresAt = expiryDate.toISOString();
      }

      await onCreate(data);
    } catch {
      setError('Failed to create search link. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleTag = (tagName: string) => {
    setSelectedTags(prev =>
      prev.includes(tagName)
        ? prev.filter(t => t !== tagName)
        : [...prev, tagName]
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Create Search Link</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Name */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Name (for your reference)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Support Knowledge Base"
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Scope */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Search scope
            </label>
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  checked={scopeType === 'verified'}
                  onChange={() => setScopeType('verified')}
                  className="w-4 h-4 text-blue-600 mt-0.5"
                />
                <div>
                  <span className="text-white">Verified documents only</span>
                  <span className="text-green-400 text-xs ml-2">(Recommended)</span>
                  <p className="text-slate-500 text-sm mt-0.5">
                    Only documents marked as verified will be searchable
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  checked={scopeType === 'all'}
                  onChange={() => setScopeType('all')}
                  className="w-4 h-4 text-blue-600 mt-0.5"
                />
                <div>
                  <span className="text-white">All documents</span>
                  <p className="text-slate-500 text-sm mt-0.5">
                    Include unverified documents in search results
                  </p>
                </div>
              </label>

              {scopeType === 'all' && (
                <div className="ml-7 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <svg className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-yellow-400 text-sm">
                      <strong>Warning:</strong> Unverified documents may contain inaccurate or outdated information.
                      AI responses based on these documents could be unreliable.
                    </p>
                  </div>
                </div>
              )}

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  checked={scopeType === 'tags'}
                  onChange={() => setScopeType('tags')}
                  className="w-4 h-4 text-blue-600 mt-0.5"
                />
                <div>
                  <span className="text-white">Only specific tags</span>
                  <p className="text-slate-500 text-sm mt-0.5">
                    Limit search to documents with selected tags (verified only)
                  </p>
                </div>
              </label>

              {scopeType === 'tags' && (
                <div className="ml-7 mt-2">
                  {tags.length === 0 ? (
                    <p className="text-slate-500 text-sm">
                      No tags available. Add tags to documents first.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.name)}
                          className={`px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${
                            selectedTags.includes(tag.name)
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                        >
                          {tag.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Expiration */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Expiration
            </label>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="expiry"
                  checked={expiryType === 'never'}
                  onChange={() => setExpiryType('never')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-white">Never expires</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="expiry"
                  checked={expiryType === 'custom'}
                  onChange={() => setExpiryType('custom')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-white">Expires after</span>
                {expiryType === 'custom' && (
                  <select
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(Number(e.target.value))}
                    className="px-3 py-1 bg-slate-700 border border-slate-600 rounded text-white cursor-pointer"
                  >
                    <option value={7}>7 days</option>
                    <option value={30}>30 days</option>
                    <option value={90}>90 days</option>
                    <option value={365}>1 year</option>
                  </select>
                )}
              </label>
            </div>
          </div>

          {/* Security info */}
          <div className="bg-slate-900 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm">
                <p className="text-blue-400 font-medium mb-1">Public access</p>
                <p className="text-slate-400 mb-2">
                  Anyone with this link can search your documents and read search results.
                </p>
                <p className="text-slate-500">
                  They cannot edit or delete documents, or see full document content (only matched chunks).
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Creating...' : 'Create Link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
