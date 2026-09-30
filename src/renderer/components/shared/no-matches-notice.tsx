import { InfoBanner } from '@/renderer/components/shared/info-banner';

/**
 * What a search that found nothing says. The likely reason is in the text that was searched: a
 * folder name with extra characters in it finds nothing where the bare title would, so the notice
 * quotes what was searched and says where to change it. It names no example, because what the
 * extra characters are differs from one name to the next.
 */
export function NoMatchesNotice({
  fix,
  query,
}: {
  /** What the person edits to search again: a search box of its own, or the title above. */
  readonly fix: 'search' | 'title';
  readonly query: string;
}): React.JSX.Element {
  return (
    <InfoBanner
      aria-label="No matches"
      message={`No matches for “${query}”. Extra characters in the ${fix} can keep a work from being found. ${
        fix === 'title' ? 'Try a simpler title above' : 'Try simpler words above'
      } and search again.`}
    />
  );
}
