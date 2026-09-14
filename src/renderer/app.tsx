import { useEffect, useState } from 'react';
import { Boxes, CheckCircle2, CircleAlert, Library, LoaderCircle, RadioTower } from 'lucide-react';

import type { ToolchainStatus } from '@/shared/toolchain-status';

const foundations = [
  {
    description: 'Pure rules and use cases stay independent of Electron and React.',
    icon: Boxes,
    title: 'Domain first',
  },
  {
    description: 'Pinned tools will run behind typed, versioned adapter contracts.',
    icon: Library,
    title: 'Verified pipeline',
  },
  {
    description: 'Outputs will be indexed for a newest-first OPDS catalog.',
    icon: RadioTower,
    title: 'Reader delivery',
  },
] as const;

export function App(): React.JSX.Element {
  const runtime = window.mangabound?.runtime;
  const [toolchain, setToolchain] = useState<ToolchainStatus>();

  useEffect(() => {
    const getToolchainStatus = window.mangabound?.getToolchainStatus;
    if (getToolchainStatus === undefined) return;
    let current = true;
    void getToolchainStatus()
      .then((status) => {
        if (current) setToolchain(status);
      })
      .catch(() => {
        if (current) {
          setToolchain({
            state: 'blocked',
            tools: [],
            message: 'The bundled conversion tools could not be checked.',
          });
        }
      });
    return () => {
      current = false;
    };
  }, []);

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="window-titlebar border-border bg-titlebar border-b">
        <div className="window-titlebar-content flex items-center gap-3 px-4">
          <span aria-hidden="true" className="bg-accent shadow-status size-2 rounded-full" />
          <span className="text-sm font-semibold tracking-tight">Mangabound</span>
          <span className="text-muted-foreground text-xs">Foundation</span>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-10 px-8 py-16">
        <section className="max-w-2xl space-y-4" aria-labelledby="foundation-title">
          <p className="tracking-label text-accent text-xs font-semibold uppercase">
            Architecture checkpoint
          </p>
          <h1 id="foundation-title" className="text-4xl font-semibold tracking-tight">
            A deliberate foundation for the manga pipeline.
          </h1>
          <p className="text-muted-foreground text-base leading-7">
            The desktop shell, design tokens, security boundaries, and test harnesses are in place.
            Release-pinned conversion tools are checked before any job can run.
          </p>
        </section>

        <section
          aria-label="Bundled tool status"
          className="border-border bg-surface shadow-card flex items-start gap-4 rounded-xl border p-5"
        >
          {toolchain === undefined ? (
            <LoaderCircle aria-hidden="true" className="text-accent mt-0.5 size-5 animate-spin" />
          ) : toolchain.state === 'ready' ? (
            <CheckCircle2 aria-hidden="true" className="text-status-complete mt-0.5 size-5" />
          ) : (
            <CircleAlert aria-hidden="true" className="text-status-warning mt-0.5 size-5" />
          )}
          <div>
            <h2 className="text-sm font-semibold">
              {toolchain === undefined
                ? runtime === undefined
                  ? 'Bundled tools are verified in the desktop app'
                  : 'Checking bundled tools'
                : toolchain.state === 'ready'
                  ? 'Conversion tools ready'
                  : 'Conversion tools need attention'}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              {toolchain?.message ??
                (runtime === undefined
                  ? 'Storybook renders this state without launching native executables.'
                  : 'Checking versions, protocol compatibility, and file integrity…')}
            </p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3" aria-label="Foundation boundaries">
          {foundations.map(({ description, icon: Icon, title }) => (
            <article
              key={title}
              className="border-border bg-surface shadow-card rounded-xl border p-5"
            >
              <Icon aria-hidden="true" className="text-accent mb-5 size-5" strokeWidth={1.75} />
              <h2 className="text-sm font-semibold">{title}</h2>
              <p className="text-muted-foreground mt-2 text-sm leading-6">{description}</p>
            </article>
          ))}
        </section>

        <footer className="border-border text-subtle-foreground flex items-center gap-2 border-t pt-5 text-xs">
          <span>Electron {runtime?.electron ?? 'Storybook'}</span>
          <span aria-hidden="true">·</span>
          <span>{runtime?.platform ?? 'browser preview'}</span>
        </footer>
      </main>
    </div>
  );
}
