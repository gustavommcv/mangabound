# ADR 0014: Options are kept between sessions, and can be put back to their defaults

- Status: Accepted
- Date: 2026-09-19
- Amends: [ADR 0011](0011-kcc-default-options.md) (the defaults are where the options start, and now also where a reset returns them), [ADR 0013](0013-online-sources-for-volume-data.md) (the chosen source is now remembered between sessions)

## Context

Every launch started from nothing: the process steps, the device, the format, every mangapress option, the output folder and the online source were all chosen again. Someone who converts for one e-reader repeats the same choices each time. ADR 0011 settled where the options start; nothing let them stay changed, and nothing brought them back once they were.

Three things had to be settled first.

- **What is kept.** The title and the author name one book, not a person's preferences, so keeping them would put last week's title on today's book. A folder is a path, and the window holds no paths (ADR 0010, ADR 0012), so keeping it must not change that.
- **What happens when what was kept cannot be used.** A file can be damaged, written by another version or edited by hand; a device can leave the tools' list after an update; a folder can be deleted or sit on a drive that is not connected.
- **What "back to the defaults" means.** A reset that also forgot the output folder would be a nuisance, and one that left a leftover "join only" step in place would look broken.

## Decision

- **What is kept:** the process steps, the format, every mangapress option except the title and the author, the output folder, and the id of the chosen online source. The queue is not kept, sharing is not kept and never starts by itself, and the title and author start empty each time.
- **Where:** one JSON file, `settings.json`, in the app's per-user data folder (the one Electron calls `userData`), so it is per person and outside the library.
- **Its shape:** `{ "version": 1, ... }`. It is checked when it is read with the same schema that checks what the window sends to be saved, so the two cannot drift apart. Keys the schema does not know are dropped, which is also what removes a title or an author that somehow got into the file. Its values are held to the rules a conversion request is held to, ranges and the custom device's size included, so the file cannot hold what a run would refuse.
- **How it is written:** to a temporary file next to it, then renamed over it, so a crash never leaves half a file. Writes go one after another and the last change wins. The app waits for them before it quits.
- **When it cannot be used, the defaults are used and the person is told, except on the first run:**
  - no file yet: the defaults, and nothing is said;
  - a file that cannot be read (not JSON, a version this build does not know, a value out of range): the defaults, and a notice says the saved settings could not be read. The next change replaces the file;
  - a device the tools no longer list: the default device, or the first one listed if that is gone too, and a notice names both;
  - an output folder that is gone: no folder is chosen and a notice says which one was missing;
  - an online source that is not in the list: ignored.
- **The window still holds no path.** The main process reads the folder from the file, checks that it is a folder, and gives the window the same kind of folder id a dialog would. Saving sends that id, and the main process writes the path it stands for.
- **Nothing is saved before what was saved has been read,** so the defaults shown while it loads cannot overwrite it, and nothing is written until something changes. A first launch leaves no file, and a file that could not be read stays where it is until the next change. A mangapress value that fails validation, such as a number half-typed, is not saved; the last valid one stays. A save that failed is tried again with the next change.
- **Reset to defaults.** On the queue screen it puts the process steps, the device, the format and every mangapress option back to ADR 0011's defaults, and leaves the output folder and the online source alone: they are places and choices, not options. The mangapress options screen has the same button for what that screen holds (device, format and the options). The button stays where it is, dimmed, when nothing differs from the defaults, so it can always be found and focus is never left on something that vanished. It asks for a second click, because what it discards is now also what was saved.

## Consequences

The app opens as it was left. A person who never changes anything sees no difference and no file until they do.

Known limits: a file written by a newer version reads as unreadable to an older one and is replaced by its next save, which is acceptable while the app is alpha and worth revisiting before a stable release; there are no named presets, no per-device options, and no export or import; a title or author cannot be kept as a default on purpose. The settings folder is per operating-system user, so two people sharing a login share settings.
