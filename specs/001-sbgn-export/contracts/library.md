# Contract: the library

What the website's node content service imports. The package is installed from git at a
pinned commit; `prepare` builds `dist/` (research R6).

```ts
import { toSbgn, sbgnFileName, type DiagramLayout } from 'sbgn-exporter';

// One document for one layout: a pathway's diagram file, parsed, or a reaction's layout.
const xml: string = toSbgn(layout as DiagramLayout);

// The download name, from the event's own stable id (not the diagram's).
const name: string = sbgnFileName('R-HSA-69615'); // 'R-HSA-69615.sbgn'
```

- **`toSbgn(layout: DiagramLayout): string`**: the whole document, XML declaration to final
  newline, as UTF-8 text. Pure: no files, no network, no clock, no randomness. The same
  layout gives the same string.
- **Errors:** `SbgnLayoutError` (exported) for a layout it cannot convert: a connector
  naming a missing edge; an edge none of whose segments touches its shape (Java's index
  out of bounds); an INPUT or OUTPUT without segments of its own on an empty or missing
  backbone (Java's index out of bounds or null); an arc without points; a repeated id; a
  field of the wrong type.
  Its message names the object's ids. The caller answers it as Java answers a failed
  conversion: a 500.
- **`sbgnFileName(stableId: string): string`**: `{stableId}.sbgn`; throws on a value that is
  not a stable id.
- **`SBGN_MEDIA_TYPE`**: `application/sbgn+xml;charset=UTF-8`, the content type Java sends.
- **Nothing else is imported** by the entry point: the command line's and comparison's
  dependencies stay out of the website's import.
- **Versioning:** the website pins a commit. A change to what is written is listed in the
  pull request with its comparison (constitution, quality gates), so the website knows to
  invalidate its cached answers for the release.
