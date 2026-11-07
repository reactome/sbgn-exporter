# Contract: the command line

`sbgn-exporter`, run as `node src/cli.ts` from a checkout (or `node dist/cli.js` when built).

```text
sbgn-exporter bulk --diagrams <folder> --out <file.tar.gz> [--species "Homo sapiens"]
sbgn-exporter files --diagrams <folder> --out <folder> (--species <name> | --pathways <id,...>)
sbgn-exporter convert <layout.json> [--out <file.sbgn>]
```

- **`bulk`** writes the release's archive: one `{stId}.sbgn` per
  `Pathway{hasDiagram:true, speciesName}`, listed by dbId, flat. The default species is
  Homo sapiens, the published file's.
- **`files`** writes the same documents into a folder: for a species, or for a list of
  pathways by stable id or dbId (each must have a diagram, as Java's list query requires).
- **`convert`** turns one layout file into one document, without the graph: for fixtures
  and for checking one diagram by hand. Standard output unless `--out`.
- **The graph:** `NEO4J_URI` (required for `bulk` and `files`), `NEO4J_USER` (default
  `neo4j`), `NEO4J_PASSWORD`, `NEO4J_DATABASE` (default `graph.db`), from the environment
  only.
- **Output:** progress and a summary on standard error, counts of written and failed; each
  failure names the pathway and the reason.
- **Exit status:** 0 if every listed pathway was written; 1 if any failed (the archive or
  folder still holds the rest); 2 for a usage error or an unreachable graph, with nothing
  written. A pathway asked for by `--pathways` that the graph does not list with a diagram
  is named and counted as failed. `convert` exits 1 for a layout it cannot read or
  convert, naming the file and the reason.
- **The archive:** ustar, gzip; entries `{stId}.sbgn`, mode 0644, owner and group 0, in name
  order, as the published archive's are; nothing else in it. Every entry's time is
  `SOURCE_DATE_EPOCH` (whole seconds) if set, else the time of the run, so a run with it
  set writes the same bytes every time.
