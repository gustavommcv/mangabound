import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { BookFormat } from '@/domain/conversion';
import type { MangapressSettings } from '@/domain/output-profile';
import { isDefaultMangapress } from '@/domain/preferences';
import { MangapressSettingsEditor } from '@/renderer/components/settings/mangapress-settings';
import { ResetOptions } from '@/renderer/components/settings/reset-options';
import { Button } from '@/renderer/components/ui/button';
import type { DeviceProfileSummary } from '@/shared/workflow-contract';

export interface ConversionOptionsScreenProps {
  readonly format: BookFormat;
  readonly onBack: () => void;
  readonly onFormat: (format: BookFormat) => void;
  readonly onNotify: (message: string) => void;
  /** The workflow owns resetting and persisting the choices; this screen asks for confirmation. */
  readonly onReset: () => void;
  readonly onSettings: (settings: MangapressSettings) => void;
  readonly profiles: readonly DeviceProfileSummary[];
  readonly settings: MangapressSettings;
  readonly singleBook: boolean;
}

/** Conversion choices stay in the workflow; page composition and entry focus belong here. */
export function ConversionOptionsScreen({
  format,
  onBack,
  onFormat,
  onNotify,
  onReset,
  onSettings,
  profiles,
  settings,
  singleBook,
}: ConversionOptionsScreenProps): React.JSX.Element {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <section className="mx-auto max-w-5xl space-y-6" aria-labelledby="options-title">
      <Button onClick={onBack} variant="ghost">
        <ArrowLeft /> Back
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-xs font-medium">Advanced</p>
          <h1
            className="focus-visible:ring-ring focus-visible:ring-offset-background mt-2 rounded-md text-3xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            id="options-title"
            ref={titleRef}
            tabIndex={-1}
          >
            Conversion options
          </h1>
          <p className="text-muted-foreground mt-3 text-sm">
            Fine-tune page layout, images, metadata, and output for everything in the queue. Your
            choices are saved for next time.
          </p>
        </div>
        <div className="w-72 shrink-0">
          <ResetOptions
            changed={!isDefaultMangapress(format, settings)}
            onReset={onReset}
            scope="the device, format and every mangapress option"
          />
        </div>
      </div>
      <MangapressSettingsEditor
        format={format}
        onFormat={onFormat}
        onNotify={onNotify}
        onSettings={onSettings}
        profiles={profiles}
        settings={settings}
        singleBook={singleBook}
      />
    </section>
  );
}
