---
description: 'Tasks for spec 001: SBGN-ML from one TypeScript exporter'
---

# Tasks: SBGN-ML from one TypeScript exporter, for the website and the bulk file

**Input**: Design documents from `/specs/001-sbgn-export/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: required. The constitution (V) asks for every fix to come with a test seen
failing first, and the comparison to be seen failing on a planted difference.

**Keep this file current:** the pull request that completes a task ticks it and adds its
number.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: the user story (spec.md) the task serves

## Phase 1: Setup

- [ ] T001 Add the build for the website's import: `npm run build` (tsc to `dist/`, JavaScript and declarations, from a `tsconfig.build.json`), run by `prepare`, with `exports` and `types` in `package.json` pointing at `dist/index.js` (research R6). `dist/` stays ignored.
- [ ] T002 [P] Add a licence check over installed packages (allowlist: MIT, ISC, BSD, Apache-2.0 and the like), as pdf-export's `ci/licences.ts`, in `ci/licences.ts`, and run it in CI's `check` job (constitution VII).
- [ ] T003 [P] Add `ci/validate.sh`: fetch libSBGN's `resources/SBGN.xsd` at `milestone2` (commit `5c186ad4…`), check its blob hash (`2b7072cb…`), and run `xmllint --noout --schema` over a folder; CI installs `libxml2-utils` (research R11). Record libSBGN's licence for the schema file in the script's header. Show it failing on a release 98 Java file that has a `stoichiometry` glyph, kept outside the repository.

## Phase 2: Foundational (the conversion, which every story needs)

- [ ] T004 [P] Port JDK 11's `Float.toString` in `src/java-float.ts`, with unit tests in `test/java-float.test.ts` from known JDK 11 outputs, including the cases where it is not the shortest form.
- [ ] T005 [P] Add `ci/float-check.ts`: re-derive every number in a folder of Java's SBGN files from its text (parse, `Math.fround`, `java-float`) and report any that does not come back identical; run it over release 98's bulk files, outside CI, and record the count in this task (research R4).
- [ ] T006 [P] Add the Arial plain 16 width table: a Java program in `ci/reference/widths/` that writes each character's advance as Java 11's `FontMetrics` gives it, and how it measures a missing glyph; its output committed as `src/text-widths.json`; `src/text-width.ts` with tests in `test/text-width.test.ts` (research R5, D4).
- [ ] T007 [P] Type and read the diagram layout in `src/layout.ts`, as data-model.md lists it, refusing a field of the wrong type with an `SbgnLayoutError` naming the object; tests in `test/layout.test.ts`.
- [ ] T008 Port `ShapeWrapper`'s touch test, the ports' placement (`getEdgeGlyph`) and the arcs' points (`Participant.getSegments`, `getArcNextList`) in `src/geometry.ts`, reading the layout without altering it (D2), with production arcs' points from the reaction to the product (D5); tests in `test/geometry.test.ts`, one of them seen failing against an in-place reversal.
- [ ] T009 Port the mapping (research R2) in `src/convert.ts`: classes, ids, labels, boxes, units of information and their counter, cardinality glyphs (D3), faded and crossed objects left out, the fixed order (D1), and the refusals of an arc without points and of a repeated id; tests in `test/convert.test.ts`.
- [ ] T010 Write the document as libSBGN 0.2 writes it (research R4) in `src/write.ts`: declaration, namespace, indentation, attribute and child order, escapes, floats through `java-float`; tests in `test/write.test.ts` on a hand-built model whose expected text is taken from a Java file.
- [ ] T011 Export the library's contract ([contracts/library.md](contracts/library.md)) from `src/index.ts`: `toSbgn`, `sbgnFileName`, `SBGN_MEDIA_TYPE`, `SbgnLayoutError`, the layout's types; a test that importing it loads nothing from the command line's or comparison's dependencies.

**Checkpoint**: a layout converts to a document, deterministically.

## Phase 3: User Story 3 - Files match Java's but for declared differences (Priority: P1)

**Goal**: the comparison by id that gates the website's switch and the release's.

**Independent Test**: `ci/compare.ts` reports a planted difference of each kind correctly and fails on an undeclared one; the fixtures compare with no undeclared difference.

- [ ] T012 [P] [US3] Add the Java reference harness in `ci/reference/`: a container (Java 11 with Arial) running diagram-exporter 2.0.12's `SbgnConverter` on a layout file and writing its answer; documented, run by hand, never in CI (research R13).
- [ ] T013 [P] [US3] Add the fixtures in `fixtures/layouts/`, each small and named for what it exercises: a pathway with compartments, every node class, attachments, stoichiometry, every connector type and reaction shape, a faded and a crossed node, an edge with two outputs and an input without segments (D2), escapes and a non-ASCII label; a reaction layout as the website's reaction-layout module answers it. Cut from public diagram files or made by hand; no names. Their Java answers from T012 in `fixtures/java/`.
- [ ] T014 [US3] Write the comparison ([contracts/comparison.md](contracts/comparison.md)) in `ci/compare.ts`, with `saxes` as a dev dependency; tests in `test/compare.test.ts` that plant each of D1–D5 and an undeclared difference and see each reported and the exit status follow.
- [ ] T015 [US3] Compare every fixture's output with its Java answer in `test/fixtures.test.ts`, failing on any undeclared difference; and check that every byte outside the declared kinds is Java's by rewriting Java's answer into our order and comparing text.
- [ ] T016 [US3] Run the comparison over all of release 98's published bulk file against `files --species "Homo sapiens"` output on a private graph copy (quickstart step 3), outside CI; record the counts per kind in this task (SC-001). Depends on T026.

**Checkpoint**: parity is measured, not assumed.

## Phase 4: User Story 1 - A reader downloads one event's SBGN from the website (Priority: P1)

**Goal**: the website's node content service answers `/exporter/event/{id}.sbgn` with this library, and Java is no longer asked.

**Independent Test**: WebsiteAngular's comparison of its node answers with Java's on a local deployment shows only declared differences, and every error byte for byte.

- [ ] T017 [US1] Prove the website's import: install this repository at a commit from git into a scratch Node 24 project, import `toSbgn` from it, convert a fixture, and see the same bytes as `src/` gives; add the steps to `README.md`.
- [ ] T018 [US1] Cross-repository, in `reactome/WebsiteAngular` (not done here; spec FR-012): a spec or task there for the endpoint ([contracts/website-endpoint.md](contracts/website-endpoint.md)), naming this work:
  - the endpoint module in its node content service, importing this package at a pinned commit: identifier resolution with Java's 400 and 404, the diagram that holds a pathway, the reaction layout from its own reaction-layout module, Java's headers, a missing file's 500, no fallback;
  - the live comparison with Java on a local deployment (a sample of at least 60 events, SC-002, and every error case), a handful of requests at a time, spaced;
  - the routes in nginx and the dev proxy together, `routes.spec.ts` following (`.sbgn` stops being Java's neighbour);
  - the SBGN part of spec 006 T100 ticked; spec 010 T028 and T029 closed as superseded (a byte comparison cannot work, research R3);
  - after the switch, the download tab's SBGN button and Newt link and the detail page's download bar checked on the deployed site (FR-011, research R9);
  - the developer documentation's `/exporter/diagram/{id}.sbgn` corrected (research R8).

  Ticked here when WebsiteAngular's work is merged, with its pull request numbers.

**Checkpoint**: the website's SBGN comes from this exporter.

## Phase 5: User Story 4 - Every file is valid SBGN-ML (Priority: P2)

**Goal**: no file fails the schema it declares.

**Independent Test**: CI validates every fixture's output; the whole release's output validates once.

- [ ] T019 [US4] Validate every fixture's output in CI with `ci/validate.sh` (T003), in a `validate` job of `.github/workflows/ci.yml`; seen failing once by writing `stoichiometry` (D3 switched off).
- [ ] T020 [US4] Validate all of a release's output with `ci/validate.sh` and record the count (SC-003: all valid). Depends on T026.
- [ ] T021 [US4] Run libSBGN's PD rules (`sbgn_pd.sch`, XSLT 2.0) once over the release's output with libSBGN's Java validator, outside CI; record the findings in this task, and open an issue for the team for any rule Java's files already break (constitution II; research R11).

## Phase 6: User Story 2 - The release publishes the bulk file from this exporter (Priority: P2)

**Goal**: `homo_sapiens.sbgn.tar.gz` made by this exporter's command line.

**Independent Test**: the command's archive for release 98 has the published one's names and layout, and its files compare with no undeclared difference.

- [ ] T022 [P] [US2] Read the bulk list from the graph in `src/graph.ts` (Java's query, research R10; settings from the environment as pdf-export reads them), with `neo4j-driver` as a dependency; a test against a tiny fixture graph in CI's Neo4j service, as pdf-export's CI loads one.
- [ ] T023 [P] [US2] Write a flat ustar archive with gzip in `src/tar.ts`; tests in `test/tar.test.ts` that list it with the system's `tar` and compare names, sizes and contents.
- [ ] T024 [US2] Write the command line ([contracts/cli.md](contracts/cli.md)) in `src/cli.ts`: `convert`, `files`, `bulk`, the exit statuses, failures named and the run carried on; tests in `test/cli.test.ts`, including a missing diagram file (exit 1, the rest written).
- [ ] T025 [US2] Test that a pathway's bulk entry and the library's answer for the same layout are the same bytes, in `test/one-implementation.test.ts` (SC-004, constitution I).
- [ ] T026 [US2] Run `bulk` for release 98 against a private graph copy and the release's diagram files; compare the list of names with the published archive's and time the run (SC-006); record both in this task.
- [ ] T027 [US2] Write the release's step in `README.md`: the command, its inputs and its output, in place of diagram-exporter's SBGN step, with no internal detail. The release's own adoption is the release team's, after T016 and T020 pass.

## Phase 7: Polish and cross-cutting

- [ ] T028 Open GitHub issues for the team for each improvement seen and not made (constitution II, spec FR-006): classes for genes, RNA and sets; state variables for modifications; annotations and the pathway's name and id in the file; libSBGN 0.3; a bulk file for all species; and any PD rule from T021.
- [x] T029 Ask the user to decide D4, D5 and the bulk file's species. Decided by the user on 6 Nov 2026: D5, production arcs run from the reaction to the product; D4, Java's Arial widths, not the bulk file's fallback widths; the bulk file stays human only (spec Decisions). — the pull request that replaced #1
- [ ] T030 [P] Update `README.md` and `CLAUDE.md` for the library, the command line and the comparison.

## Dependencies and order

- **Setup (T001–T003)** first; T003 is needed by T019–T021.
- **Foundational (T004–T011)** blocks every story. T004, T005, T006 and T007 in parallel; T008 after T007; T009 after T006–T008; T010 after T004 and T009; T011 last.
- **US3 (T012–T016)** next: T012 and T013 in parallel, then T014, then T015. T016 needs US2's T026.
- **US1 (T017–T018)** after T015: the website should not switch before the fixtures compare clean. T018's routing waits on WebsiteAngular's own live comparison.
- **US4 (T019–T021)** after T013 and T010; T020 and T021 after T026.
- **US2 (T022–T027)** after the foundation; T026 after T022–T024.
- **Polish** last; T029 is done.

## Parallel examples

- Foundational: T004, T005, T006 and T007 together.
- US3: T012 (the harness) beside T013 (the fixtures).
- US2: T022 (the graph) beside T023 (the archive).

## Implementation strategy

1. **MVP:** Setup, Foundational and US3 to T015: a library whose output matches Java's for
   the fixtures. That is what the website needs to start its endpoint (T018).
2. **Then US1:** the website's endpoint, compared live and routed, in WebsiteAngular.
3. **Then US2 and US4 together:** the bulk file, validated and compared over a whole
   release (T016, T020, T026), before the release swaps its step.
