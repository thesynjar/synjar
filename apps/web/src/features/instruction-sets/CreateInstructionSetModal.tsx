import { useState } from 'react';
import { INSTRUCTION_SET_LIMITS } from '@synjar/shared';
import { Document } from './types';

interface CreateInstructionSetModalProps {
  documents: Document[];
  onClose: () => void;
  onCreate: (data: { name: string; description?: string; documentIds?: string[] }) => Promise<void>;
}

const { MAX_DOCUMENTS } = INSTRUCTION_SET_LIMITS;

export function CreateInstructionSetModal({ documents, onClose, onCreate }: CreateInstructionSetModalProps) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verifiedDocs = documents.filter(d => d.verificationStatus === 'VERIFIED');

  const handleDocumentToggle = (docId: string) => {
    setSelectedDocIds(prev =>
      prev.includes(docId)
        ? prev.filter(id => id !== docId)
        : prev.length < MAX_DOCUMENTS
          ? [...prev, docId]
          : prev
    );
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        documentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create instruction set';
      setError(errorMessage);
      setIsSubmitting(false);
    }
  };

  const handleNext = () => {
    if (step === 1 && !name.trim()) {
      setError('Name is required');
      return;
    }
    setError(null);
    setStep(step + 1);
  };

  const handleBack = () => {
    setError(null);
    setStep(step - 1);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">New Instruction Set</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-4">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  s === step
                    ? 'bg-blue-600 text-white'
                    : s < step
                      ? 'bg-green-600 text-white'
                      : 'bg-slate-700 text-slate-400'
                }`}>
                  {s < step ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : s}
                </div>
                {s < 3 && (
                  <div className={`w-12 h-0.5 ${s < step ? 'bg-green-600' : 'bg-slate-700'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-auto">
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-white">Basic Information</h3>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Brand Voice Guidelines"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="What is this instruction set for?"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-white">Select Documents</h3>
                <span className="text-sm text-slate-400">
                  {selectedDocIds.length} / {MAX_DOCUMENTS} selected
                </span>
              </div>
              <p className="text-sm text-slate-400">
                Choose documents to include in this instruction set. Only verified documents can be added.
              </p>

              {verifiedDocs.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <p>No verified documents available.</p>
                  <p className="text-sm mt-1">Verify some documents first, or skip this step.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-auto">
                  {verifiedDocs.map((doc) => (
                    <label
                      key={doc.id}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedDocIds.includes(doc.id)
                          ? 'bg-blue-600/20 border border-blue-500/50'
                          : 'bg-slate-700/50 border border-transparent hover:bg-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDocIds.includes(doc.id)}
                        onChange={() => handleDocumentToggle(doc.id)}
                        className="h-4 w-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 bg-slate-800"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium truncate">{doc.title}</p>
                        <p className="text-sm text-slate-400">
                          {doc.contentType === 'FILE' ? 'File' : 'Text'}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-white">Review & Create</h3>

              <div className="bg-slate-700/50 rounded-lg p-4 space-y-3">
                <div>
                  <span className="text-slate-400 text-sm">Name</span>
                  <p className="text-white">{name}</p>
                </div>
                {description && (
                  <div>
                    <span className="text-slate-400 text-sm">Description</span>
                    <p className="text-white">{description}</p>
                  </div>
                )}
                <div>
                  <span className="text-slate-400 text-sm">Documents</span>
                  <p className="text-white">
                    {selectedDocIds.length > 0
                      ? `${selectedDocIds.length} documents selected`
                      : 'No documents selected (you can add them later)'}
                  </p>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <p className="text-blue-400 text-sm">
                  The instruction set will be created as <strong>private</strong>. You can make it public later to share with your team.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 flex justify-between">
          <button
            type="button"
            onClick={step === 1 ? onClose : handleBack}
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          {step < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Instruction Set'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
