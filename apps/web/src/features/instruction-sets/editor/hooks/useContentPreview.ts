import { useState, useCallback } from 'react';
import { InstructionSetDocument } from '../../types';
import { AvailableDocument } from './useInstructionSetEditor';

interface PreviewContent {
  id: string;
  name: string;
  description: string | null;
  content: string;
  totalSizeBytes: number;
  tokenEstimate: number;
}

interface UseContentPreviewParams {
  setId: string | undefined;
  formName: string;
  formDescription: string;
  selectedDocuments: InstructionSetDocument[];
  availableDocuments: AvailableDocument[];
}

interface UseContentPreviewResult {
  previewContent: PreviewContent | null;
  isLoadingPreview: boolean;
  previewError: string | null;
  generatePreview: () => void;
  clearPreview: () => void;
}

/**
 * Calculate total size in bytes for documents
 */
function calculateSize(documents: Array<{ content: string }>): number {
  return documents.reduce(
    (sum, doc) => sum + new TextEncoder().encode(doc.content).length,
    0
  );
}

/**
 * Client-side content preview generation.
 * Generates preview instantly from EditorState without API call.
 * Works for both public and private instruction sets.
 */
export function useContentPreview({
  setId,
  formName,
  formDescription,
  selectedDocuments,
  availableDocuments,
}: UseContentPreviewParams): UseContentPreviewResult {
  const [previewContent, setPreviewContent] = useState<PreviewContent | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Generate preview client-side from current editor state
  const generatePreview = useCallback(() => {
    if (!setId) {
      setPreviewError('No instruction set selected');
      return;
    }

    if (!selectedDocuments.length) {
      setPreviewError('No documents selected. Add documents to generate preview.');
      return;
    }

    // Build content map from available documents
    const contentMap = new Map<string, { title: string; content: string }>();
    for (const doc of availableDocuments) {
      contentMap.set(doc.id, { title: doc.title, content: doc.content });
    }

    // Get documents with content, sorted by order
    const documentsWithContent = selectedDocuments
      .sort((a, b) => a.order - b.order)
      .map((doc) => {
        const available = contentMap.get(doc.documentId);
        return {
          title: doc.title,
          content: available?.content || '',
        };
      });

    // Check if we have content for all selected documents
    const missingContent = documentsWithContent.filter((doc) => !doc.content);
    if (missingContent.length > 0) {
      setPreviewError(
        `Cannot preview: content not available for ${missingContent.length} document(s). ` +
          'Try refreshing the page.'
      );
      return;
    }

    // Generate markdown content (same format as backend)
    const content = documentsWithContent
      .map((doc) => `# ${doc.title}\n\n${doc.content}`)
      .join('\n\n---\n\n');

    const totalSizeBytes = calculateSize(documentsWithContent);

    setPreviewContent({
      id: setId,
      name: formName,
      description: formDescription || null,
      content,
      totalSizeBytes,
      tokenEstimate: Math.round(totalSizeBytes / 4), // Approximate token estimate
    });
    setPreviewError(null);
  }, [setId, formName, formDescription, selectedDocuments, availableDocuments]);

  const clearPreview = useCallback(() => {
    setPreviewContent(null);
    setPreviewError(null);
  }, []);

  return {
    previewContent,
    isLoadingPreview: false, // Always instant since client-side
    previewError,
    generatePreview,
    clearPreview,
  };
}
