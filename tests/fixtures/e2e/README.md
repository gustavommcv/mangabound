# Packaged-app fixture

`manga-folder/Mangabound E2E` is a complete manga folder fixture: two chapter directories with two valid PNG pages each. The images are procedurally generated geometric patterns, not copyrighted manga pages.

`cbz/Mangabound Direct.cbz` contains two of the same generated pages and exercises the direct-CBZ path without mangabind.

`manga-named-volumes/Named Volumes` is one manga whose chapter folders carry the volume in their names (`Vol.01 Ch.0001 - First (en) [Group]`), so mangabind groups it into volumes 1 and 2 on its own.

Regenerate the checked-in PNG files from the repository root with:

```console
node scripts/generate-e2e-fixture.mjs
```
