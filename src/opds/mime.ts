import type { BookFormat } from '@/domain/conversion';

export const bookFormatMimeTypes: Readonly<Record<BookFormat, string>> = {
  epub: 'application/epub+zip',
  cbz: 'application/vnd.comicbook+zip',
  pdf: 'application/pdf',
};
