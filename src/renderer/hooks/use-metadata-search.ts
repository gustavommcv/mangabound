import { useCallback, useEffect, useRef, useState } from 'react';

import type { MetadataSearchResult } from '@/shared/workflow-contract';

/** What a search of an online source needs: the source, the title, and a way to stop it. */
export type SearchMetadata = (
  providerId: string,
  title: string,
  signal: AbortSignal,
) => Promise<readonly MetadataSearchResult[]>;

/**
 * One search of an online source at a time: the works it found, whether a search has finished, and
 * what went wrong. A search only starts from `search`, which a click calls, and a search still
 * running is cancelled when another starts, when the results are forgotten, and on unmount.
 */
export function useMetadataSearch(onSearch: SearchMetadata): {
  readonly error: string | undefined;
  readonly forget: () => void;
  /** The title the last search was made with, for saying what found nothing. */
  readonly lastTitle: string | undefined;
  readonly results: readonly MetadataSearchResult[];
  readonly search: (providerId: string, title: string) => void;
  readonly searched: boolean;
  readonly searching: boolean;
  readonly setError: (message: string | undefined) => void;
} {
  const [results, setResults] = useState<readonly MetadataSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string>();
  const [lastTitle, setLastTitle] = useState<string>();
  const controller = useRef<AbortController>(undefined);

  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  const forget = useCallback((): void => {
    controller.current?.abort();
    setResults([]);
    setSearched(false);
    setSearching(false);
    setError(undefined);
  }, []);

  const search = useCallback(
    (providerId: string, title: string): void => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      setSearching(true);
      setError(undefined);
      setLastTitle(title);
      onSearch(providerId, title, current.signal)
        .then((found) => {
          if (current.signal.aborted) return;
          setResults(found);
          setSearched(true);
        })
        .catch((failure: unknown) => {
          if (current.signal.aborted) return;
          setError(
            failure instanceof Error ? failure.message : 'The search could not be completed.',
          );
        })
        .finally(() => {
          if (!current.signal.aborted) setSearching(false);
        });
    },
    [onSearch],
  );

  return { error, forget, lastTitle, results, search, searched, searching, setError };
}
