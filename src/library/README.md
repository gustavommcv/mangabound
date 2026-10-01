# Library

Output-library indexing and publication behavior behind application-facing interfaces. Filesystem-specific behavior belongs in an adapter.

`unique-name.ts` defines the shared book-name rule: the original name, then `(2)`, `(3)`, and so on before the extension. `pending-save.ts` applies it to an exclusive Save All callback, retrying only `EEXIST` and preserving the existing 998-attempt budget (original name through copy `(998)`). There is no filesystem existence check followed by a potentially overwriting write: the adapter's exclusive publication determines collisions. Warnings pass through unchanged, and other failures stop retries for that book. The helper and its typed `PendingSaveError` reasons/message classification are under the unit coverage gate; neither depends on Electron or filesystem APIs.
