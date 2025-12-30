import { useState } from 'react';
import { DocumentPurpose } from '@/shared/types/document.types';

const VALID_PURPOSES: readonly DocumentPurpose[] = ['KNOWLEDGE', 'INSTRUCTION'];

function isValidPurpose(value: string): value is DocumentPurpose {
  return VALID_PURPOSES.includes(value as DocumentPurpose);
}

interface DocumentPurposeSelectorProps {
  value: DocumentPurpose;
  onChange: (purpose: DocumentPurpose) => void;
  disabled?: boolean;
}

export function DocumentPurposeSelector({
  value,
  onChange,
  disabled = false,
}: DocumentPurposeSelectorProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const handleChange = (newPurpose: string) => {
    if (!isValidPurpose(newPurpose)) {
      console.warn('Invalid purpose value:', newPurpose);
      return; // Prevent API call
    }
    onChange(newPurpose);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <label className="block text-sm font-medium text-slate-400">Document Purpose</label>
        <div className="relative">
          <button
            type="button"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onFocus={() => setShowTooltip(true)}
            onBlur={() => setShowTooltip(false)}
            onClick={() => setShowTooltip(!showTooltip)}
            className="w-4 h-4 rounded-full bg-slate-700 text-slate-400 text-xs flex items-center justify-center hover:bg-slate-600 hover:text-white transition-colors"
            aria-label="Document purpose information"
            aria-describedby="purpose-tooltip"
          >
            ?
          </button>
          {showTooltip && (
            <div
              id="purpose-tooltip"
              role="tooltip"
              className="absolute left-0 sm:left-6 top-full sm:top-0 z-50 w-56 sm:w-72 mt-2 sm:mt-0 p-3 bg-slate-700 rounded-lg shadow-lg text-sm"
            >
              <div className="space-y-2">
                <div>
                  <span className="font-medium text-white">Knowledge</span>
                  <p className="text-slate-300 text-xs mt-0.5">
                    Indexed for semantic search (Search Links) and available in Instruction Sets.
                  </p>
                </div>
                <div>
                  <span className="font-medium text-white">Instruction</span>
                  <p className="text-slate-300 text-xs mt-0.5">
                    Only for Instruction Sets - full context for AI without semantic indexing.
                  </p>
                </div>
              </div>
              {/* Arrow: points up on mobile (tooltip below), points left on desktop (tooltip to the right) */}
              <div className="absolute left-2 sm:left-0 -top-1 sm:top-1.5 sm:-translate-x-1 w-2 h-2 bg-slate-700 rotate-45" />
            </div>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-2">How this document will be used</p>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="purpose"
            checked={value === 'KNOWLEDGE'}
            onChange={() => handleChange('KNOWLEDGE')}
            disabled={disabled}
            className="text-blue-500"
          />
          <span className="text-slate-300">Knowledge</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="purpose"
            checked={value === 'INSTRUCTION'}
            onChange={() => handleChange('INSTRUCTION')}
            disabled={disabled}
            className="text-blue-500"
          />
          <span className="text-slate-300">Instruction</span>
        </label>
      </div>
    </div>
  );
}
