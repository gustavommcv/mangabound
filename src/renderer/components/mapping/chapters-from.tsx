import { ExternalLink, RotateCcw, Search } from 'lucide-react';
import { useState } from 'react';

import { ProviderPicker } from './provider-picker';

import type { VolumeSuggestion } from '@/domain/mapping';
import { InfoBanner } from '@/renderer/components/shared/info-banner';
import { NoMatchesNotice } from '@/renderer/components/shared/no-matches-notice';
import { Button } from '@/renderer/components/ui/button';
import { Input } from '@/renderer/components/ui/input';
import { Label } from '@/renderer/components/ui/label';
import { panelId, TabList, tabId } from '@/renderer/components/ui/tabs';
import { useMetadataSearch } from '@/renderer/hooks/use-metadata-search';
import type { MetadataProviderDescriptor, MetadataSearchResult } from '@/shared/workflow-contract';

type Source = 'names' | 'online' | 'manual';

const group = 'chapters-from';

const plural = (count: number, word: string): string =>
  `${String(count)} ${word}${count === 1 ? '' : 's'}`;

/** What the names of the folders gave, and how to go back to it. */
export interface NamesSource {
  /** How many volumes mangabind read out of the names. */
  readonly volumes: number;
  readonly chapters: number;
  /** Whether the mapping has been edited since it was read. */
  readonly changed: boolean;
  readonly onStartOver: () => void;
}

/** The online sources, and what is needed to look a work up in one. */
export interface OnlineSource {
  readonly providers: readonly MetadataProviderDescriptor[];
  readonly selectedId: string | undefined;
  readonly onSelect: (providerId: string | undefined) => void;
  readonly onOpenHomepage: (providerId: string) => void;
  readonly mangaTitle: string;
  /** The language the folders declare, in which the volumes are looked up. */
  readonly language: string | undefined;
  readonly onSearch: (
    providerId: string,
    title: string,
    signal: AbortSignal,
  ) => Promise<readonly MetadataSearchResult[]>;
  readonly onSuggest: (
    providerId: string,
    workId: string,
    language: string | undefined,
  ) => Promise<{ readonly volumes: readonly VolumeSuggestion[] }>;
  readonly onApply: (result: MetadataSearchResult, volumes: readonly VolumeSuggestion[]) => void;
}

/**
 * Where the chapter-to-volume grouping comes from: the names of the folders (what mangabind read,
 * offline), an online source a person picks and searches, or their own hands. The chapters and
 * volumes below are edited the same way whichever is chosen; this only decides the starting point.
 */
export function ChaptersFrom({
  initialSource = 'names',
  missingNamesGrouping = false,
  names,
  online,
  onManualSelect,
}: {
  readonly initialSource?: Source;
  /** A fresh folder whose names yielded no volumes, before any manual grouping. */
  readonly missingNamesGrouping?: boolean;
  readonly names: NamesSource;
  /** Left out when there is no online source to offer. */
  readonly online?: OnlineSource | undefined;
  readonly onManualSelect?: () => void;
}): React.JSX.Element {
  const [source, setSource] = useState<Source>(initialSource);
  const tabs = [
    { id: 'names', label: 'File names' },
    ...(online === undefined ? [] : [{ id: 'online' as const, label: 'Online source' }]),
    { id: 'manual', label: 'Manual' },
  ] as const;
  const shown: Source = source === 'online' && online === undefined ? 'names' : source;

  return (
    <section
      aria-labelledby="chapters-from-title"
      className="border-border bg-surface rounded-xl border p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold" id="chapters-from-title">
          Chapters from
        </h2>
        <TabList
          group={group}
          label="Chapters from"
          onChange={(next) => {
            setSource(next);
            if (next === 'manual') onManualSelect?.();
          }}
          tabs={tabs}
          value={shown}
        />
      </div>
      <div
        aria-labelledby={tabId(group, shown)}
        className="mt-4"
        id={panelId(group, shown)}
        role="tabpanel"
      >
        {shown === 'names' && <NamesPanel {...names} onlineAvailable={online !== undefined} />}
        {shown === 'online' && online !== undefined && <OnlinePanel {...online} />}
        {shown === 'manual' && (
          <div className="space-y-3">
            {missingNamesGrouping && (
              <InfoBanner
                message={
                  online === undefined
                    ? 'Build the volumes here; no online source is required.'
                    : 'Build them here, or try Online source for a suggestion. Nothing is searched automatically.'
                }
                title="No volumes found in file names"
              />
            )}
            <p className="text-muted-foreground text-sm">
              Select chapters or a range to assign to volumes. You can move them later. Manual edits
              stay on this computer.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function NamesPanel({
  changed,
  chapters,
  onStartOver,
  onlineAvailable,
  volumes,
}: NamesSource & { readonly onlineAvailable: boolean }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground max-w-xl text-sm">
        {volumes === 0
          ? `No file-name grouping is available here. ${onlineAvailable ? 'Use an online source, or group the chapters yourself.' : 'Group the chapters yourself.'}`
          : `${plural(volumes, 'volume')} ${volumes === 1 ? 'was' : 'were'} read from the names of ${plural(chapters, 'chapter')}, without going online.`}
      </p>
      <Button disabled={!changed} onClick={onStartOver} size="sm" variant="outline">
        <RotateCcw /> Start over from the names
      </Button>
    </div>
  );
}

function OnlinePanel({
  language,
  mangaTitle,
  onApply,
  onOpenHomepage,
  onSearch,
  onSelect,
  onSuggest,
  providers,
  selectedId,
}: OnlineSource): React.JSX.Element {
  const provider = providers.find((candidate) => candidate.id === selectedId);
  const [query, setQuery] = useState(mangaTitle);
  const [applyingId, setApplyingId] = useState<string>();
  // A search only ever starts from the Search button (or Enter). Nothing is sent on open, on
  // choosing a source or while typing, so the title never leaves the machine without a request.
  const {
    error: panelError,
    forget,
    lastTitle,
    results,
    search: startSearch,
    searched,
    searching,
    setError: setPanelError,
  } = useMetadataSearch(onSearch);

  const search = (): void => {
    const title = query.trim();
    if (provider === undefined || title === '') return;
    startSearch(provider.id, title);
  };

  const applyResult = (result: MetadataSearchResult): void => {
    if (provider === undefined) return;
    setApplyingId(result.id);
    setPanelError(undefined);
    onSuggest(provider.id, result.id, language)
      .then((suggestion) => {
        onApply(result, suggestion.volumes);
      })
      .catch((error: unknown) => {
        setPanelError(
          error instanceof Error ? error.message : 'The suggestion could not be applied.',
        );
      })
      .finally(() => {
        setApplyingId(undefined);
      });
  };

  return (
    <div className="space-y-4">
      <div className="max-w-md">
        <ProviderPicker
          onSelect={(providerId) => {
            forget();
            onSelect(providerId);
          }}
          providers={providers}
          selectedId={selectedId}
        />
      </div>

      {provider === undefined ? (
        <p className="text-muted-foreground text-sm">
          Pick a source to look up which chapters belong in each volume. Nothing is sent anywhere
          until you search.
        </p>
      ) : (
        <>
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
            Volume data by
            <button
              aria-label={`Open ${provider.displayName} in your browser`}
              className="text-accent focus-visible:ring-ring inline-flex items-center gap-1 rounded-sm font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-2"
              onClick={() => {
                onOpenHomepage(provider.id);
              }}
              type="button"
            >
              {provider.displayName}
              <ExternalLink aria-hidden="true" className="size-3" />
            </button>
          </p>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              search();
            }}
          >
            <Search aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
            <Label className="sr-only" htmlFor="metadata-search">
              Search {provider.displayName}
            </Label>
            <Input
              className="min-w-48 flex-1"
              id="metadata-search"
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              placeholder="Manga title"
              value={query}
            />
            <Button disabled={query.trim() === ''} size="sm" type="submit" variant="outline">
              Search
            </Button>
          </form>
          <p className="text-muted-foreground text-xs">
            Searching sends the title to {provider.displayName}. Only volume and chapter numbers are
            used, and nothing is downloaded from there.
            {language !== undefined &&
              ` Volumes are looked up in ${language}, the language of your folders.`}
          </p>
          {searching && <p className="text-muted-foreground text-xs">Searching…</p>}
          {panelError !== undefined && (
            <p className="text-status-failed text-xs" role="alert">
              {panelError}
            </p>
          )}
          {!searching && searched && panelError === undefined && results.length === 0 && (
            <NoMatchesNotice fix="search" query={lastTitle ?? query} />
          )}
          {!searching && results.length > 0 && (
            <ul aria-label="Matches" className="space-y-2">
              {results.map((result) => (
                <li
                  className="border-border flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                  key={result.id}
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{result.title}</span>
                  <Button
                    disabled={applyingId !== undefined}
                    onClick={() => {
                      applyResult(result);
                    }}
                    size="sm"
                    variant="outline"
                  >
                    {applyingId === result.id ? 'Applying…' : 'Use these volumes'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
