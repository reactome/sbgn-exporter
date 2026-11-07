# sbgn-exporter

SBGN-ML (Process Description) export of Reactome events: the release's bulk file
(`homo_sapiens.sbgn.tar.gz`) and the website's SBGN of one pathway or reaction, from
one implementation in TypeScript. It is to replace the SBGN converter in
[`reactome/diagram-exporter`](https://github.com/reactome/diagram-exporter), matching
its output but for declared fixes.

The work is specified before it is built: see [`specs/`](specs/) and
[`CLAUDE.md`](CLAUDE.md). The principles are in
[`.specify/memory/constitution.md`](.specify/memory/constitution.md).

## Using the library

The website imports the library from this repository's `dist` branch, which CI rebuilds
from each commit of `main` (`Build from <main's commit>`), pinned to one of its commits.
The branch's `package.json` has no dependencies, so nothing else is installed: none of the
command line's (`neo4j-driver`) or the comparison's (`saxes`).

```sh
# the dist commit whose message names the main commit wanted
git ls-remote https://github.com/reactome/sbgn-exporter.git refs/heads/dist
npm install 'git+https://github.com/reactome/sbgn-exporter.git#<dist commit>'
```

npm fetches it over HTTPS (GitHub's tarball of the commit) and records it in the lockfile
with its integrity, so `npm ci`, `npm install --omit=dev` and `npm install
--ignore-scripts` install the same files. Then:

```js
import { toSbgn, sbgnFileName, SBGN_MEDIA_TYPE, SbgnLayoutError } from 'sbgn-exporter';

const sbgn = toSbgn(layout); // a diagram layout, parsed from JSON
```

`toSbgn` reads the layout it is given (a release's `diagram/{stId}.json`, or a
reaction's layout as the website's content service answers it), checks it, and returns the
whole document as text, the same for the same layout every time. A layout it cannot
convert is refused with an `SbgnLayoutError` naming the object. The library loads none of
the command line's or the comparison's dependencies.

## The release's bulk file

This command writes `homo_sapiens.sbgn.tar.gz`, in place of diagram-exporter's SBGN step
(`--format sbgn --target "Homo sapiens"`). It runs from a checkout on Node 24:

```sh
npm ci
# with NEO4J_URI and the graph's other settings (below) in the environment
SOURCE_DATE_EPOCH=<seconds> node src/cli.ts bulk --diagrams <diagram folder> --out homo_sapiens.sbgn.tar.gz
```

**Inputs**

- **The release's graph,** read only, for the list of pathways: every
  `Pathway{hasDiagram: true}` of the species (Homo sapiens unless `--species` names
  another), ordered by dbId, as diagram-exporter lists them. Its address and credentials
  come from the environment: `NEO4J_URI`, `NEO4J_USER` (default `neo4j`),
  `NEO4J_PASSWORD`, `NEO4J_DATABASE` (default `graph.db`).
- **The release's diagram files,** `{stId}.json`, in a local folder: the release's
  `diagram/` folder. Nothing is fetched.
- **`SOURCE_DATE_EPOCH`,** optional: the archive's file time, in whole seconds. Set, the
  same release gives the same archive, byte for byte; unset, the time of the run.

**Output**

- `homo_sapiens.sbgn.tar.gz`: one `{stId}.sbgn` per listed pathway, flat, in name order,
  as the published file is; ustar, mode 0644, gzip. Each file is SBGN-ML 0.2, valid
  against libSBGN 0.2's schema.
- On standard error, each pathway that could not be written with its reason, progress
  every 100 pathways, and `N written, M failed`.
- **Exit status:** 0 if every pathway was written; 1 if any failed (the archive holds the
  rest, as Java's run did); 2 for a usage error or a graph that cannot be read, with
  nothing written.

For release 98 the command wrote the published file's 1,390 names, in its order, in about
12 seconds, and every file compares with Java's with only the declared differences (spec
001, T016, T020, T026).

**Other commands**

```sh
# the same documents into a folder: for a species, or for pathways by stable id or dbId
node src/cli.ts files --diagrams <diagram folder> --out <folder> --species "Homo sapiens"
node src/cli.ts files --diagrams <diagram folder> --out <folder> --pathways R-HSA-69620,109581
# one layout file, without the graph
node src/cli.ts convert <layout.json> [--out <file.sbgn>]
```

## How it is proved

What this exporter writes is Java's but for the declared differences (spec 001, FR-003:
a fixed order, arcs read from the layout as given, `cardinality`, Arial's widths, and
product arcs that run from the reaction to the product). The tools, from a checkout:

- `node ci/compare.ts <ours> <java> [--layout <layout>] [--bulk] [--json]` compares two
  files, or two folders, glyph by glyph and arc by arc, by id, and gives each difference a
  kind; it fails on any it cannot explain ([contract](specs/001-sbgn-export/contracts/comparison.md)).
- `ci/validate.sh <folder>` validates every file against libSBGN 0.2's schema with
  xmllint; CI runs it over every fixture's output.
- `node ci/float-check.ts <folder>` re-derives every number of Java's files from its text.
- `ci/reference/harness/` runs Java's own converter (diagram-exporter 2.0.12, Java 11,
  no network) on a layout or a folder of them, for the fixtures' Java answers;
  `ci/reference/schematron/` runs libSBGN's Process Description rules. Both are run by
  hand, never in CI.

`npm run check` runs types, lint, formatting and the tests, as CI does.

Licensed under the Apache License 2.0 ([`LICENSE`](LICENSE)).
