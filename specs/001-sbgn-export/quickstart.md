# Quickstart: proving the exporter

Each step names what it proves. Commands run from a checkout on Node 24.

## 1. The checks

```sh
npm ci
npm run check
```

Types, lint, format and unit tests, as CI runs them. The fixtures' outputs are compared
with Java's answers for them ([contracts/comparison.md](contracts/comparison.md)) and
validated against libSBGN 0.2's schema (`ci/validate.sh`).

## 2. One diagram by hand

```sh
node src/cli.ts convert fixtures/layouts/<name>.json --out /tmp/out.sbgn
node ci/compare.ts /tmp/out.sbgn fixtures/java/<name>.sbgn --layout fixtures/layouts/<name>.json
```

Expected: exit 0, with only declared kinds counted.

## 3. A release's bulk file (SC-001, SC-003, SC-006)

Needs a private copy of the release's graph (`NEO4J_URI` and the rest in the
environment), the release's diagram files in a local folder, and the release's published
`homo_sapiens.sbgn.tar.gz`, fetched once and kept outside the repository.

```sh
time node src/cli.ts bulk --diagrams <diagram folder> --out <work>/ours.tar.gz
tar -tzf <work>/ours.tar.gz | sort > <work>/ours.txt
tar -tzf <published archive> | sort > <work>/java.txt
diff <work>/ours.txt <work>/java.txt          # the same names
# then, for every name: ci/compare.ts with the layout; ci/validate.sh over the folder
node ci/float-check.ts <folder of Java's files> # every number Java wrote, re-derived
```

Expected: the same 1,390 names for release 98; no undeclared difference; every file valid;
under 15 minutes.

## 4. The website's answer equals the bulk entry (SC-004)

A unit test converts a fixture pathway's layout once through the library (as the website
calls it) and once through `bulk`'s path, and compares the bytes.

## 5. The website (WebsiteAngular's own quickstart)

The endpoint is checked in WebsiteAngular: its answers against Java's on a local
deployment for the sample and every error ([contracts/website-endpoint.md](contracts/website-endpoint.md)),
a handful of requests at a time, spaced; then, after the routes move, the SBGN buttons and
the Newt link on the deployed site.
