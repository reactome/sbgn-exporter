# Contract: the comparison

`node ci/compare.ts <ours.sbgn> <java.sbgn> [--layout <layout.json>] [--bulk] [--json]`

- **Reads** two SBGN-ML documents and matches glyphs (with their child glyphs and ports)
  and arcs by id.
- **Compares** class, label text, label box, box, compartment order, ports, source,
  target, child glyphs and points, each attribute value as the string written, never as a
  number (FR-005).
- **Gives each difference a kind:** D1 to D6 (data-model.md) when the declared difference
  explains it, `undeclared` otherwise.
  - **Points:** declared (D2, D5, D6) only with `--layout`, and only if Java's points are
    exactly one of Java's possible readings recomputed from the layout and ours exactly the
    deterministic one (research R3.7). Any other change of points is `undeclared`, with or
    without `--layout`.
  - **Widths (D4):** declared only with `--bulk`, which is for the published bulk file.
    Without it, a width difference is `undeclared`.
  - **In bulk mode** everything else is still checked: the names and list of files (when
    comparing archives or folders), classes, ids, labels, boxes and points.
- **Missing or extra ids** are `undeclared`.
- **Output:** a count per kind and, for each undeclared difference, the id, the field and
  both values, never a label's text in full (labels are public data, but logs stay short).
  `--json` writes the same as JSON.
- **Exit status:** 0 if no difference is undeclared, 1 otherwise, 2 for unreadable input.
- **Proven:** a test plants one difference of each kind, and an undeclared one, and sees
  each reported and the exit status follow (constitution V). Negative tests: a change of
  points no reading explains is reported with `--layout`; a width difference is reported
  without `--bulk`; `48` against `48.0` is reported.
