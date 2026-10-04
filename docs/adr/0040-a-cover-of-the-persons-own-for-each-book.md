# ADR 0040: A cover of the person's own for each book, kept by the app

- Status: Accepted
- Date: 2026-10-04
- Amends: [ADR 0035](0035-mangapress-0-7-first-its-options-in-steps.md) (the fifth step does not wait for mangapress, and `--cover` is sent), [ADR 0030](0030-title-author-and-language-belong-to-each-book.md) (the details page also holds each book's cover)

## Context

A volume joined from chapters takes the first page of its first chapter as its cover, which is seldom the volume's cover. [ADR 0035](0035-mangapress-0-7-first-its-options-in-steps.md) planned a folder of covers chosen on the details page and said the step waited for mangapress: the tool was to take a covers folder from anywhere and say which image each book would get, so that the app would show the tool's answer.

That plan was wrong on its own terms. The question it wanted to ask mangapress, which image goes to books that are not files yet, is one nobody asks from a terminal, and [ADR 0006](0006-cli-first-tool-boundary.md) allows a capability in the tools only when it stands as a terminal invocation of its own. The same ADR gives choosing inputs to the app, which already decides the title of every volume and sends it with `--title`.

Checked against the pinned tools by running them:

- mangapress's `--cover FILE` takes an image from any folder under any name, makes the cover from it as it makes any cover (so the two cover options of [ADR 0038](0038-cover-options-and-the-kobo-file-name.md) apply), stores it as a CBZ's first image, and wins over a `Covers` folder beside the input. A PDF has no cover.
- A `Covers` folder inside a manga folder is reported by mangabind as a chapter it could not parse, and [ADR 0032](0032-keep-the-author-and-language-with-the-folder.md) had already found that any other file there is reported as unsupported. So the images cannot be kept with the series.
- The app keeps three kinds of things: preferences in `settings.json`, pending books in its local data, and the grouping, author and language in the series' own `mangabind.json`.

## Decision

- **Each book takes a cover of the person's own, one at a time.** The details page lists every book the item makes, the volumes of a series or its single book, and each line takes an image by a file dialog or by a drop. The image can be anywhere and have any name.
- **A folder is a way to fill them, not a second source.** "Add covers from a folder" gives its images to the books in name order, the first to the first book, and so does dropping a folder or several images on the list. It is taken once: afterwards every cover is changed or removed on its own line, and the app keeps no link to the folder.
- **A cover chosen by hand is never replaced by a folder.** The image that falls on that book is passed over and the others still go to the books they line up with. A cover an earlier folder gave is replaced. Each cover therefore remembers which of the two it is, and a line shows it.
- **Nothing set means nothing sent.** A book without a cover of its own is made as before, with the cover mangapress makes from its first image, which is Kindle Comic Converter's behavior. The `Covers` folder mangapress looks for beside a loose input still works where it did.
- **The app keeps its own copy,** in its local data beside the pending books (`covers`, next to `pending`): a folder for each item, named by a hash of the item's path, with the images and an index of which book each is for. The original can be moved or deleted. They are not preferences, so not `settings.json`; and not `mangabind.json`, which is the person's folder and which a loose CBZ does not have.
- **A cover is known by the item's path and the book's place in it:** the volume's number, or the one book. Covers come back when the same folder or file is added again.
- **The run sends `--cover` for each book that has one.** It moves from the `deferred` group to the flags the workflow sends. A run that stops at the joined volumes sends none and offers none, since mangapress makes the cover.
- **The screen never holds a path.** The item is found from its session; a path comes only from a native dialog or from dropped files, read by the preload, and is checked on disk. What goes back is each cover's name and origin.
- **Only the file's name is shown,** not the image: the app still shows no pictures ([ADR 0005](0005-product-boundaries-and-anti-goals.md)).

## Consequences

Someone with the covers of a series gets them on the books by dropping a folder, and can fix any one by hand. Nothing changes for someone who sets none.

Known limits:

- Renaming or moving the series folder, or using another computer, loses the covers: they are found by the item's path and live in this computer's app data. Nothing removes the copies of an item that is gone; they are small, and deleting them on a guess could lose covers of a drive that is only unplugged.
- A folder's images are matched by order alone, not by a name or a number in the file name. What they were given to is on the screen at once.
- `--spreads` is now the only flag left in the `deferred` group.

Unit tests cover the order and the priority of a chosen cover, the store on a real folder (copying, replacing, removing, a broken or tampered index, failed clean-up), the workflow for a folder, a loose CBZ and a title of a library, the cover each kind of run sends, and the pinned mangapress making a book with a kept cover. Component tests cover the list, the drops and the app's wiring; a story shows a series with covers.
