import { useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ProcessingStatus, VerificationStatus } from '../types';

type FilterOption<T extends string> = { label: string; value: T | null };

const VERIFICATION_OPTIONS: FilterOption<VerificationStatus>[] = [
  { label: 'All', value: null },
  { label: 'Verified', value: 'VERIFIED' },
  { label: 'Unverified', value: 'UNVERIFIED' },
];

const PROCESSING_OPTIONS: FilterOption<ProcessingStatus>[] = [
  { label: 'All', value: null },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Indexing', value: 'PROCESSING' },
  { label: 'Indexed', value: 'COMPLETED' },
  { label: 'Failed', value: 'FAILED' },
];

export interface DocumentFiltersProps {
  totalCount: number;
  verificationStatus: VerificationStatus | null;
  processingStatus: ProcessingStatus | null;
  onUploadClick: () => void;
  onNewTextClick: () => void;
}

export function DocumentFilters({
  totalCount,
  verificationStatus,
  processingStatus,
  onUploadClick,
  onNewTextClick,
}: DocumentFiltersProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  const updateFilter = (key: string, value: string | null) => {
    const nextParams = new URLSearchParams(searchParams);

    if (value) {
      nextParams.set(key, value);
    } else {
      nextParams.delete(key);
    }

    nextParams.set('page', '1');
    setSearchParams(nextParams);
  };

  const verificationValue = useMemo(
    () => VERIFICATION_OPTIONS.find(option => option.value === verificationStatus) ?? VERIFICATION_OPTIONS[0],
    [verificationStatus]
  );

  const processingValue = useMemo(
    () => PROCESSING_OPTIONS.find(option => option.value === processingStatus) ?? PROCESSING_OPTIONS[0],
    [processingStatus]
  );

  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Documents ({totalCount})</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onNewTextClick}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
          >
            New Text
          </button>
          <button
            type="button"
            onClick={onUploadClick}
            className="px-4 py-2 border border-slate-600 text-slate-200 rounded-lg hover:border-slate-500 transition-colors"
          >
            Upload
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <SegmentedControl
          label="Verification"
          value={verificationValue.value}
          options={VERIFICATION_OPTIONS}
          onChange={(value) => updateFilter('verificationStatus', value)}
        />
        <div className="flex flex-col gap-2">
          <div className="hidden sm:block">
            <SegmentedControl
              label="Processing"
              value={processingValue.value}
              options={PROCESSING_OPTIONS}
              onChange={(value) => updateFilter('processingStatus', value)}
            />
          </div>
          <div className="sm:hidden">
            <label className="block text-sm text-slate-400 mb-1" htmlFor="processing-filter">
              Processing
            </label>
            <select
              id="processing-filter"
              value={processingValue.value ?? 'ALL'}
              onChange={(event) => updateFilter('processingStatus', event.target.value === 'ALL' ? null : event.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200"
              aria-label="Filter documents by processing status"
            >
              {PROCESSING_OPTIONS.map(option => (
                <option key={option.label} value={option.value ?? 'ALL'}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T | null;
  options: FilterOption<T>[];
  onChange: (value: T | null) => void;
}

function SegmentedControl<T extends string>({ label, value, options, onChange }: SegmentedControlProps<T>) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(
    options.findIndex((option) => option.value === value),
    0
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (selectedIndex + direction + options.length) % options.length;
    const nextValue = options[nextIndex].value;

    onChange(nextValue);
    buttonRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <span className="text-sm text-slate-400">{label}:</span>
      <div
        role="radiogroup"
        aria-label={`${label} filter`}
        className="flex flex-wrap gap-2"
        onKeyDown={handleKeyDown}
      >
        {options.map((option, index) => {
          const isSelected = option.value === value || (option.value === null && value === null);

          return (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onChange(option.value)}
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                isSelected
                  ? 'bg-slate-700 border-slate-500 text-white'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
