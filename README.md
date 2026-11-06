# sbgn-exporter

SBGN-ML (Process Description) export of Reactome events: the release's bulk file
(`homo_sapiens.sbgn.tar.gz`) and the website's SBGN of one pathway or reaction, from
one implementation in TypeScript. It is to replace the SBGN converter in
[`reactome/diagram-exporter`](https://github.com/reactome/diagram-exporter), matching
its output but for declared fixes.

The work is specified before it is built: see [`specs/`](specs/) and
[`CLAUDE.md`](CLAUDE.md). The principles are in
[`.specify/memory/constitution.md`](.specify/memory/constitution.md).

Licensed under the Apache License 2.0 ([`LICENSE`](LICENSE)).
