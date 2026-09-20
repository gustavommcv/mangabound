import { FilePlus2, FolderPlus, Upload } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { Button } from '@/renderer/components/ui/button';
import { cn } from '@/renderer/lib/utils';

export interface DropTargetProps {
  readonly children?: React.ReactNode;
  readonly disabled: boolean;
  /** True when the queue holds nothing: the area is then the whole invitation to add something. */
  readonly empty: boolean;
  readonly onAddFiles: () => void;
  readonly onAddFolders: () => void;
  readonly onDropFiles: (files: readonly File[]) => void;
}

/**
 * The area files and folders can be dropped on, and clicked to choose them instead. Anywhere on the
 * window would do to receive a drop, but a visible target is what tells the user that dropping
 * works at all. Clicking asks what to add, files or a folder, because a native dialog on Windows and
 * Linux cannot pick both in one go.
 */
export function DropTarget({
  children,
  disabled,
  empty,
  onAddFiles,
  onAddFolders,
  onDropFiles,
}: DropTargetProps): React.JSX.Element {
  // A counter, not a flag: dragging across the target's children fires enter and leave repeatedly.
  const [depth, setDepth] = useState(0);
  const [choosing, setChoosing] = useState(false);
  const hint = useRef<HTMLButtonElement>(null);
  const chooserId = useId();
  const over = depth > 0;

  const choose = (add: () => void): void => {
    setChoosing(false);
    add();
  };

  return (
    <div
      className={cn(
        'rounded-xl border border-dashed transition-colors',
        over ? 'border-accent bg-accent/10' : 'border-border',
        empty ? 'flex min-h-72 cursor-pointer flex-col items-center justify-center p-8' : 'p-2',
      )}
      data-testid="drop-target"
      onClick={(event) => {
        // Anywhere in an empty area asks what to add. A button keeps its own meaning, and the hint
        // button below is the way in for the keyboard.
        if (empty && !disabled && !(event.target as HTMLElement).closest('button')) {
          setChoosing((current) => !current);
        }
      }}
      onDragEnter={(event) => {
        if (disabled || !event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDepth((current) => current + 1);
      }}
      onDragLeave={() => {
        setDepth((current) => Math.max(0, current - 1));
      }}
      onDragOver={(event) => {
        if (disabled || !event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDepth(0);
        const files = Array.from(event.dataTransfer.files);
        if (!disabled && files.length > 0) onDropFiles(files);
      }}
      onKeyDown={(event) => {
        if (choosing && event.key === 'Escape') {
          setChoosing(false);
          hint.current?.focus();
        }
      }}
    >
      {children}
      <button
        aria-controls={choosing ? chooserId : undefined}
        aria-expanded={choosing}
        className={cn(
          'text-subtle-foreground hover:text-foreground focus-visible:ring-ring flex items-center justify-center gap-2 rounded-md text-sm outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50',
          empty ? 'text-center' : 'mt-2 w-full p-3',
        )}
        disabled={disabled}
        onClick={() => {
          setChoosing((current) => !current);
        }}
        ref={hint}
        type="button"
      >
        <Upload aria-hidden="true" className="size-4 shrink-0" />
        {over
          ? 'Release to add them'
          : empty
            ? 'Drop manga folders, libraries or .cbz files here, or click to choose.'
            : 'Drop files or folders here, or click to choose.'}
      </button>
      {choosing && !disabled && (
        <div
          aria-label="What to add"
          className="mt-3 flex justify-center gap-2"
          id={chooserId}
          role="group"
        >
          <Button
            onClick={() => {
              choose(onAddFiles);
            }}
            size="sm"
            variant="outline"
          >
            <FilePlus2 /> Choose files
          </Button>
          <Button
            onClick={() => {
              choose(onAddFolders);
            }}
            size="sm"
            variant="outline"
          >
            <FolderPlus /> Choose a folder
          </Button>
        </div>
      )}
    </div>
  );
}
