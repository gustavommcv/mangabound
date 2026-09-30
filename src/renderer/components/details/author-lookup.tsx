import { ExternalLink, Search } from 'lucide-react';

import { ProviderPicker } from '@/renderer/components/mapping/provider-picker';
import { NoMatchesNotice } from '@/renderer/components/shared/no-matches-notice';
import { Button } from '@/renderer/components/ui/button';
import { type SearchMetadata, useMetadataSearch } from '@/renderer/hooks/use-metadata-search';
import type { MetadataProviderDescriptor } from '@/shared/workflow-contract';

/** The online sources, and what is needed to ask one who wrote a work. */
export interface AuthorLookup {
  readonly providers: readonly MetadataProviderDescriptor[];
  /** The source chosen for volume data or here, kept while the app is open. */
  readonly selectedId: string | undefined;
  readonly onSelect: (providerId: string | undefined) => void;
  readonly onOpenHomepage: (providerId: string) => void;
  readonly onSearch: SearchMetadata;
}

/**
 * Looks up who wrote a work, in a source the person chooses here. Nothing is sent until Search is
 * used, and what would be sent is written out first, following the title as it is edited. The
 * title is the only thing searched: to search for something else, the title is what changes.
 */
export function AuthorLookupPanel({
  id,
  lookup,
  onUse,
  title,
}: {
  readonly id: string;
  readonly lookup: AuthorLookup;
  /** Takes the authors of a work found as the author of the book. */
  readonly onUse: (authors: string) => void;
  /** The title that would be searched: the one typed, or the item's own name. */
  readonly title: string;
}): React.JSX.Element {
  const provider = lookup.providers.find((candidate) => candidate.id === lookup.selectedId);
  const { error, forget, lastTitle, results, search, searched, searching } = useMetadataSearch(
    lookup.onSearch,
  );

  return (
    <div className="border-border bg-background space-y-3 rounded-lg border p-4" id={id}>
      <div className="max-w-md">
        <ProviderPicker
          noneDetail="Type the author yourself"
          onSelect={(providerId) => {
            forget();
            lookup.onSelect(providerId);
          }}
          providers={lookup.providers}
          selectedId={lookup.selectedId}
        />
      </div>

      {provider === undefined ? (
        <p className="text-muted-foreground text-xs">
          Pick a source to look up who wrote it. Nothing is sent anywhere until you search.
        </p>
      ) : (
        <>
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
            Author data by
            <button
              aria-label={`Open ${provider.displayName} in your browser`}
              className="text-accent focus-visible:ring-ring inline-flex items-center gap-1 rounded-sm font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-2"
              onClick={() => {
                lookup.onOpenHomepage(provider.id);
              }}
              type="button"
            >
              {provider.displayName}
              <ExternalLink aria-hidden="true" className="size-3" />
            </button>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-muted-foreground min-w-0 flex-1 text-xs leading-relaxed">
              Will search {provider.displayName} for “{title}”. Only author names and years are
              used, and nothing is downloaded from there.
            </p>
            <Button
              disabled={title === ''}
              onClick={() => {
                search(provider.id, title);
              }}
              size="sm"
              variant="outline"
            >
              <Search aria-hidden="true" /> Search
            </Button>
          </div>
          {searching && <p className="text-muted-foreground text-xs">Searching…</p>}
          {error !== undefined && (
            <p className="text-status-failed text-xs" role="alert">
              {error}
            </p>
          )}
          {!searching && searched && error === undefined && results.length === 0 && (
            <NoMatchesNotice fix="title" query={lastTitle ?? title} />
          )}
          {!searching && results.length > 0 && (
            <ul aria-label="Matches" className="space-y-2">
              {results.map((result) => {
                const authors = result.authors ?? [];
                return (
                  <li
                    className="border-border flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                    key={result.id}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{result.title}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {authors.length === 0 ? 'No author listed' : authors.join(', ')}
                        {result.year === undefined ? '' : ` · ${String(result.year)}`}
                      </p>
                    </div>
                    {authors.length > 0 && (
                      <Button
                        aria-label={`Use ${authors.join(', ')} from ${result.title}`}
                        onClick={() => {
                          onUse(authors.join(', '));
                        }}
                        size="sm"
                        variant="outline"
                      >
                        Use author
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
