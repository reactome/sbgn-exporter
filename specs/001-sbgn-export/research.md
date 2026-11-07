# Research: SBGN-ML from one TypeScript exporter

Measured and read on 6 Nov 2026, against release 98. Java's sources are read from
`reactome/diagram-exporter` (`src/main/java/org/reactome/server/tools/diagram/exporter/sbgn/`:
`SbgnConverter`, `Participant`, `ShapeWrapper`, unchanged since June 2022; the content
service runs the 2.0.12 jar) and `reactome/content-service`
(`SbxxExporterController.eventSBGN`, `ExportManager`). Reference files are the content
service's answers on a local deployment (a handful, spaced) and the release's published
`homo_sapiens.sbgn.tar.gz`. None of them is committed.

## R1. What makes SBGN today

**The website's operation.** `GET /exporter/event/{identifier}.sbgn` is the content
service's only SBGN operation.

- It finds the event by dbId or stable id (versioned too). Something that is not an event
  answers 400, "The identifier '…' does not correspond to a pathway or reaction" (the
  operation's own documentation says 422; it answers 400). An unknown identifier answers
  404, "Identifier '…' not found". Both in the service's JSON envelope.
- A pathway is drawn from the diagram that holds it (graph-core's `getDiagramResult`): its
  own diagram file, or its parent's for a subpathway. The whole diagram is written, with no
  highlighting: R-HSA-69615's file has exactly R-HSA-69620's 295 glyphs, under its own
  name.
- A reaction-like event is drawn from reaction-exporter's layout, computed from the graph.
  The website's node content service already computes that layout, identical to Java's
  (WebsiteAngular spec 006 T092, `tools/content-node/reaction-layout/`).
- The answer is `application/sbgn+xml;charset=UTF-8` with
  `Content-Disposition: attachment; filename="{stId}.sbgn"`, whatever form the identifier
  took, and `Access-Control-Allow-Origin: *`.
- The first answer for an event is written to a cache folder per release and served from
  it ever after. A missing diagram file is a null passed to the converter: a 500 that names
  nothing (WebsiteAngular `e2e/release/sbgn-export.spec.ts`).

**The bulk file.** diagram-exporter's command line, `--format sbgn --target 'Homo sapiens'`,
lists `MATCH (p:Pathway{hasDiagram:True, speciesName:$speciesName}) … ORDER BY p.dbId`,
reads `{stId}.json` from the release's diagram folder for each, and writes `{stId}.sbgn`.
A pathway that fails is logged and the run exits 1. The files are archived flat as
`homo_sapiens.sbgn.tar.gz`. Release 98's archive: 1,390 files, 4.7 MB, no folders.

**Decision:** this exporter replaces both, from one conversion (constitution I).

## R2. The mapping

| Layout object                                               | SBGN-ML                                                                                                                                                                                                   |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compartment                                                 | glyph `compartment`, id `compartmentVertex_{reactomeId}_{id}`, `compartmentOrder="10.0"`, label with a box at `textPosition` (width measured, height 24), bbox                                            |
| Node, `renderableClass` starting `Complex`                  | glyph `complex`                                                                                                                                                                                           |
| … `Protein`                                                 | `macromolecule`                                                                                                                                                                                           |
| … `Chemical`                                                | `simple chemical`                                                                                                                                                                                         |
| … `Process`, `EncapsulatedNode`                             | `submap`                                                                                                                                                                                                  |
| anything else (sets, genes, RNA, other entities)            | `unspecified entity`                                                                                                                                                                                      |
| Node id                                                     | `entityVertex_{reactomeId}_{id}`, label `displayName` with no box, bbox from `prop`                                                                                                                       |
| Node attachment                                             | child glyph `unit of information`, id `entityVertex_{reactomeId}_{n}_mt` (n counts across the document from 1), label (`mt:prot` if none), box at `shape.a`, width measured, height 16                    |
| Edge                                                        | glyph `process`; `association` for a CIRCLE shape, `dissociation` for DOUBLE_CIRCLE; `omitted process` if the shape's text is not empty (an empty text gives `process`), `uncertain process` if it is `?` |
| Edge id and ports                                           | `reactionVertex_{reactomeId}_{id}`; ports `reactionVertex_{reactomeId}.1` and `.2`, placed by the rule in `getEdgeGlyph`                                                                                  |
| Connector INPUT / OUTPUT / CATALYST / INHIBITOR / ACTIVATOR | arc `consumption` (node → port 1) / `production` (port 2 → node) / `catalysis` / `inhibition` / `stimulation` (node → process glyph)                                                                      |
| Arc id                                                      | `arc_{node id}_{type lower case}_{edge id}`                                                                                                                                                               |
| Connector stoichiometry with a shape                        | child glyph of the arc, id `Stoichiometry_{node reactomeId}_{TYPE}_{edge reactomeId}`, label the value                                                                                                    |
| Faded-out or crossed-out node, faded-out edge               | left out, with their arcs (a present `false` counts as present: Java tests for null)                                                                                                                      |
| Links, shadows, notes, the diagram's name and id            | not written                                                                                                                                                                                               |

Release 98's bulk files hold 14,880 simple chemicals, 14,738 complexes, 10,078
macromolecules, 7,914 unspecified entities, 7,583 processes, 6,085 associations, 4,798
stoichiometry glyphs, 3,743 compartments, 3,075 units of information, 2,365 omitted
processes, 2,142 submaps, 735 uncertain processes and 391 dissociations.

**Decision:** port the mapping as it is (constitution II). Better classes (`nucleic acid
feature` for genes, `state variable` for modifications) and annotations are issues for
the team, not changes here.

## R3. What is unstable or wrong in Java's output

Compared: the bulk file's `R-HSA-69620.sbgn` against the content service's answer for the
same pathway in the same release.

1. **Order.** The glyphs (after the compartments) come from a `HashMap` keyed by layout
   objects, and the arcs from a `HashSet` of participants. None of those classes overrides
   `hashCode`, so the order is set by identity hashes and changes from run to run. The two
   files' glyph and arc order differ throughout.
2. **Arc geometry follows that order.** For an OUTPUT, `Participant.getArcNextList`
   reverses `edge.getSegments().subList(0, size)` with `Collections.reverse`
   (Participant.java:98-99). A sublist is a view, so the reaction's own segment list (its
   "backbone") is reversed in place, once for every OUTPUT arc written. Every later read of
   that list by an arc of the same reaction sees it as given or reversed, depending on how
   many of its OUTPUT arcs Java happened to write first. The reads that depend on it:
   - an INPUT without segments of its own: its start and end from `subList(0, 1)`, and its
     next points from the walk over the backbone;
   - an INPUT with segments of its own: its next points too, which go on from its own
     segments' to the walk over the backbone (`getArcNextList` walks it for every INPUT;
     seen in Java's own answers, T008);
   - a CATALYST, INHIBITOR or ACTIVATOR without segments of its own: its start and end from
     the whole backbone;
   - an OUTPUT with segments of its own: its next points, from the walk over the backbone it
     has just reversed;
   - an OUTPUT without segments of its own: 6 below.

   7 of 253 arcs in the two files have different points. **Fix (D2):** every arc is
   computed from the backbone as the layout gives it, as Java computes an arc of a reaction
   none of whose OUTPUT arcs has been written yet; Java's reversal is made on a copy.

3. **Text widths.** Labels are measured with `new Font("Arial", PLAIN, 16)` through AWT
   font metrics. The bulk file's widths differ from Arial's, which the content service's
   answers have; they are larger (a unit of information "P": 10 against 11; "cytosol": 56
   against 48; "nucleoplasm": 97 against 87). The content service's are Arial's.
   **Fix (D4), decided by the user on 6 Nov 2026:** Java's Arial widths, as the content
   service's answers have them, always; not the bulk file's widths. So that D4 cannot hide a
   width error, the comparison accepts it only in its bulk mode, against the published bulk
   file; every other comparison, including one over a whole release against Java's own
   answers measured with Arial (task T032), expects identical widths. WebsiteAngular's reaction-layout port already
   measures Arial from a table taken from Java (spec 006 T092, `text-widths.ts`); this
   repository takes its own table for Arial plain 16 the same way (R5).
4. **Invalid files.** Validated with libxml2 against libSBGN 0.2's `SBGN.xsd`
   (`milestone2`), 550 of 1,390 bulk files fail, all for one reason: the glyph class
   `stoichiometry`, which 0.2 does not have (0.3 added it). Java's own comment names the 0.2
   class, `cardinality`. **Fix (D3):** write `cardinality`.
5. **Production arcs run backwards.** Java names port 2 as the source and the product as the
   target, but its start point is the connector's first point, at the product, and its end
   the connector's last, at the reaction; only the middle points are reversed. R-HSA-6805479:
   start (455, 185) at the product, next (299, 162.5), next (374, 185), end (299, 162.5). A
   reader drawing it goes from the product to the reaction, back out and in again.
   **Fix (D5), decided by the user on 6 Nov 2026:** for an OUTPUT with segments of its own,
   our start is Java's end, our end is Java's start, and the next points are Java's,
   unchanged. In R-HSA-6805479: start (299, 162.5), next (299, 162.5), next (374, 185), end
   (455, 185). An OUTPUT without segments of its own is 6's, not D5's.
6. **Output arcs that are a single point.** An OUTPUT without segments of its own takes
   `edge.getSegments().subList(1, 2)`, or the whole backbone when it has one segment
   (Participant.java:39-40). That sublist is a view too. `getArc` reads `start` from it
   (SbgnConverter.java:294-297) before `getArcNextList` reverses the backbone in place, and
   `end` after (SbgnConverter.java:302-305). With the backbone `s0, s1, …` as given when the
   arc starts:
   - **one segment:** start `s0.from`, end `s0.to`; reversing one segment changes nothing;
   - **two segments:** start `s1.from`, end `s0.to`. The two segments meet at the reaction,
     so start and end are the same point, with no next points: 32 of R-HSA-69620's 94
     production arcs. With the backbone reversed when the arc starts (D2), start `s0.from`
     and end `s1.to` instead, a line through the whole reaction;
   - **three or more segments:** start `s1.from`, end the second segment of the reversed
     list, `s(n-2).to`.

   **How often, and which segment leads to the product.** Measured on 7 Nov 2026 over 40 of
   release 98's diagram files (every 35th name of the bulk file's 1,390): 605 OUTPUT arcs,
   320 with segments of their own and 285 without. Of those 285, the backbone has two
   segments 281 times, three twice, four twice, and never one or five or more. Writing T
   for a segment that touches the reaction's shape (`ShapeWrapper`) and - for one that does
   not, the two-segment backbones are all `TT` (into the box, out of it), the three-segment
   ones `-TT`, and the four-segment ones `TT--` and `-TT-`. In every one, the backbone runs
   from the box to the product from its last segment that touches the shape, and ends at
   the product: its last segment's `to` is within 6 units of the product's box, and no
   other segment is nearer to it. Java's `s1` is that segment only on a backbone of one or
   two segments; on the three-segment ones it is the segment that leads into the box from
   the input side.

   **Fix (D6), decided by the user on 6 Nov 2026:** draw these arcs along the reaction's
   output segment to the product. In terms of the layout: the backbone from its last
   segment that touches the reaction's shape (`sK`, by `ShapeWrapper`'s test) to its last
   segment (`sN`). The start is `sK.from`, at the reaction; the next points are the `from`
   of each segment after `sK`, in order, which is exactly what Java's walk over a reversed
   copy of the backbone gives; the end is `sN.to`, at the product. A backbone none of whose
   segments touches the shape is refused, as Java's `getEdgeGlyph` refuses it. D5 is not
   applied: the arc already runs from the reaction to the product.

   The rule was first written as "start and end on the segment Java picks" (`s1`, or `s0`
   for one segment), and ported so in T008. That is the same on a backbone of one segment
   and on a two-segment one whose second segment touches the shape (every one measured).
   It is not on three or more: on the measured `-TT` it drew the arc along the segment into
   the box, and on a `TT-` it stopped at the end of `s1`, short of the product. Corrected
   on 7 Nov 2026 to follow the decision; not a new decision.

7. **How D2, D5 and D6 compose.** Ours are computed in three steps:
   1. **D2:** the backbone as the layout gives it, with every reversal made on a copy;
   2. **D6:** for an OUTPUT without segments of its own, start at the `from` of the
      backbone's last segment that touches the shape and end at the backbone's last `to`,
      as above; the next points stay Java's;
   3. **D5:** for an OUTPUT with segments of its own, start and end swapped.

   Every other arc is D2 alone. **The comparison** (R12) recomputes Java's possible
   readings of each arc from the layout: the backbone as given or reversed when the arc
   starts, and, for an OUTPUT, reversed once more partway through the arc, as Java does. It
   accepts Java's points only if they equal one of those readings exactly, and ours only if
   they equal the reading with the backbone as given, with D6 and D5 applied. Any other
   change of points is undeclared, with or without the layout.

No other kind of difference was seen between the two files: classes, ids, labels, boxes
and ports are identical. Release 98 has no repeated ids and no arc without points.

**Not yet checked: the bulk file's text encoding.** diagram-exporter's command line reads
each diagram file with `Charset.defaultCharset()` (Main.java:258), so on a machine whose
default is not UTF-8, names outside ASCII would be misread. The bulk file has 139 such
labels. Before SC-001 they are checked against the diagram files' names (task T034); a
mismatch is brought to the user as a candidate declared difference, not fixed silently.

**Decision:** D1 (a fixed order) to D6 are the declared differences (spec FR-003).
Everything else matches Java byte for byte once order is set aside.

## R4. Writing as libSBGN 0.2 writes

Java writes through `SbgnUtil.writeToFile` (JAXB). From the files:

- `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`, then
  `<sbgn xmlns="http://sbgn.org/libsbgn/0.2">`, `<map language="process description">`;
  four spaces per level; LF line ends; a final newline.
- Attribute order: glyph `class`, `id`, `compartmentOrder`; bbox `w`, `h`, `x`, `y`; port
  `id`, `x`, `y`; arc `class`, `id`, `source`, `target`; points `x`, `y`.
- Child order: a glyph's `label`, `bbox`, child glyphs, ports; an arc's child glyphs,
  `start`, `next`s, `end`. A label with no box is self-closed.
- Numbers are Java floats (`floatValue()` of the layout's doubles) written by
  `Float.toString`: `48.0`, `228.5`, and digits such as `1234.5677` where the float is not
  the double. The bulk files hold 12,627 values with four or five decimals and 316
  with six. JDK 11's
  `Float.toString` is not always the shortest form; the port follows JDK 11's algorithm
  and is checked against every number in a release's bulk file (FR-005).
- Escapes in attribute values: `&amp;`, `&lt;`, `&gt;`, `&quot;` (release 98: 11, 76, 481
  and 18). Names outside ASCII (139 labels) are written as UTF-8. JAXB 2.3, which libSBGN's
  `SbgnUtil.writeToFile` marshals with, also writes a line feed as `&#10;` and a carriage
  return as `&#13;`, a tab and every other character as it is, and the float infinities as
  `INF` and `-INF` (seen in its own output, T010). It writes a control character XML 1.0
  cannot hold as it is too, into a file no parser reads; the writer refuses such text
  instead (constitution IV). Release 98 has none: checked on 7 Nov 2026 over its whole
  published bulk file, every label Java wrote from the diagram files (1,390 files, 78,527
  labels, all valid UTF-8), not one holds such a character, so the refusal changes no file.

**Decision:** a small writer of our own, no XML library: the output's shape is fixed and
small, and an exact match needs control of every byte.

## R5. Text widths

Java's `FontMetrics.stringWidth` with the default rendering context sums each character's
integer advance for Arial plain at 16 points. The widths it gives are those of the content
service's answers (R3.3).

**Decision:** a table of Arial plain 16 advances, taken once from Java on a machine with
Arial (as WebsiteAngular's reaction-layout port took its table), committed with the
program that made it, and checked against every label box in a set of the content
service's answers (task T033) and against a whole release measured by Java with Arial
(task T032). A character outside the table is measured as Java measures a missing
glyph, which the table also records.

**Measured (T006):** Java 11's `stringWidth` (`FontDesignMetrics`) adds each UTF-16 code
unit's advance only while every one is "simple"; a string holding a combining mark, a
complex script's letter, a bidi or joiner control or a surrogate it lays out whole with a
`TextLayout`, where Arabic shaping and combining marks make a width depend on its
neighbours. The table holds the simple code units' widths and the ranges of the others,
and the exporter refuses a label holding one of the others rather than write a width
Java would not. None of release 98's labels has one.

**Alternatives:** measuring with a font file at run time (needs the font, which is not
under a loose licence, and its hinting differs from Java's); copying WebsiteAngular's
table (a different size and purpose, and a dependency on another repository).

## R6. How the website uses the exporter

Spec 015 runs SBML in a Java service because sbml-exporter is Java. This exporter is
TypeScript, has no dependencies at run time, and converts a diagram in milliseconds.

**Decision:** the website's node content service imports this package, pinned to a
commit, and calls it in its own process. No separate service, no network hop, nothing new
to deploy or monitor.

- Node does not strip types from files under `node_modules`, so the package ships compiled
  JavaScript and type declarations: `npm run build` (tsc) writes `dist/`. CI builds it on
  each push to main and commits it to the `dist` branch, which the website installs at a
  pinned commit with no build of its own (T001, T018): a `prepare` build would need
  TypeScript and the dev dependencies wherever the website installs, and would not run
  under `--ignore-scripts`. The repository's own tests keep running the TypeScript.
- The library takes a parsed layout and returns the document as a string. Reading files,
  resolving identifiers and HTTP are the caller's.

**Alternatives:** a small HTTP service (like spec 015's) adds a container, a port and a
failure mode for no gain; publishing to npm is possible later, but a pinned commit is what
the website already does for its own libraries.

## R7. The website's operation, in WebsiteAngular

The endpoint is WebsiteAngular's work (spec FR-012), tracked there. What it has to do, for
its spec:

- resolve the identifier as Java does, with Java's 400 and 404 (content-node already has
  the event lookup and graph-core's `getDiagramResult` port, `diagramResult`);
- for a pathway, read the diagram file the site already serves for the pathway browser; for
  a reaction, take the layout from its own `reaction-layout` module, in process;
- answer with R1's headers; a missing diagram file is Java's 500, with no fallback;
- be compared live with Java on a local deployment (a sample and every error, spaced)
  before the routes move, in nginx and the dev proxy together, with `routes.spec.ts`
  following (`.sbgn` is today listed as Java's neighbour there);
- tick the SBGN part of spec 006 T100, and close spec 010 T028 and T029, whose byte
  comparison cannot work: Java's own two runs differ (R3).

## R8. Every SBGN file the website offers

Searched in WebsiteAngular's `projects/` (6 Nov 2026):

- `projects/pathway-browser/src/app/details/tabs/download-tab/download-tab.component.ts`:
  the SBGN button (`/exporter/event/{id}.sbgn`) and the Newt link (the same address passed
  to Newt). Both only for pathways: the tab's id is the pathway's, or a selected pathway's.
- `projects/website-angular/src/app/content/detail/detail-download-bar/`: the SBGN button
  for any event, pathways and reactions, with `download="{stId}.sbgn"`.
- `projects/website-angular/src/app/download-data/download-data.data.ts`: "SBGN (Human)",
  `homo_sapiens.sbgn.tar.gz` from the release's download folder.
- A news item links the same bulk file.
- `content/documentation/dev/diagram.mdx` lists `.sbgn` among
  `/exporter/diagram/{stId}.{ext}`'s formats. Java has no such operation: it answers 500,
  "Unsupported file extension sbgn". The page is wrong; that is a WebsiteAngular
  documentation fix, not an operation to add (constitution II).

No other SBGN file is offered.

## R9. Newt

The download tab's Newt link is `https://web.newteditor.org/?URL={address}&inferNestingOnLoad=true&mapColorScheme=opposed_red_blue&fitLabelsToNodes=true`,
with the address unencoded, so the three options are Newt's own and the file Newt fetches
is the plain `/exporter/event/{id}.sbgn`. Whatever Newt needs from the answer (a
cross-origin header if it fetches from the reader's browser; the media type; the body) is
what Java sends today, and the node answer keeps all of it (FR-009).

**Decision:** keep Java's headers exactly, and check the Newt link by hand on the deployed
site after the switch, with a pathway that has compartments and modifications (Newt's
`inferNestingOnLoad` reads the compartment boxes). How Newt fetches is not assumed.

## R10. The bulk command line

- **The list:** Java's query, `Pathway{hasDiagram:true, speciesName:$species}`, ordered by
  dbId, over Bolt with the graph's address and credentials from the environment
  (`NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`, as pdf-export reads
  them), through `neo4j-driver` (Apache-2.0). It is a development dependency: the release
  runs the command line from a checkout after `npm ci`, and the `dist` branch's
  `package.json`, which drops development dependencies, then installs nothing of it for the
  website (T017). The query returns each pathway's `stId` and `dbId` in place of the whole
  node (T022).
- **The layouts:** `{stId}.json` from a diagram folder given on the command line.
- **The archive:** written by the command itself, as a flat ustar archive compressed with
  `node:zlib`: entries `{stId}.sbgn` at the top level, mode 0644, owner 0, in name order,
  as the published archive's are (decided 7 Nov 2026).
  No tar dependency: the format's subset needed here is small, and the archive is checked
  by listing it with the system's `tar`.

  Release 98's published archive, read on 7 Nov 2026, differs in its headers only: GNU
  tar's format (magic `ustar  `) where ours is POSIX ustar; the build account's owner,
  group and their names where ours are 0 and empty; each file's own time, a few seconds
  apart, where ours is one time given. Its entries are in name order (a folder's sorted
  listing), and the command writes ours in the same order (T024): the list's dbId order
  decides only which pathways are written. Its 1,390 files written by `src/tar.ts` in its
  order are listed and extracted by GNU tar 1.35 and read by Python 3.12's `tarfile` with
  the same names, sizes, order and contents as the published archive (T023).

- **Failures:** each pathway that fails is named on standard error, the run continues, and
  it exits 1 if any failed, as Java's does.

## R11. Validation

- **The schema:** libSBGN 0.2's `SBGN.xsd`, from libSBGN's repository at the `milestone2`
  tag (commit `5c186ad4`, blob `2b7072cb`), fetched in CI and checked by hash rather than
  committed, and run with `xmllint --schema` (libxml2, installed with apt in CI).
- **The PD rules:** libSBGN's `sbgn_pd.sch` needs an XSLT 2.0 processor (it uses
  `distinct-values`); libxml2's XSLT 1.0 cannot run it. They are run once over a release's
  output with libSBGN's own Java validator, outside CI, and their findings recorded; a rule
  Java's files already break is an issue for the team, not a fix here (constitution II).
  Done (T021): `ci/reference/schematron/` runs libSBGN 0.2's pipeline with Saxon-HE, fetched
  by hash for the run and never a dependency. Release 98, ours and the published files
  alike: 122 failed assertions of three rules (pd10104, pd10108, pd10131), on the same
  objects; none of ours alone.

## R12. The comparison

A program in this repository, `ci/compare.ts`, parses two documents and compares glyph by
glyph and arc by arc, by id: class, label, boxes, ports, child glyphs, source, target and
points. Attribute values are compared as the strings written, never as numbers, since
FR-005 is about bytes: `48.0` and `48` differ. Each difference is given a kind: D1 to D6
when it is explained by a declared difference, "undeclared" otherwise. It fails on any
undeclared one.

- **Points (D2, D5, D6)** need the layout: a points difference is declared only if Java's
  points are one of its possible readings and ours the deterministic one (R3.7). Without
  the layout, any points difference is undeclared.
- **Widths (D4)** are declared only in bulk mode (`--bulk`), against the published bulk
  file. Everywhere else a width difference is undeclared, so the table's errors show. Parsing uses `saxes` (ISC), a small streaming parser, in the comparison only;
  the exporter itself has no dependency.

It runs over:

- the fixtures, against Java's answers for them, in CI;
- a release's published bulk file, all of it, once, in bulk mode (SC-001): names, the
  list, classes and everything else checked, widths excepted;
- a whole release's Java answers measured with Arial (T032), without bulk mode: widths
  checked;
- the website's sample, in WebsiteAngular, against the content service's answers.

## R13. Java's answers for the fixtures

Java's converter cannot be fed a layout through the content service. **Decision:** a small
harness under `ci/reference/` runs diagram-exporter 2.0.12's `SbgnConverter` on a layout
file in a container (Java 11, with Arial, run with no network), and writes its answer.
It can also run over a whole folder of layouts (T032). It is run by hand when a
fixture is added, never in CI, and its answers are committed beside the fixtures. Being
Java's, they carry Java's random order and D2's variation: the comparison expects both.

Built (T012) as `ci/reference/harness/`: `Harness.java`, built into an image whose jars
(diagram-exporter 2.0.12, diagram-reader 1.2.5, libSBGN 0.2, Jackson, JAXB 2.3.0) are
fetched at build time from the repositories `pom.xml` names and checked against
`jars.sha256`, and run by `run.sh` with `--network none`. Arial is not in the image: its
licence (Microsoft's core fonts) allows only the original installer to be redistributed,
so the host's font file is mounted read only, its SHA-256 printed with the run, and the
harness refuses to run if Java's "Arial" is not Arial. Its modes write Java's answer as the
content service writes it, the same in the fixed order (D1, D3), the map as sorted JSON,
a document model through libSBGN's writer, and arc points read fresh or in order.
