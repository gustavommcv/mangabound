import { InfoBanner } from '@/renderer/components/shared/info-banner';

/**
 * What a search that found nothing says. The likely reason is in the text that was searched: a
 * folder name with "- EN", brackets or a volume number in it finds nothing where the bare title
 * would, so the notice quotes what was searched and says where to change it.
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
      message={`No matches for “${query}”. Extra characters in the ${fix}, such as “- EN”, brackets or a volume number, can keep a work from being found. Edit the ${fix} above and try again.`}
    />
  );
}
