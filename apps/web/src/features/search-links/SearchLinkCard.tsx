import { useState } from 'react';
import { SearchLink } from './types';
import { config } from '@/shared/config';
import { McpSetupTabs } from './McpSetupTabs';

interface SearchLinkCardProps {
  link: SearchLink;
  onRevoke: () => void;
}

export function SearchLinkCard({ link, onRevoke }: SearchLinkCardProps) {
  const [copied, setCopied] = useState<'link' | 'mcp' | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  const apiUrl = `${config.apiUrl}/public/${link.token}/search`;
  const mcpUrl = `${config.apiUrl}/mcp/${link.token}`;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const copyToClipboard = async (text: string, type: 'link' | 'mcp') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

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

      {/* MCP URL display */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-400 mb-2">
          MCP Server URL (ChatGPT / Claude)
        </label>
        <div className="bg-slate-900 rounded-lg p-3 flex items-center gap-4">
          <div className="flex-1 overflow-x-auto">
            <code className="text-slate-300 text-sm whitespace-nowrap">
              {mcpUrl}
            </code>
          </div>
          <button
            onClick={() => copyToClipboard(mcpUrl, 'mcp')}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm text-white transition-colors flex items-center gap-2 cursor-pointer shrink-0"
          >
            {copied === 'mcp' ? 'Copied!' : 'Copy MCP URL'}
          </button>
        </div>
      </div>

      {/* Direct API URL display */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-400 mb-2">
          Direct Search API
        </label>
        <div className="bg-slate-900 rounded-lg p-3 flex items-center gap-4">
          <div className="flex-1 overflow-x-auto">
            <code className="text-slate-300 text-sm whitespace-nowrap">
              {apiUrl}
            </code>
          </div>
          <button
            onClick={() => copyToClipboard(apiUrl, 'link')}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm text-white transition-colors flex items-center gap-2 cursor-pointer shrink-0"
          >
            {copied === 'link' ? 'Copied!' : 'Copy URL'}
          </button>
        </div>
      </div>

      {/* View Setup Instructions */}
      <button
        onClick={() => setShowInstructions(!showInstructions)}
        className="text-blue-400 hover:text-blue-300 text-sm transition-colors mb-4"
      >
        {showInstructions ? 'Hide' : 'View'} Setup Instructions →
      </button>

      {/* Collapsible instructions */}
      {showInstructions && (
        <div className="mb-4 border-t border-slate-700 pt-4">
          <McpSetupTabs mcpUrl={mcpUrl} apiUrl={apiUrl} />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
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
