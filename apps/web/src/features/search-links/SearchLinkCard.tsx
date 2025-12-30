import { useState } from 'react';
import { SearchLink } from './types';
import { config } from '@/shared/config';

interface SearchLinkCardProps {
  link: SearchLink;
  onRevoke: () => void;
}

export function SearchLinkCard({ link, onRevoke }: SearchLinkCardProps) {
  const [copied, setCopied] = useState<'link' | 'prompt' | null>(null);

  const apiUrl = `${config.apiUrl}/public/${link.token}/search`;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const copyToClipboard = async (text: string, type: 'link' | 'prompt') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const linkName = link.name || 'Knowledge Base';

  const examplePrompt = `You have access to "${linkName}" knowledge base via Synjar semantic search API.

To search, use this URL with your query:
${apiUrl}?q=YOUR_QUERY

Replace YOUR_QUERY with URL-encoded search terms. Examples:
- ${apiUrl}?q=refund+policy
- ${apiUrl}?q=how+to+reset+password

The API returns JSON with relevant document chunks and relevance scores. Use this to answer questions about ${linkName}.`;

  const isExpired = link.expiresAt && new Date(link.expiresAt) < new Date();

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-700 rounded-lg">
            <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-white font-medium">
              {link.name || 'Search Link'}
            </h3>
            <p className="text-slate-500 text-sm">
              Created {formatDate(link.createdAt)}
            </p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded text-xs ${
          isExpired
            ? 'bg-red-500/20 text-red-400'
            : 'bg-green-500/20 text-green-400'
        }`}>
          {isExpired ? 'Expired' : 'Active'}
        </span>
      </div>

      {/* Scope info */}
      <div className="mb-4 text-sm">
        <span className="text-slate-400">Scope: </span>
        {link.allowedTags.length > 0 ? (
          <span className="text-white">
            Tags: {link.allowedTags.map((tag, i) => (
              <span key={tag}>
                <span className="px-2 py-0.5 bg-slate-700 rounded text-slate-300 mx-1">
                  {tag}
                </span>
                {i < link.allowedTags.length - 1 && ', '}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-white">All documents</span>
        )}
        {link.expiresAt && (
          <span className="text-slate-400 ml-4">
            Expires: {formatDate(link.expiresAt)}
          </span>
        )}
      </div>

      {/* URL display */}
      <div className="bg-slate-900 rounded-lg p-3 mb-4 flex items-center gap-4">
        <div className="flex-1 overflow-x-auto">
          <code className="text-slate-300 text-sm whitespace-nowrap">
            {apiUrl}
          </code>
        </div>
        <button
          onClick={() => copyToClipboard(apiUrl, 'link')}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm text-white transition-colors flex items-center gap-2 cursor-pointer shrink-0"
        >
          {copied === 'link' ? (
            <>
              <svg className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
              Copy Link
            </>
          )}
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => copyToClipboard(examplePrompt, 'prompt')}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm text-white transition-colors cursor-pointer"
        >
          {copied === 'prompt' ? 'Copied!' : 'Copy Prompt'}
        </button>
        <button
          onClick={onRevoke}
          className="px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded text-sm transition-colors cursor-pointer"
        >
          Revoke
        </button>
      </div>
    </div>
  );
}
