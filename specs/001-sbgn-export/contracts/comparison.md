# Contract: the comparison

`node ci/compare.ts <ours.sbgn> <java.sbgn> [--layout <layout.json>] [--json]`

- **Reads** two SBGN-ML documents and matches glyphs (with their child glyphs and ports)
  and arcs by id.
- **Compares** class, label text, label box, box, compartment order, ports, source,
  target, child glyphs and points.
- **Gives each difference a kind:** D1 to D5 (data-model.md) when the declared difference
  explains it, `undeclared` otherwise. D2 and D5 need the layout, to recompute Java's
  readings; without `--layout`, a points difference is `undeclared`.
- **Missing or extra ids** are `undeclared`.
- **Output:** a count per kind and, for each undeclared difference, the id, the field and
  both values, never a label's text in full (labels are public data, but logs stay short).
  `--json` writes the same as JSON.
- **Exit status:** 0 if no difference is undeclared, 1 otherwise, 2 for unreadable input.
- **Proven:** a test plants one difference of each kind, and an undeclared one, and sees
  each reported and the exit status follow (constitution V).
