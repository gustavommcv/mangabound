import { CircleAlert } from 'lucide-react';

import { Titlebar } from '@/renderer/components/shell/titlebar';
import { WorkflowApp } from '@/renderer/workflow-app';

/** Only the desktop entry reads the preload object; the workflow receives its interface. */
export function App(): React.JSX.Element {
  const bridge = window.mangabound;
  if (bridge !== undefined) return <WorkflowApp bridge={bridge} />;

  return (
    <div className="bg-background text-foreground flex h-screen flex-col">
      <Titlebar />
      <div className="border-border min-h-0 flex-1 overflow-y-auto border-t">
        <main className="mx-auto max-w-6xl px-8 py-10">
          <section
            aria-label="Startup error"
            className="border-status-failed/50 bg-status-failed/10 flex items-start gap-3 rounded-lg border p-4"
            role="alert"
          >
            <CircleAlert aria-hidden="true" className="text-status-failed mt-0.5 size-5 shrink-0" />
            <div>
              <h1 className="text-sm font-semibold">Mangabound could not start correctly.</h1>
              <p className="text-muted-foreground mt-1 text-sm leading-6">
                Restart the app. If the problem persists, reinstall Mangabound.
              </p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
