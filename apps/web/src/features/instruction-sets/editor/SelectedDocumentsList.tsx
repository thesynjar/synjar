import { useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  Announcements,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DocumentPurpose } from '@/shared/types/document.types';

interface SelectedDocument {
  id: string;
  documentId: string;
  title: string;
  sizeBytes: number;
  order: number;
  purpose?: DocumentPurpose;
}

interface SelectedDocumentsListProps {
  documents: SelectedDocument[];
  onRemove: (documentId: string) => void;
  onReorder: (documentIds: string[]) => void;
}

interface SortableDocumentItemProps {
  document: SelectedDocument;
  position: number;
  total: number;
  onRemove: () => void;
}

function SortableDocumentItem({ document, position, total, onRemove }: SortableDocumentItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: document.documentId,
    data: { title: document.title },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center p-3 bg-slate-900 rounded-lg border ${
        isDragging ? 'border-blue-500 shadow-lg shadow-blue-500/20' : 'border-slate-700'
      }`}
      role="option"
      aria-selected="true"
      aria-label={`${document.title}, position ${position} of ${total}, ${formatSize(document.sizeBytes)}`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="mr-3 p-1 text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing touch-none"
        aria-label={`Drag to reorder ${document.title}`}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 8h16M4 16h16"
          />
        </svg>
      </button>

      {/* Position number */}
      <span className="w-6 h-6 flex items-center justify-center bg-slate-700 rounded text-sm text-slate-300 mr-3">
        {position}
      </span>

      {/* Document info */}
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium truncate">{document.title}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-slate-500 text-sm">{formatSize(document.sizeBytes)}</span>
          {document.purpose && (
            <span
              className={`px-1.5 py-0.5 rounded text-xs ${
                document.purpose === 'INSTRUCTION'
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'bg-blue-500/20 text-blue-400'
              }`}
            >
              {document.purpose}
            </span>
          )}
        </div>
      </div>

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="ml-3 p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
        aria-label={`Remove ${document.title} from set`}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function SelectedDocumentsList({ documents, onRemove, onReorder }: SelectedDocumentsListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Prevent accidental drags
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const sortedDocuments = useMemo(
    () => [...documents].sort((a, b) => a.order - b.order),
    [documents]
  );

  const documentIds = useMemo(
    () => sortedDocuments.map((d) => d.documentId),
    [sortedDocuments]
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = documentIds.indexOf(active.id as string);
      const newIndex = documentIds.indexOf(over.id as string);
      const newOrder = arrayMove(documentIds, oldIndex, newIndex);
      onReorder(newOrder);
    }
  };

  // Accessibility announcements for screen readers
  const announcements: Announcements = {
    onDragStart({ active }) {
      const title = active.data.current?.title || active.id;
      return `Picked up draggable item ${title}. Use the arrow keys to move, space to drop, escape to cancel.`;
    },
    onDragOver({ active, over }) {
      const title = active.data.current?.title || active.id;
      if (over) {
        const overIndex = documentIds.indexOf(over.id as string) + 1;
        return `Draggable item ${title} was moved to position ${overIndex} of ${documents.length}.`;
      }
      return `Draggable item ${title} is no longer over a droppable area.`;
    },
    onDragEnd({ active, over }) {
      const title = active.data.current?.title || active.id;
      if (over) {
        const overIndex = documentIds.indexOf(over.id as string) + 1;
        return `Draggable item ${title} was dropped at position ${overIndex} of ${documents.length}.`;
      }
      return `Draggable item ${title} was dropped.`;
    },
    onDragCancel({ active }) {
      const title = active.data.current?.title || active.id;
      return `Drag was cancelled. Draggable item ${title} was dropped.`;
    },
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 h-full flex flex-col">
      <h3 className="text-lg font-medium text-white mb-4">
        Selected Documents ({documents.length})
      </h3>

      <p id="reorder-instructions" className="sr-only">
        Use arrow keys to reorder documents. Press Delete to remove.
      </p>

      {documents.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
          <svg
            className="h-12 w-12 text-slate-600 mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-slate-400 mb-2">No documents selected</p>
          <p className="text-slate-500 text-sm">
            Add documents from the left panel by clicking the + button or drag them here.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable:
                'To pick up a draggable item, press the space bar. While dragging, use the arrow keys to move the item. Press space again to drop the item in its new position, or press escape to cancel.',
            },
          }}
        >
          <SortableContext items={documentIds} strategy={verticalListSortingStrategy}>
            <div
              className="flex-1 overflow-y-auto space-y-2"
              role="listbox"
              aria-label="Selected documents in order"
              aria-describedby="reorder-instructions"
            >
              {sortedDocuments.map((doc, index) => (
                <SortableDocumentItem
                  key={doc.documentId}
                  document={doc}
                  position={index + 1}
                  total={documents.length}
                  onRemove={() => onRemove(doc.documentId)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
