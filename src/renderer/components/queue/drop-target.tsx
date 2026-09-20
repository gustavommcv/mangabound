import { FilePlus2, FolderPlus, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/renderer/components/ui/dropdown-menu';
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
 * works at all. Clicking opens a menu of the two choices, files or a folder, because a native
 * dialog on Windows and Linux cannot pick both in one go.
 *
 * While the queue is empty the whole area answers the pointer: it lights up under it and clicking
 * anywhere in it opens the menu. Once there are items only the line under them does.
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
  const [menuOpen, setMenuOpen] = useState(false);
  // Whether the menu was open when the pointer went down, which is before it closes itself for
  // a press elsewhere. A press on the area while the menu is open must close it, not close and
  // then open it again from the click that follows.
  const openWhenPressed = useRef(false);
  const over = depth > 0;
  const wholeArea = empty && !disabled;

  return (
    <div
      className={cn(
        'group rounded-xl border border-dashed transition-colors',
        over ? 'border-accent bg-accent/10' : 'border-border',
        empty ? 'flex min-h-72 flex-col items-center justify-center p-8' : 'p-2',
        wholeArea && !over && 'hover:border-muted-foreground/50 hover:bg-muted/30',
        wholeArea && 'cursor-pointer',
      )}
      data-testid="drop-target"
      onPointerDownCapture={() => {
        openWhenPressed.current = menuOpen;
      }}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        // Anywhere in an empty area opens the menu. Two clicks are not that: one on the hint, which
        // is the menu's own button and opens it by itself, and one on the menu, which is drawn
        // elsewhere in the page but whose events still reach this area through React and would
        // otherwise open the menu again the moment a choice closed it.
        if (
          wholeArea &&
          !openWhenPressed.current &&
          event.currentTarget.contains(target) &&
          !target.closest('button')
        ) {
          setMenuOpen(true);
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
    >
      {children}
      {/* Not modal: two choices do not need the rest of the window put out of reach. */}
      <DropdownMenu modal={false} onOpenChange={setMenuOpen} open={menuOpen && !disabled}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'text-subtle-foreground focus-visible:ring-ring flex cursor-pointer items-center justify-center gap-2 rounded-md text-sm outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50',
              // The area under the pointer is what lights up, so the words follow it.
              empty
                ? 'group-hover:text-foreground text-center'
                : 'hover:text-foreground mt-2 w-full p-3',
            )}
            disabled={disabled}
            type="button"
          >
            <Upload aria-hidden="true" className="size-4 shrink-0" />
            {over
              ? 'Release to add them'
              : empty
                ? 'Drop manga folders, libraries or .cbz files here, or click to choose.'
                : 'Drop files or folders here, or click to choose.'}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuItem onSelect={onAddFiles}>
            <FilePlus2 /> Choose files
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onAddFolders}>
            <FolderPlus /> Choose a folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
