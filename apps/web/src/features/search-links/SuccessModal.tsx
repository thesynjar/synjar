import { useState } from 'react';
import { SearchLink } from './types';
import { config } from '@/shared/config';

interface SuccessModalProps {
  link: SearchLink;
  workspaceName: string;
  onClose: () => void;
}

export function SuccessModal({ link, workspaceName, onClose }: SuccessModalProps) {
  const [copied, setCopied] = useState<'link' | 'prompt' | 'api' | null>(null);

  const baseUrl = `${config.apiUrl}/public/${link.token}/search`;

  const copyToClipboard = async (text: string, type: 'link' | 'prompt' | 'api') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const linkName = link.name || workspaceName;

  const chatPrompt = `You have access to "${linkName}" knowledge base via Synjar semantic search API.

To search, use this URL with your query:
${baseUrl}?q=YOUR_QUERY

Replace YOUR_QUERY with URL-encoded search terms. Examples:
- ${baseUrl}?q=refund+policy
- ${baseUrl}?q=how+to+reset+password

The API returns JSON with relevant document chunks and relevance scores. Use this to answer questions about ${linkName}.`;

  const apiExample = `GET ${baseUrl}?q=refund+policy

Response:
{
  "results": [
    {
      "title": "Refund Policy",
      "content": "Full refund within 30 days...",
      "score": 0.95
    }
  ],
  "totalCount": 3
}`;

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

        {/* Link display */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Your search API endpoint:
          </label>
          <div className="bg-slate-900 rounded-lg p-4 flex items-center gap-4">
            <div className="flex-1 overflow-x-auto">
              <code className="text-blue-400 text-sm whitespace-nowrap">
                {baseUrl}
              </code>
            </div>
            <button
              onClick={() => copyToClipboard(baseUrl, 'link')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm transition-colors shrink-0 cursor-pointer"
            >
              {copied === 'link' ? 'Copied!' : 'Copy URL'}
            </button>
          </div>
        </div>

        <div className="border-t border-slate-700 pt-6 mb-6">
          <h3 className="text-lg font-medium text-white mb-4">How to use:</h3>

          {/* ChatGPT/Claude usage */}
          <div className="bg-slate-900 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium">1</span>
              <h4 className="text-white font-medium">ChatGPT / Claude with browsing</h4>
            </div>
            <p className="text-slate-400 text-sm mb-3">
              Paste this prompt to give AI access to your knowledge base:
            </p>
            <div className="bg-slate-800 rounded p-3 mb-3 overflow-x-auto">
              <pre className="text-slate-300 text-sm whitespace-pre font-mono">
                {chatPrompt}
              </pre>
            </div>
            <button
              onClick={() => copyToClipboard(chatPrompt, 'prompt')}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm text-white transition-colors cursor-pointer"
            >
              {copied === 'prompt' ? 'Copied!' : 'Copy Prompt'}
            </button>
          </div>

          {/* API usage */}
          <div className="bg-slate-900 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium">2</span>
              <h4 className="text-white font-medium">API integration (for developers)</h4>
            </div>
            <p className="text-slate-400 text-sm mb-3">
              Query the search API from your backend:
            </p>
            <div className="bg-slate-800 rounded p-3 mb-3 overflow-x-auto">
              <pre className="text-slate-300 text-sm whitespace-pre font-mono">
                {apiExample}
              </pre>
            </div>
            <button
              onClick={() => copyToClipboard(baseUrl, 'api')}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm text-white transition-colors cursor-pointer"
            >
              {copied === 'api' ? 'Copied!' : 'Copy API URL'}
            </button>
          </div>
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
