# Feature Specification: SBGN-ML from one TypeScript exporter, for the website and the bulk file

**Feature Branch**: `001-sbgn-export`

**Created**: 2026-11-06

**Status**: Draft

**Input**: User description: "One SBGN exporter in TypeScript, in its own repository, used both for the website on the fly (the website's node content service imports or calls it, as reactome/WebsiteAngular spec 015 does SBML through sbml-exporter) and for the release's bulk download. Learn from the Java implementation and match its output where reasonable: match today's output, fix only obvious bugs, improvements become tickets. Diagram layouts are the release's diagram files, not the graph. Stories: the website's single-event SBGN on the fly; the bulk download for a release; parity with Java's output with declared differences; validation against the SBGN-ML schema. Addition: every SBGN file the website offers today that Java's content service makes must be served by a node endpoint built on this exporter, with Java's identifier forms, errors, status codes, content type and download name, compared live against Java before it is routed, and with no fallback to Java; the website's uses of that address (the pathway browser's download tab and its Newt link, the detail page's download bar) keep working unchanged; and this exporter makes the download page's `homo_sapiens.sbgn.tar.gz`."

## Background

Reactome offers SBGN-ML (Process Description) in two ways today, both made by one Java
class, `SbgnConverter`, in `reactome/diagram-exporter` (research R1):

- **One event, on request:** the content service's `GET /exporter/event/{identifier}.sbgn`,
  its only SBGN operation. The website links to it from the pathway browser's download
  tab (with a second link that opens the file in the Newt editor) and from an event's
  detail page.
- **The bulk file:** `homo_sapiens.sbgn.tar.gz` on the download page, one file per human
  pathway that has a diagram (1,390 files in release 98), made by diagram-exporter's
  command line during the release.

Both read a diagram layout: a pathway's layout file from the release's diagram files, or,
for a reaction, a layout computed from the graph. The website's content service already
computes that reaction layout itself (reactome/WebsiteAngular spec 006, T092), in node,
identical to Java's.

What Java writes is not stable. Measured on release 98 (research R3):

- **Its order is random.** Glyphs and arcs are kept in hash tables keyed by object
  identity, so two runs on the same diagram write them in different orders.
- **Its geometry depends on that order.** Writing an output arc reverses the reaction's
  own line segments in place, so the arcs written after it read them backwards. In
  Cell Cycle Checkpoints, 7 of 253 arcs have different coordinates in the bulk file and
  in the content service's answer.
- **Its text widths depend on the machine.** Label boxes are measured in "Arial" with
  whatever fonts the machine has: the bulk file's widths are larger than the content
  service's for the same labels ("cytosol": 56 against 48).
- **It is often invalid.** 550 of the 1,390 bulk files fail the libSBGN 0.2 schema they
  declare, every failure the same: a glyph class (`stoichiometry`) that version does not
  have.

So "match today's output" (constitution II) means: the same glyphs, arcs, classes, ids,
labels and geometry as Java writes for the same diagram, compared by id rather than by
file order; with the obvious bugs above fixed and declared; and with anything better left
to issues for the team.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - A reader downloads one event's SBGN from the website (Priority: P1)

A reader on a pathway's or reaction's page clicks SBGN, on the pathway browser's download
tab or on the detail page's download bar, and gets `{stable id}.sbgn`: the event's diagram
in SBGN-ML, which their SBGN tool opens. A reader who clicks Newt on the download tab sees
the same file open in the Newt editor. The file is made by the website's own node content
service from this exporter, and Java is not asked.

**Why this priority**: it is what readers use every day, and Java's content service is
being switched off. Until this works, the website still needs Java for SBGN.

**Independent Test**: with the node content service on a local deployment, ask its
`/exporter/event/{identifier}.sbgn` for a pathway with its own diagram, a subpathway drawn
on its parent's diagram, and a reaction; the files are valid SBGN-ML and match Java's for
the same events but for the declared differences; and the status, content type, download
name and error bodies match Java's for each identifier form and error.

**Acceptance Scenarios**:

1. **Given** a pathway that has its own diagram, **When** its SBGN is asked for by stable
   id, **Then** the answer is 200, `application/sbgn+xml;charset=UTF-8`, saved as
   `{stable id}.sbgn`, and holds that diagram's compartments, entities, reactions and arcs.
2. **Given** a subpathway that is drawn on its parent's diagram, **When** its SBGN is asked
   for, **Then** the file holds the whole parent diagram, as Java's does, and is saved under
   the subpathway's own stable id.
3. **Given** a reaction, **When** its SBGN is asked for, **Then** the file is drawn from the
   reaction's own layout, the one the website's content service computes for its diagram.
4. **Given** the same event asked for by dbId, by stable id or by versioned stable id,
   **When** each answer arrives, **Then** the three files are identical and each is saved as
   `{stable id}.sbgn`.
5. **Given** an identifier that does not exist, **When** its SBGN is asked for, **Then** the
   answer is Java's 404, with Java's message.
6. **Given** an identifier of something that is not an event (a physical entity, say),
   **When** its SBGN is asked for, **Then** the answer is Java's 400, "does not correspond
   to a pathway or reaction".
7. **Given** the pathway browser's download tab, **When** the reader opens the Newt link,
   **Then** Newt loads the file from the website as it does today.

---

### User Story 2 - The release publishes the bulk SBGN file from this exporter (Priority: P2)

During a release, the person running it makes `homo_sapiens.sbgn.tar.gz` with this
exporter's command line, from the release's graph and diagram files, and publishes it on
the download page as today. Readers who download it get the same files, named and laid out
as before.

**Why this priority**: the bulk file is the other half of what Java makes today, and once
both come from this exporter one fix reaches both (constitution I). It can follow the
website because the release's Java step keeps working until it is swapped.

**Independent Test**: run the command line for release 98 against a private copy of its
graph and its diagram files, and compare the archive with the published one: the same
file names, one per human pathway with a diagram, flat in the archive, each matching
Java's file but for the declared differences.

**Acceptance Scenarios**:

1. **Given** a release's graph and diagram files, **When** the command line is run for
   the bulk file, **Then** it writes `homo_sapiens.sbgn.tar.gz` holding one
   `{stable id}.sbgn` per human pathway that has a diagram, at the archive's top level,
   and nothing else.
2. **Given** a pathway whose diagram file is missing or unreadable, **When** the bulk run
   reaches it, **Then** the run carries on with the others, names every pathway it could not
   write, and exits with a failure status, as Java's does.
3. **Given** the same release, **When** the bulk file's entry for a pathway and the
   website's answer for that pathway are compared, **Then** they are identical byte for
   byte.

---

### User Story 3 - A maintainer proves the files match Java's but for declared differences (Priority: P1)

Before the website's address is routed to node and before the release swaps its step, a
maintainer compares this exporter's files with Java's, for a sample of events and for the
whole published bulk file, and sees only the differences this spec declares.

**Why this priority**: constitution II. The switch is a change of implementation, not of
what readers get, and only a comparison shows that. It gates both other stories.

**Independent Test**: run the comparison over the published bulk file of a release and
over the content service's answers for a sample of events on a local deployment; it
reports each difference by glyph or arc id and kind, and the only kinds reported are the
declared ones.

**Acceptance Scenarios**:

1. **Given** this exporter's file and Java's for the same diagram, **When** they are
   compared, **Then** they are compared by glyph and arc id, not by file order, and every
   difference is reported with its kind.
2. **Given** a difference of a kind this spec does not declare, **When** the comparison
   finds it, **Then** the comparison fails and names it.
3. **Given** a release's published bulk file, **When** all of it is compared with this
   exporter's files for the same release, **Then** no file has an undeclared difference.

---

### User Story 4 - Every file is valid SBGN-ML (Priority: P2)

A tool that validates SBGN-ML accepts every file this exporter writes.

**Why this priority**: constitution IV. A third of today's bulk files fail the schema
they declare; readers' tools may refuse them.

**Independent Test**: validate the exporter's files for the fixtures in CI, and for the
whole bulk file of a release once, against the libSBGN schema the files declare.

**Acceptance Scenarios**:

1. **Given** any file this exporter writes, **When** it is validated against the schema its
   namespace names, **Then** it passes.
2. **Given** the exporter's output for the fixtures, **When** CI runs, **Then** it is validated
   and a failure fails the build.

### Edge Cases

- **A reaction drawn twice on one diagram:** Java names a reaction's two ports by the
  reaction's dbId alone, so a second drawing would repeat their ids. No release 98 file
  has a repeated id; the exporter keeps Java's names, and the validation catches a repeat
  if one ever appears.
- **Faded-out or crossed-out objects** (a disease diagram's normal reactions, a crossed-out
  entity): Java leaves out a node that has either mark and an edge that is faded out, and
  arcs to those; the exporter does the same. Compartments are always written.
- **A participant whose line has no segments:** Java writes the arc without its start and
  end, which is invalid. None appears in release 98; the exporter refuses to write an
  invalid arc and names it.
- **Labels with characters XML must escape** (`&`, `<`, `>`, `"`), and names outside ASCII:
  written as Java writes them (32 of release 98's files have escapes).
- **An event with no diagram at all** (a pathway whose diagram file is missing): the
  website answers as Java does for a missing file, a 500, and the bulk run reports it
  (US2 scenario 2). Neither falls back to anything else.
- **An identifier with a version that is not the current one**, or with `.sbgn` inside it:
  resolved as Java resolves it.
- **The documented `/exporter/diagram/{id}.sbgn`:** Java has no such operation (it answers
  500, "Unsupported file extension sbgn"); the website's developer documentation names it
  by mistake. It is not added here (research R8).

## Requirements _(mandatory)_

### Functional Requirements

**The conversion**

- **FR-001**: The exporter MUST turn a diagram layout (a pathway's diagram file, or a
  reaction's layout as the website's content service computes it) into one SBGN-ML
  Process Description document, with libSBGN 0.2's namespace, as Java does.
- **FR-002**: For the same layout, the document MUST hold the same glyphs, arcs, ports,
  classes, ids, labels, boxes, points and nesting as Java's, except for the differences
  declared in FR-003. The mapping is research R2's.
- **FR-003**: The exporter MUST differ from Java's output only in these declared ways,
  each an obvious bug (constitution II), with each recorded in the comparison's list of
  kinds:
  - **D1, order:** glyphs and arcs are written in a fixed order derived from the layout,
    not Java's random one;
  - **D2, arc geometry read from the unaltered layout:** every arc's points are taken
    from the layout as it is in the file, not from segments an earlier arc reversed;
  - **D3, the stoichiometry glyph's class:** `cardinality`, which libSBGN 0.2 has, in
    place of `stoichiometry`, which it does not;
  - **D4, text widths:** the label boxes' widths are those Java measures with Arial, the
    font it asks for, on every run, not whatever font the machine has;
  - **D5, output arcs' points in the arc's own direction:** a production arc's points run
    from its source (the reaction) to its target (the product). Java reverses the middle
    points but not the start and end (research R3.5). _Default, awaiting the user's
    confirmation (Assumptions)._
- **FR-004**: The exporter MUST write the same bytes for the same layout on every run and
  on every machine.
- **FR-005**: The exporter MUST write numbers, the XML declaration, attribute order,
  indentation, escapes and line ends as Java's libSBGN writer does, so that a file without
  declared differences is identical to Java's byte for byte once glyphs and arcs are put in
  the same order.
- **FR-006**: Anything that would improve the files beyond FR-003 (for example classes for
  genes and sets, state variables for modifications, annotations, a newer libSBGN version)
  MUST NOT be done here; each becomes a GitHub issue for the team.

**The website's operation**

- **FR-007**: `GET /ContentService/exporter/event/{identifier}.sbgn` MUST be answered by
  the website's node content service, built on this exporter, with no fallback to Java for
  any request, an error included.
- **FR-008**: It MUST accept Java's identifier forms (stable id, versioned stable id and
  dbId) and resolve each as Java does: a pathway to the diagram that draws it (its own, or
  its parent's), a reaction to its own layout.
- **FR-009**: Its answers MUST match Java's: for a file, 200, `application/sbgn+xml;charset=UTF-8`,
  `Content-Disposition: attachment; filename="{stable id}.sbgn"` and the
  `Access-Control-Allow-Origin: *` header every answer of the service carries; for an
  unknown identifier, 404; for one that is not an event, 400; for a missing diagram file,
  500; each error with Java's envelope and message.
- **FR-010**: It MUST be compared live with Java's answers on a local deployment, for a
  sample of events and every error case, before it is routed to node, and the routes MUST
  change in the website's deployed and local route tables together.
- **FR-011**: The website's links to that address MUST keep working unchanged: the pathway
  browser's download tab, its Newt link, and the detail page's download bar.
- **FR-012**: The website's part of this (the endpoint, its routes, its cache and its
  comparison) MUST be specified and tracked in `reactome/WebsiteAngular`'s specs, and this
  repository's tasks MUST name it as cross-repository work.

**The bulk file**

- **FR-013**: The exporter MUST have a command line that writes a release's
  `homo_sapiens.sbgn.tar.gz`: one `{stable id}.sbgn` per pathway of Homo sapiens with a
  diagram, as the graph lists them, at the archive's top level.
- **FR-014**: The command line MUST also write the same files into a folder, for a list of
  pathways or for a species, so that a single pathway's file can be made and checked.
- **FR-015**: The command line MUST read the release's graph only for the list of pathways,
  and the release's diagram files for the layouts, with the graph's address and credentials
  taken from the environment, and no relational database.
- **FR-016**: A pathway it cannot write MUST be named, the run MUST carry on with the
  rest, and the run MUST end with a failure status if any was not written.

**Proof**

- **FR-017**: The repository MUST have a comparison that reads two SBGN-ML files and reports
  their differences by glyph and arc id and by kind, failing on any kind not declared in
  FR-003.
- **FR-018**: Every file written for the fixtures MUST be validated in CI against libSBGN
  0.2's schema; the whole bulk file of a release MUST be validated once before the release
  swaps its step.
- **FR-019**: Fixtures MUST be small layouts made for the purpose or cut from a release's
  public diagram files, with no people's names.

### Key Entities

- **Diagram layout**: the JSON the release publishes as `diagram/{stId}.json` for a pathway,
  and the website's content service computes for a reaction; its compartments, nodes (with
  their attachments and connectors) and edges (reactions, with their shapes and segments).
  The exporter's only input for one document.
- **SBGN-ML document**: one `<sbgn>` with one Process Description `<map>`: compartment,
  entity and process glyphs, with ports, units of information and cardinality glyphs, and
  the arcs between them.
- **Event**: a pathway or reaction-like event in the graph, named by dbId or stable id;
  the website's operation resolves it to a diagram layout.
- **Bulk archive**: `homo_sapiens.sbgn.tar.gz`, flat, one document per human pathway with a
  diagram.
- **Declared difference**: one of FR-003's kinds, with its reason and evidence; the
  comparison's list of what may differ from Java.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: For every one of release 98's 1,390 published bulk files, this exporter's file
  for the same pathway differs only in declared kinds, and in nothing at all once those are
  set aside.
- **SC-002**: For a sample of at least 60 events (pathways with their own diagrams,
  subpathways, reactions, disease and drug diagrams, and the largest diagram), the website's
  node answer matches Java's local answer in status, content type, download name and body,
  but for declared differences; and every error case matches Java's byte for byte.
- **SC-003**: 100% of the files the exporter writes for a release pass the libSBGN 0.2
  schema, against Java's 60% (840 of 1,390).
- **SC-004**: Two runs of the exporter on the same input, on different machines, write
  identical bytes; the bulk entry and the website's answer for the same pathway are
  identical.
- **SC-005**: A reader's SBGN download is no slower than today's first, uncached answer:
  under 2 seconds for the largest pathway diagram of the release.
- **SC-006**: The bulk file for a release is written in under 15 minutes.
- **SC-007**: After the switch, no SBGN request reaches Java: the website's route tables
  send the address to node, and the deployed site's SBGN buttons and Newt link work.

## Assumptions

- **Human only, as today.** The bulk file stays `homo_sapiens.sbgn.tar.gz`, the human
  pathways with diagrams, which is what the download page offers. SBGN for other species is
  available per event on the website; a bulk file for all species would be an improvement,
  an issue for the team.
- **D4, Arial's widths.** Java asks for Arial at 16 points and gets whatever the machine
  has. The content service's answers measure with Arial; the release's bulk run evidently
  did not. The exporter uses Arial's widths, as the website's content service already does
  for reaction layouts.
- **D5 is a default, for the user to confirm.** Today's production arcs start at the
  product and end at the reaction while naming the reaction as their source, with their
  middle points reversed. That reads as half of a reversal Java meant to make; this spec
  takes it as an obvious bug and fixes it. If the user decides otherwise, D5 is dropped and
  the exporter writes Java's points.
- **The website imports the exporter** as a pinned dependency rather than calling a
  separate service (research R6): it is TypeScript, small, fast and has no Java to host.
- **Reaction layouts come from the website.** The exporter does not lay out reactions. The
  website's content service passes in the layout it already computes, identical to Java's.
  The bulk file has no reactions.
- **Java keeps answering until the switch,** and the release's Java step keeps running
  until the bulk comparison (SC-001) and validation (SC-003) pass.
- **The libSBGN version stays 0.2**, which is what Java writes and readers' tools accept.
