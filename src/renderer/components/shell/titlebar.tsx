import { cn } from '@/renderer/lib/utils';

export interface TitlebarProps {
  /** False in a plain browser preview, where there is no desktop shell behind the window. */
  readonly desktop: boolean;
  /** The operating system: on macOS the window's own buttons sit on the left and need room. */
  readonly platform?: string;
  /** The running app version, shown low-key next to the name (e.g. "0.1.0-alpha.1"). */
  readonly version?: string;
  /** What sits on the right, before the window's own buttons. */
  readonly children?: React.ReactNode;
}

/**
 * The bar across the top of the window. The window is drawn without its own frame, so this is
 * the frame: it stays where it is while the page under it scrolls (ADR 0016), the window can be
 * dragged by it, and the actions on its right keep working as buttons rather than drag handles.
 *
 * It draws no line under itself. The window's own buttons are drawn by the system over the whole
 * height of the bar, so a line in its last row would be hidden behind them. The line belongs to the
 * part that scrolls, which starts where the bar ends.
 */
export function Titlebar({
  children,
  desktop,
  platform,
  version,
}: TitlebarProps): React.JSX.Element {
  return (
    <header className="window-titlebar bg-titlebar shrink-0">
      <div
        className={cn(
          'window-titlebar-content flex items-center gap-3 pr-4',
          platform === 'darwin' ? 'pl-20' : 'pl-4',
        )}
      >
        <span aria-hidden="true" className="bg-accent size-2 rounded-full" />
        <span className="text-sm font-semibold tracking-tight">Mangabound</span>
        <span className="text-muted-foreground text-xs">{desktop ? 'Desktop' : 'Foundation'}</span>
        {version !== undefined && (
          <span className="text-subtle-foreground text-xs">v{version}</span>
        )}
        <span className="flex-1" />
        {children !== undefined && <div className="window-titlebar-actions">{children}</div>}
      </div>
    </header>
  );
}
