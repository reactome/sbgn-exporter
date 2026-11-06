# Data Model: SBGN-ML from one TypeScript exporter

## Diagram layout (input)

The JSON of a release's `diagram/{stId}.json`, and of the website's reaction layout
(WebsiteAngular `/exporter/reaction/{id}/diagram`). Only the fields the conversion reads
are typed; others are ignored.

| Object      | Fields read                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Diagram     | `stableId`, `compartments[]`, `nodes[]`, `edges[]` (`links`, `shadows`, `notes` are not read)                                  |
| Compartment | `id`, `reactomeId`, `displayName`, `prop {x, y, width, height}`, `textPosition {x, y}`                                         |
| Node        | `id`, `reactomeId`, `displayName`, `renderableClass`, `prop`, `isFadeOut?`, `isCrossed?`, `nodeAttachments[]?`, `connectors[]` |
| Attachment  | `reactomeId`, `label?`, `shape.a {x, y}`                                                                                       |
| Connector   | `edgeId`, `type` (INPUT, OUTPUT, CATALYST, INHIBITOR, ACTIVATOR), `segments[]?`, `stoichiometry {value, shape? {a, b}}`        |
| Edge        | `id`, `reactomeId`, `displayName`, `isFadeOut?`, `reactionShape {type, a?, b?, c?, r?, s?}`, `segments[]?`                     |
| Segment     | `from {x, y}`, `to {x, y}`                                                                                                     |

**Rules:**

- A node is written unless `isFadeOut` or `isCrossed` is present (any value, as Java tests
  for null); an edge unless `isFadeOut` is present.
- A connector whose edge id names no edge is an error naming both ids (Java throws).
- Numbers are read as doubles and written as Java floats (`Math.fround`, then
  `java-float`).
- Reading never alters the layout (D2): every list is read, never sorted or reversed in
  place.

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
the document in node order, as Java's does.

**Validation:** every arc has a start and an end, or the conversion fails naming it; ids
are unique in the document, or it fails naming the repeat (Java would write it; release 98
has none).

## Declared difference (comparison)

| Kind | What may differ                                                         | Where it comes from |
| ---- | ----------------------------------------------------------------------- | ------------------- |
| D1   | order of glyphs and arcs                                                | research R3.1       |
| D2   | points of arcs of an edge with an OUTPUT, as Java's reversal would give | R3.2                |
| D3   | `stoichiometry` → `cardinality`                                         | R3.4                |
| D4   | label box widths, Java's fallback font against Arial                    | R3.3                |
| D5   | a production arc's start, next and end order                            | R3.5                |

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
