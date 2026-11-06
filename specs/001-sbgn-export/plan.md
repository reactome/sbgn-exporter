# Implementation Plan: SBGN-ML from one TypeScript exporter, for the website and the bulk file

**Branch**: `001-sbgn-export` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-sbgn-export/spec.md`

## Summary

One conversion, from a diagram layout to an SBGN-ML Process Description document, ported
from diagram-exporter's `SbgnConverter` and checked against Java's files by id, with five
declared fixes (spec FR-003, research R3). Around it:

- **a library** the website's node content service imports, pinned to a commit, and calls
  in its own process to answer `/exporter/event/{id}.sbgn` (research R6, R7). The endpoint
  itself is WebsiteAngular's work, tracked in its specs;
- **a command line** that lists a release's human pathways with diagrams from the graph,
  converts each diagram file and writes `homo_sapiens.sbgn.tar.gz` (research R10);
- **the instruments:** a comparison by id that knows the declared differences (R12), the
  libSBGN 0.2 schema check in CI (R11), and a harness that captures Java's answers for the
  fixtures (R13).

## Technical Context

**Language/Version**: TypeScript 6 (strict) on Node 24, run by Node's type stripping in
the repository; compiled to JavaScript and declarations (`dist/`) for the website.

**Primary Dependencies**:

- the conversion and writer: none;
- the command line: `neo4j-driver` (Apache-2.0) for the list of pathways;
- the comparison: `saxes` (ISC) for parsing;
- in CI: libxml2's `xmllint` and libSBGN 0.2's `SBGN.xsd`, fetched at a pinned commit.

**Storage**: none. Inputs are the release's diagram files and the graph; outputs are files.

**Testing**: `node --test` unit tests; fixtures (layouts with Java's answers, research
R13) compared by the comparison; every fixture's output validated against the schema in
CI.

**Target Platform**: the website's node content service (Linux containers, Node 24) and
the release's run (Linux, Node 24).

**Project Type**: a library with a command line.

**Performance Goals**: the largest pathway diagram converted in well under 2 s (SC-005);
a release's bulk file in under 15 minutes (SC-006), mostly reading files.

**Constraints**: the same bytes for the same layout on every machine (FR-004); Java's
writer's bytes but for the declared differences (FR-005); no copyleft dependency
(constitution VII); no relational database (constitution III).

**Scale/Scope**: 1,390 human pathways with diagrams in release 98; the largest diagram
files are a few MB of JSON.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                    | How this plan meets it                                                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| I. One implementation                        | One `toSbgn` for both; the bulk entry and the website's answer for a pathway are byte-identical (SC-004, a test).                  |
| II. Match today; fix only obvious bugs       | Java's mapping ported as is (R2); five declared differences, each with evidence (R3); improvements listed as issues (T028).        |
| III. Release files and the graph; no Java    | Layouts from diagram files or the website's reaction layout; the graph only for the bulk list; Java only in the reference harness. |
| IV. Every file valid                         | Schema check in CI on every fixture's output; the whole release once (SC-003).                                                     |
| V. Verify the instrument; prove a test fails | The comparison is shown failing on a planted difference of each kind; each fix's test is seen failing first.                       |
| VI. Production services are not fixtures     | References from a local content service and the release's published files only, fetched one at a time and not committed.           |
| VII. Loose licences; nothing private         | Dependencies Apache-2.0 and ISC; the schema fetched, not vendored; fixtures made for the purpose, no names.                        |

**Result:** passes. Re-checked after Phase 1: the contracts add no dependency and no
service; passes.

## Project Structure

### Documentation (this feature)

```text
specs/001-sbgn-export/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── library.md          # what the website imports
│   ├── cli.md              # the bulk file's command line
│   ├── website-endpoint.md # what WebsiteAngular's endpoint must answer
│   └── comparison.md       # the comparison's input, output and kinds
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── index.ts            # the library's entry: toSbgn, sbgnFileName, types
├── layout.ts           # the diagram layout's types, as the files hold them, and their reading
├── convert.ts          # layout → document model (R2's mapping)
├── geometry.ts         # ports, arc points, ShapeWrapper's touch test
├── text-width.ts       # Arial plain 16 widths (R5)
├── text-widths.json    # the table, from Java
├── java-float.ts       # JDK 11 Float.toString
├── write.ts            # document model → libSBGN 0.2 XML bytes (R4)
├── sbgn.ts             # namespace, language, file names
├── graph.ts            # the bulk list from the graph
├── tar.ts              # a flat ustar archive, gzipped
└── cli.ts              # the command line

test/                   # node --test, one file per module, and the fixtures' comparison
fixtures/
├── layouts/            # small layouts, made for the purpose or cut from public diagram files
└── java/               # Java's answers for them (R13)

ci/
├── compare.ts          # the comparison (R12)
├── validate.sh         # fetch the schema at its commit, check its hash, xmllint every file
├── float-check.ts      # every number of a bulk file against java-float
└── reference/          # the Java harness (R13), run by hand
```

**Structure Decision**: a single package. The library has no dependencies; the command
line's and the comparison's dependencies are not imported by `src/index.ts`, so the
website's import pulls in none of them.

## Phases

- **Phase 0 (research.md):** done. Java's converter read, its instabilities measured on
  release 98, every open question decided or given a default: D5 awaits the user.
- **Phase 1 (data-model.md, contracts/, quickstart.md):** done.
- **Phase 2 (tasks.md):** by `/speckit-tasks`.

## Risks

- **JDK 11's float text.** A port that misses a rounding case writes a different digit.
  Checked against all of a release's numbers (`ci/float-check.ts`) before parity is
  claimed.
- **The width table.** A character Java measures differently from the table changes a box
  width. Checked against every label box of the sample's content service answers; the
  table records how Java measures a missing glyph.
- **D5 undecided.** If the user keeps today's points, D5's code is a switch off and the
  comparison's D5 kind is removed; nothing else changes.
- **The website's half** depends on WebsiteAngular's own spec for its endpoint; this
  repository's tasks only name it (spec FR-012).

## Complexity Tracking

None: the Constitution Check passes without exceptions.
