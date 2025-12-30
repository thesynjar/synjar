import { useState } from 'react';

interface SetSettingsPanelProps {
  name: string;
  description: string;
  isPublic: boolean;
  publicUrl: string | null;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  onPublicChange: (isPublic: boolean) => void;
  disabled?: boolean;
}

export function SetSettingsPanel({
  name,
  description,
  isPublic,
  publicUrl,
  onNameChange,
  onDescriptionChange,
  onPublicChange,
  disabled = false,
}: SetSettingsPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyUrl = async () => {
    if (publicUrl) {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
      <h3 className="text-lg font-medium text-white mb-4">Settings</h3>

      <div className="space-y-4">
        {/* Name */}
        <div>
          <label htmlFor="set-name" className="block text-sm font-medium text-slate-400 mb-2">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            id="set-name"
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            disabled={disabled}
            maxLength={200}
            required
            className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-60"
            placeholder="e.g., Brand Voice Guidelines"
          />
          <p className="mt-1 text-xs text-slate-500">{name.length}/200 characters</p>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="set-description" className="block text-sm font-medium text-slate-400 mb-2">
            Description
          </label>
          <textarea
            id="set-description"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            disabled={disabled}
            maxLength={500}
            rows={3}
            className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-60 resize-none"
            placeholder="Describe the purpose of this instruction set..."
          />
          <p className="mt-1 text-xs text-slate-500">{description.length}/500 characters</p>
        </div>

        {/* Public toggle */}
        <div className="pt-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => onPublicChange(e.target.checked)}
              disabled={disabled}
              className="w-5 h-5 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 focus:ring-offset-slate-800"
            />
            <div>
              <span className="text-white font-medium">Anyone with link can access</span>
              <p className="text-slate-500 text-sm">
                Make this instruction set publicly accessible via a shareable link
              </p>
            </div>
          </label>
        </div>

        {/* Public URL display */}
        {isPublic && publicUrl && (
          <div className="mt-4 p-3 bg-slate-900 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-slate-500">Public URL</p>
              <button
                onClick={handleCopyUrl}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                aria-live="polite"
              >
                {copied ? (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                      />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
            <code className="text-sm text-blue-400 break-all">{publicUrl}</code>
          </div>
        )}
      </div>
    </div>
  );
}
