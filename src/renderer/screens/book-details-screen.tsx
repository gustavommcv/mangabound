import { ChevronLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  type BookDetails,
  isLanguageTag,
  maxDetailLength,
  maxLanguageLength,
  normalizeBookDetails,
  volumeBookTitle,
} from '@/domain/book-details';
import type { BookFormat } from '@/domain/conversion';
import { FieldMessage } from '@/renderer/components/shared/field-message';
import { Button } from '@/renderer/components/ui/button';
import { Input } from '@/renderer/components/ui/input';
import { Label } from '@/renderer/components/ui/label';

export interface BookDetailsScreenProps {
  /** Where Back goes: the queue, or the library the title belongs to. */
  readonly backLabel: string;
  /** The language books are made in unless their own details name another. */
  readonly defaultLanguage: string;
  /** The title the tools use when none is typed: the item's own name. */
  readonly defaultTitle: string;
  /** The language the folder names declare, when they declare one. */
  readonly declaredLanguage?: string;
  readonly details: BookDetails;
  readonly format: BookFormat;
  /** What the details are for: the item's name in the queue. */
  readonly name: string;
  readonly onBack: () => void;
  readonly onChange: (details: BookDetails) => void;
  /**
   * The volumes of the series this makes, one book each; empty while none are set yet. Absent
   * when it makes a single book.
   */
  readonly volumes?: readonly number[];
}

/** How many of a series' book titles the preview lists before it says there are more. */
const previewedVolumes = 3;

/**
 * The title, author and language of one item in the queue (ADR 0030). Each field is optional and
 * takes effect as it is typed: what is left empty uses its default. The text is kept here as it is
 * typed and only its cleaned-up form goes up, so a space between two words survives being typed.
 */
export function BookDetailsScreen({
  backLabel,
  declaredLanguage,
  defaultLanguage,
  defaultTitle,
  details,
  format,
  name,
  onBack,
  onChange,
  volumes,
}: BookDetailsScreenProps): React.JSX.Element {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  const [text, setText] = useState({
    title: details.title ?? '',
    author: details.author ?? '',
    language: details.language ?? '',
  });
  const languageText = text.language.trim();
  const languageError =
    languageText === '' || isLanguageTag(languageText)
      ? undefined
      : 'Use a language tag such as en-US or pt-br. It is not used until it is valid.';

  const update = (field: keyof typeof text, value: string): void => {
    const next = { ...text, [field]: value };
    setText(next);
    const nextLanguage = next.language.trim();
    onChange(
      normalizeBookDetails({
        title: next.title,
        author: next.author,
        // A language that is not a tag would be refused when the run starts, so it is not kept.
        ...(nextLanguage === '' || isLanguageTag(nextLanguage)
          ? { language: nextLanguage }
          : details.language === undefined
            ? {}
            : { language: details.language }),
      }),
    );
  };

  const series = volumes !== undefined;
  const title = text.title.trim() === '' ? defaultTitle : text.title.trim();
  const titles = series
    ? [...volumes].slice(0, previewedVolumes).map((volume) => volumeBookTitle(title, volume))
    : [title];
  const moreVolumes = series ? Math.max(0, volumes.length - previewedVolumes) : 0;
  const effectiveLanguage = languageText === '' ? defaultLanguage : languageText;
  const declaredElsewhere =
    declaredLanguage !== undefined &&
    declaredLanguage.toLowerCase() !== effectiveLanguage.toLowerCase();

  return (
    <section aria-labelledby="book-details-title" className="mx-auto max-w-3xl space-y-5">
      <Button onClick={onBack} variant="ghost">
        <ChevronLeft /> {backLabel}
      </Button>
      <div>
        <p className="text-muted-foreground text-xs font-medium">Book details</p>
        <h1
          className="focus-visible:ring-ring focus-visible:ring-offset-background mt-1 rounded-md text-2xl font-semibold tracking-tight break-all outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          id="book-details-title"
          ref={titleRef}
          tabIndex={-1}
        >
          {name}
        </h1>
        <p className="text-subtle-foreground mt-1 text-sm">
          Every field is optional. What you leave empty uses its default.
        </p>
      </div>

      <div className="border-border bg-surface space-y-5 rounded-xl border p-6">
        <div className="space-y-2">
          <Label className="text-sm font-medium" htmlFor="details-title">
            {series ? 'Series title' : 'Book title'}
          </Label>
          <Input
            aria-describedby="details-title-message"
            id="details-title"
            maxLength={maxDetailLength}
            onChange={(event) => {
              update('title', event.target.value);
            }}
            placeholder={defaultTitle}
            value={text.title}
          />
          <FieldMessage
            description={
              series
                ? 'Each volume is titled with this and its number.'
                : 'The title the book has in your reader.'
            }
            id="details-title-message"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium" htmlFor="details-author">
            Author
          </Label>
          <Input
            aria-describedby="details-author-message"
            id="details-author"
            maxLength={maxDetailLength}
            onChange={(event) => {
              update('author', event.target.value);
            }}
            placeholder="Leave blank if unknown"
            value={text.author}
          />
          <FieldMessage
            {...(format === 'cbz'
              ? {
                  description:
                    'CBZ files do not store an author. It is only kept in the catalog Mangabound shows.',
                }
              : {})}
            id="details-author-message"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium" htmlFor="details-language">
            Language
          </Label>
          <Input
            aria-describedby="details-language-message"
            aria-invalid={languageError === undefined ? undefined : true}
            id="details-language"
            maxLength={maxLanguageLength}
            onChange={(event) => {
              update('language', event.target.value);
            }}
            placeholder={defaultLanguage}
            value={text.language}
          />
          <FieldMessage
            {...(languageError === undefined
              ? {
                  description: declaredElsewhere
                    ? `The folder names say ${declaredLanguage}.`
                    : format === 'epub'
                      ? 'Used for EPUB output.'
                      : 'Only EPUB files carry a language.',
                }
              : { error: languageError })}
            id="details-language-message"
          />
        </div>
      </div>

      <div className="text-muted-foreground text-xs leading-relaxed">
        <p className="font-medium">{series ? 'Books will be titled' : 'The book will be titled'}</p>
        {series && volumes.length === 0 ? (
          <p className="mt-1">
            Once the volumes are set, each one is titled with this and its number.
          </p>
        ) : (
          <ul aria-label="Book titles" className="mt-1 space-y-0.5">
            {titles.map((bookTitle) => (
              <li className="break-all" key={bookTitle}>
                {bookTitle}
              </li>
            ))}
            {moreVolumes > 0 && (
              <li>…and {String(moreVolumes)} more, one for each remaining volume.</li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
