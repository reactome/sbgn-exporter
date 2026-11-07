# sbgn-exporter

SBGN-ML (Process Description) export of Reactome events: the release's bulk file
(`homo_sapiens.sbgn.tar.gz`) and the website's SBGN of one pathway or reaction, from
one implementation in TypeScript. It is to replace the SBGN converter in
[`reactome/diagram-exporter`](https://github.com/reactome/diagram-exporter), matching
its output but for declared fixes.

The work is specified before it is built: see [`specs/`](specs/) and
[`CLAUDE.md`](CLAUDE.md). The principles are in
[`.specify/memory/constitution.md`](.specify/memory/constitution.md).

## Using the library

The website imports the library from this repository's `dist` branch, which CI rebuilds
from each commit of `main` (`Build from <main's commit>`), pinned to one of its commits.
The branch's `package.json` has no dependencies, so nothing else is installed: none of the
command line's (`neo4j-driver`) or the comparison's (`saxes`).

```sh
# the dist commit whose message names the main commit wanted
git ls-remote https://github.com/reactome/sbgn-exporter.git refs/heads/dist
npm install 'git+https://github.com/reactome/sbgn-exporter.git#<dist commit>'
```

npm fetches it over HTTPS (GitHub's tarball of the commit) and records it in the lockfile
with its integrity, so `npm ci`, `npm install --omit=dev` and `npm install
--ignore-scripts` install the same files. Then:

```js
import { toSbgn, sbgnFileName, SBGN_MEDIA_TYPE, SbgnLayoutError } from 'sbgn-exporter';

const sbgn = toSbgn(layout); // a diagram layout, parsed from JSON
```

Licensed under the Apache License 2.0 ([`LICENSE`](LICENSE)).
