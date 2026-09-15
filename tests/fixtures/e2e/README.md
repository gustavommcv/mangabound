# Packaged-app fixture

`hakuneko/Mangabound E2E` is a complete HakuNeko-style manga folder: two chapter directories with two valid PNG pages each. The images are procedurally generated geometric patterns, not copyrighted manga pages.

`cbz/Mangabound Direct.cbz` contains two of the same generated pages and exercises the direct-CBZ path without mangabind.

Regenerate the checked-in PNG files from the repository root with:

```console
node scripts/generate-e2e-fixture.mjs
```
