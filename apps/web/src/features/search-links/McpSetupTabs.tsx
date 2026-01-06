import { useState } from 'react';

interface McpSetupTabsProps {
  mcpUrl: string;
  apiUrl: string;
}

export function McpSetupTabs({ mcpUrl, apiUrl }: McpSetupTabsProps) {
  const [activeTab, setActiveTab] = useState<'chatgpt' | 'claude' | 'prompt' | 'api'>('chatgpt');
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const directPrompt = `I have access to a knowledge base search API. When I need to search it, I'll provide you with a search link.

Important rules:
1. You CANNOT open URLs you generate yourself due to security restrictions
2. When you need to search my knowledge base, ask me to paste the search link
3. I will provide the exact link for you to read
4. The link format is: ${apiUrl}?q=[query]

When you need to search:
1. Tell me what query you want to search for
2. Ask me to paste the link with that query
3. I'll provide the link
4. You can then read the results

Let me know when you're ready to help me search my knowledge base!`;

  const apiExample = `GET ${apiUrl}?q=refund+policy

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
    <div>
      {/* Tabs Navigation */}
      <div className="mb-4">
        <div className="flex border-b border-slate-700">
          <button
            onClick={() => setActiveTab('chatgpt')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'chatgpt'
                ? 'text-white border-b-2 border-blue-500'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            ChatGPT
          </button>
          <button
            onClick={() => setActiveTab('claude')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'claude'
                ? 'text-white border-b-2 border-blue-500'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Claude
          </button>
          <button
            onClick={() => setActiveTab('prompt')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'prompt'
                ? 'text-white border-b-2 border-blue-500'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Direct Prompt
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'api'
                ? 'text-white border-b-2 border-blue-500'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            API Integration
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'chatgpt' && (
        <div className="bg-slate-900 rounded-lg p-4">
          <h4 className="text-white font-medium mb-3">ChatGPT Setup (Developer Mode)</h4>

          <div className="mb-4 bg-blue-500/10 border border-blue-500/20 rounded p-3">
            <p className="text-blue-400 text-sm">
              <strong>What is MCP?</strong> Model Context Protocol allows ChatGPT to search your
              knowledge base directly without manual link pasting. Just ask questions!
            </p>
          </div>

          <ol className="list-decimal list-inside text-slate-300 text-sm space-y-2 mb-4">
            <li>Open ChatGPT → Settings → Developer Mode</li>
            <li>Click "Add Custom Connector"</li>
            <li>
              Paste this URL:
              <div className="bg-slate-800 rounded p-2 mt-1 mb-2">
                <code className="text-blue-400 text-sm break-all">{mcpUrl}</code>
              </div>
            </li>
            <li>Save → ChatGPT will verify connection</li>
            <li>Done! Use: <strong>"Use Synjar to search for X"</strong></li>
          </ol>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded p-3 mb-4">
            <p className="text-blue-400 text-sm mb-2">
              <strong>Example prompts that work:</strong>
            </p>
            <ul className="text-blue-300 text-xs space-y-1 ml-2">
              <li>• "Use the Synjar tool to search for refund policy"</li>
              <li>• "Search my Synjar knowledge base for API docs"</li>
              <li>• "Użyj Synjar do wyszukania informacji o gwarancji" (PL)</li>
            </ul>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-3">
            <p className="text-yellow-400 text-sm">
              <strong>Important:</strong> Only use official Synjar MCP URL.
              Verify URL starts with <code>https://api.synjar.com/mcp/</code>
            </p>
          </div>
        </div>
      )}

      {activeTab === 'claude' && (
        <div className="bg-slate-900 rounded-lg p-4">
          <h4 className="text-white font-medium mb-3">Claude Setup (Custom Connectors)</h4>

          <div className="mb-4 bg-blue-500/10 border border-blue-500/20 rounded p-3">
            <p className="text-blue-400 text-sm">
              <strong>What is MCP?</strong> Model Context Protocol allows Claude to search your
              knowledge base directly without manual link pasting. Just ask questions!
            </p>
          </div>

          <ol className="list-decimal list-inside text-slate-300 text-sm space-y-2 mb-4">
            <li>Open Claude → Settings → Custom Connectors</li>
            <li>Click "Add New"</li>
            <li>
              Paste this URL:
              <div className="bg-slate-800 rounded p-2 mt-1 mb-2">
                <code className="text-blue-400 text-sm break-all">{mcpUrl}</code>
              </div>
            </li>
            <li>Save → Claude will verify connection</li>
            <li>Done! Use: <strong>"Use Synjar to search for X"</strong></li>
          </ol>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded p-3 mb-4">
            <p className="text-blue-400 text-sm mb-2">
              <strong>Example prompts that work:</strong>
            </p>
            <ul className="text-blue-300 text-xs space-y-1 ml-2">
              <li>• "Use the Synjar tool to search for pricing"</li>
              <li>• "Search my Synjar knowledge base for setup guide"</li>
              <li>• "Przeszukaj moją bazę Synjar" (PL)</li>
            </ul>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-3">
            <p className="text-yellow-400 text-sm">
              <strong>Important:</strong> Only use official Synjar MCP URL.
              Verify URL starts with <code>https://api.synjar.com/mcp/</code>
            </p>
          </div>
        </div>
      )}

      {activeTab === 'prompt' && (
        <div className="bg-slate-900 rounded-lg p-4">
          <h4 className="text-white font-medium mb-3">Direct Prompt (No Setup Required)</h4>

          <div className="mb-4 bg-slate-700/50 border border-slate-600 rounded p-3">
            <p className="text-slate-300 text-sm">
              <strong>Alternative method:</strong> If you don't have access to MCP (Developer Mode/Custom Connectors),
              use this prompt-based workaround. You'll need to manually paste search links when asked.
            </p>
          </div>

          <div className="flex items-center justify-between mb-2">
            <p className="text-slate-400 text-sm">
              Copy and paste this prompt into ChatGPT or Claude:
            </p>
            <button
              onClick={() => copyToClipboard(directPrompt, 'prompt')}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm transition-colors"
            >
              {copied === 'prompt' ? 'Copied!' : 'Copy Prompt'}
            </button>
          </div>

          <div className="mb-4">
            <textarea
              readOnly
              value={directPrompt}
              className="w-full bg-slate-800 text-slate-300 text-sm font-mono p-4 rounded border border-slate-700 focus:outline-none focus:border-blue-500 overflow-x-auto resize-none"
              rows={12}
              style={{ whiteSpace: 'pre' }}
            />
          </div>

          <div className="mb-4 bg-blue-500/10 border border-blue-500/20 rounded p-3">
            <p className="text-blue-400 text-sm">
              <strong>How it works:</strong>
            </p>
            <ol className="list-decimal list-inside text-blue-400 text-sm mt-2 space-y-2 ml-2">
              <li>Click "Copy Prompt" and paste into your AI chat</li>
              <li>Ask your question (e.g., "What's our refund policy?")</li>
              <li>AI asks you for the search link</li>
              <li>
                <span className="block mb-1">You paste the search link:</span>
                <div className="flex items-start gap-2 mt-1">
                  <code className="flex-1 text-blue-300 text-xs break-all bg-slate-800 px-2 py-1 rounded">
                    {apiUrl}?q=refund+policy
                  </code>
                  <button
                    onClick={() => copyToClipboard(`${apiUrl}?q=refund+policy`, 'example-link')}
                    className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white transition-colors shrink-0"
                  >
                    {copied === 'example-link' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </li>
              <li>AI reads results and answers your question</li>
            </ol>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-3">
            <p className="text-yellow-400 text-sm">
              <strong>Note:</strong> This method requires manual link pasting for each search.
              For automatic searching, use the MCP setup (ChatGPT or Claude tabs above).
            </p>
          </div>
        </div>
      )}

      {activeTab === 'api' && (
        <div className="bg-slate-900 rounded-lg p-4">
          <h4 className="text-white font-medium mb-3">API Integration (for developers)</h4>
          <p className="text-slate-400 text-sm mb-3">
            Query the search API from your backend:
          </p>
          <div className="bg-slate-800 rounded p-3 mb-3 overflow-x-auto">
            <pre className="text-slate-300 text-sm whitespace-pre font-mono">
              {apiExample}
            </pre>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded p-3">
            <p className="text-blue-400 text-sm">
              <strong>Learn more:</strong>
            </p>
            <ul className="list-disc list-inside text-blue-400 text-sm mt-2 space-y-1 ml-2">
              <li>
                <a
                  href="/docs/api-reference/search-links"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-300 hover:text-blue-200 underline"
                >
                  Search Links API Reference
                </a>
                {' '}- Direct search endpoint documentation
              </li>
              <li>
                <a
                  href="/docs/api-reference/mcp-tools"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-300 hover:text-blue-200 underline"
                >
                  MCP Tools API Reference
                </a>
                {' '}- JSON-RPC protocol and examples
              </li>
              <li>
                <a
                  href="/docs/cloud/search/search-links"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-300 hover:text-blue-200 underline"
                >
                  User Guide
                </a>
                {' '}- Complete documentation
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
