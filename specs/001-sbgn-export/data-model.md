# Data Model: SBGN-ML from one TypeScript exporter

## Diagram layout (input)

The JSON of a release's `diagram/{stId}.json`, and of the website's reaction layout
(WebsiteAngular `/exporter/reaction/{id}/diagram`). Only the fields the conversion reads
are typed; others are ignored.

| Object      | Fields read                                                                                                                               |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Diagram     | `stableId`, `compartments[]`, `nodes[]`, `edges[]` (`links`, `shadows`, `notes` are not read)                                             |
| Compartment | `id`, `reactomeId`, `displayName`, `prop {x, y, width, height}`, `textPosition {x, y}`                                                    |
| Node        | `id`, `reactomeId`, `displayName`, `renderableClass`, `prop`, `isFadeOut?`, `isCrossed?`, `nodeAttachments[]?`, `connectors[]`            |
| Attachment  | `reactomeId`, `label?`, `shape.a {x, y}`                                                                                                  |
| Connector   | `edgeId`, `type` (INPUT, OUTPUT, CATALYST, INHIBITOR, ACTIVATOR), `segments[]?`, `stoichiometry {value, shape? {a, b}}`                   |
| Edge        | `id`, `reactomeId`, `displayName`, `isFadeOut?`, `reactionShape`: `BOX {a, b, s?}` or `CIRCLE`, `DOUBLE_CIRCLE {c, r, s?}`, `segments[]?` |
| Segment     | `from {x, y}`, `to {x, y}`                                                                                                                |

A field marked `?` may be absent; a `null` is read as absent, as Java's reader makes both
a null. Any other field of the wrong type, missing or outside its values is refused with an
`SbgnLayoutError` naming the object (`src/layout.ts`).

**Rules:**

- A node is written unless `isFadeOut` or `isCrossed` is present (any value, as Java tests
  for null); an edge unless `isFadeOut` is present.
- A connector whose edge id names no edge is an error naming both ids (Java throws).
- An edge none of whose segments touches its shape is an error (Java's
  `portCandidates.get(0)` throws); so is an empty or missing backbone where Java reads it
  (an INPUT or OUTPUT without segments of its own: `subList` out of bounds, or a null
  list).
- **Numbers follow Java's arithmetic step by step.** Java takes `floatValue()` of the
  layout's doubles and computes in float from there (SbgnConverter.java:232-240: the
  reaction's box, `w / 3`, `4 * w / 3`, `x - w / 3`, `r * 2`, `c - r`). Each float
  operation is followed by `Math.fround`, in Java's order, never one `fround` at the end.
  Where Java computes in doubles (`Coordinate.minus`, `add`, `divide` for a BOX's centre;
  the `Math.abs(…) > w` test, a double against a widened float), so do we, with `fround`
  once when Java calls `floatValue()`. Every number is written with `java-float`.
- **The touch test** (`ShapeWrapper`) truncates its bounds toward zero, as `intValue()`
  does (`Math.trunc`, not `Math.floor`), and compares the segment's double coordinates with
  them.
- Reading never alters the layout (D2): every list is read, never sorted or reversed in
  place; reversals are made on copies.

## SBGN-ML document (output model)

| Element  | Fields                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| Document | `language` = `process description`, `glyphs[]`, `arcs[]`                                                         |
| Glyph    | `class`, `id`, `compartmentOrder?`, `label? {text, bbox?}`, `bbox`, `glyphs[]` (units of information), `ports[]` |
| Port     | `id`, `x`, `y`                                                                                                   |
| Arc      | `class`, `id`, `source` (glyph or port id), `target`, `glyphs[]` (cardinality), `start`, `next[]`, `end`         |

**Order (D1):** compartments in layout order; then entity glyphs in node order; then
process glyphs in edge order; then arcs, by node order and, within a node, connector
order. Java's own order is random; this one is fixed by the layout.

**Ids:** as Java writes them (research R2). The unit-of-information counter runs across
the document in node order, as Java's does, counting only the attachments of nodes that
are written: a faded-out or crossed-out node's attachments take no number.

**Validation:** every arc has a start and an end, or the conversion fails naming it; ids
are unique in the document, or it fails naming the repeat (Java would write it; release 98
has none).

## Declared difference (comparison)

| Kind | What may differ                                                         | Where it comes from |
| ---- | ----------------------------------------------------------------------- | ------------------- |
| D1   | order of glyphs and arcs                                                | research R3.1       |
| D2   | points of arcs of an edge with an OUTPUT, as Java's reversal would give | R3.2                |
| D3   | `stoichiometry` → `cardinality`                                         | R3.4                |
| D4   | label box widths; only in bulk mode, against the published bulk file    | R3.3                |
| D5   | an OUTPUT with its own segments: start and end swapped, nexts identical | R3.5                |
| D6   | an OUTPUT without its own segments: start and end on the picked segment | R3.6                |

**The rule for points (D2, D5, D6):** Java's points must equal one of Java's possible
readings recomputed from the layout (the backbone as given or reversed when the arc starts,
and for an OUTPUT reversed once more partway through, research R3.7); ours must equal the
reading with the backbone as given, with D6 and then D5 applied. Anything else is
undeclared.

## Event (website, WebsiteAngular's)

Resolved from a dbId, stable id or versioned stable id. A pathway → the stable id of the
diagram that holds it → that diagram file. A reaction-like event → its layout from the
website's reaction-layout module. Anything else → 400; nothing → 404. The file is named by
the event's own stable id.

## Bulk run

| Field    | Meaning                                                             |
| -------- | ------------------------------------------------------------------- |
| species  | `Homo sapiens` for the published file                               |
| pathways | `Pathway{hasDiagram:true, speciesName}` ordered by dbId             |
| diagrams | the folder holding `{stId}.json`                                    |
| written  | stable ids converted                                                |
| failed   | stable ids not converted, each with its reason; any → exit status 1 |
