import { useState } from 'react';
import { SearchLink } from './types';
import { config } from '@/shared/config';
import { McpSetupTabs } from './McpSetupTabs';

interface SuccessModalProps {
  link: SearchLink;
  workspaceName: string;
  onClose: () => void;
}

export function SuccessModal({ link, workspaceName: _workspaceName, onClose }: SuccessModalProps) {
  const [copied, setCopied] = useState<'link' | 'mcp' | null>(null);

  const baseUrl = `${config.apiUrl}/public/${link.token}/search`;
  const mcpUrl = `${config.apiUrl}/mcp/${link.token}`;

  const copyToClipboard = async (text: string, type: 'link' | 'mcp') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white">Search Link Created</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* MCP URL display */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            MCP Server URL (for ChatGPT / Claude):
          </label>
          <div className="bg-slate-900 rounded-lg p-4 flex items-center gap-4">
            <div className="flex-1 overflow-x-auto">
              <code className="text-blue-400 text-sm whitespace-nowrap">
                {mcpUrl}
              </code>
            </div>
            <button
              onClick={() => copyToClipboard(mcpUrl, 'mcp')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm transition-colors shrink-0 cursor-pointer"
            >
              {copied === 'mcp' ? 'Copied!' : 'Copy MCP URL'}
            </button>
          </div>
        </div>

        {/* Direct API URL display */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Direct Search API endpoint:
          </label>
          <div className="bg-slate-900 rounded-lg p-4 flex items-center gap-4">
            <div className="flex-1 overflow-x-auto">
              <code className="text-slate-400 text-sm whitespace-nowrap">
                {baseUrl}
              </code>
            </div>
            <button
              onClick={() => copyToClipboard(baseUrl, 'link')}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white text-sm transition-colors shrink-0 cursor-pointer"
            >
              {copied === 'link' ? 'Copied!' : 'Copy URL'}
            </button>
          </div>
        </div>

        <div className="border-t border-slate-700 pt-6 mb-6">
          <h3 className="text-lg font-medium text-white mb-4">Setup Instructions:</h3>

          <McpSetupTabs mcpUrl={mcpUrl} apiUrl={baseUrl} />
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
