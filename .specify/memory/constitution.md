# sbgn-exporter Constitution

These principles are not aspirations. Each one is here because breaking it has
already cost Reactome's SBGN files something specific, or is about to. The cost is
named so the rule can be argued with rather than merely obeyed.

## Core Principles

### I. One implementation, for the release's bulk file and the website's SBGN

Reactome publishes SBGN-ML (Process Description) in two ways:

- **the release's bulk file**, `homo_sapiens.sbgn.tar.gz`: one file per human pathway
  that has a diagram, made by `reactome/diagram-exporter`'s command line during the
  release;
- **the website's SBGN of one pathway or reaction**, made on request by the same
  library's `SbgnConverter` inside the content service.

Both come from one Java class today, which is the one thing that has gone right: a
fix reaches both. What has gone wrong is that the two runs measure text differently,
and order their output at random, so the same release's two files for the same
pathway differ.

**So:** this repository is the one implementation of both. The website's content
service (`reactome/WebsiteAngular`) imports it, and the release runs its command line.
Neither keeps a copy of its own, and both write the same bytes for the same input.

### II. Match today's output; fix only what is obviously a bug

SBGN-ML is a published format that tools and people read. This work changes where the
SBGN is made and in what language, not what it says. A change to what a published
file says is the team's decision, not a side effect of a port.

**So:** a file written here says what Java's says for the same diagram. A difference
is kept only when Java's output is obviously wrong (invalid against the format's
schema, or different between two runs on the same input), and every kept difference is
declared in the spec with the evidence. Anything that would merely be better (a
richer mapping, annotations, a newer libSBGN version) is not done: it becomes a GitHub
issue for the team.

### III. The release's own files and the graph; nothing relational, no Java

Java's converter reads a pathway's diagram layout file (the release's
`diagram/{stId}.json`) and, for a reaction, a layout computed from the graph. Diagram
layouts are not in the graph.

**So:** this repository reads diagram layout JSON (a pathway's file, or a reaction's
layout as the website's content service answers it) and, for the bulk file's list of
pathways, the Neo4j graph. It reads no relational database and runs no Java.

### IV. Every file is valid SBGN-ML

Java's files are checked by nobody: 550 of release 98's 1,390 bulk files fail the
libSBGN 0.2 schema they declare, because a glyph class the schema does not have is
written into them.

**So:** every file written here is valid against the schema it declares, and CI
validates the output for its fixtures. A validator's verdict is recorded with the
validator's name and version.

### V. Verify the instrument, and prove a test fails

A check that cannot fail is not a check. The release's verifier for these files
today checks that they exist and that their sizes are plausible: a file of the right
size and the wrong content passes it.

**So:** name what a check actually reads, and see it fail once before relying on it.
A fix comes with a test that fails without it, and that has been seen to fail; where
that is impractical, the pull request says so rather than implying coverage.

### VI. Production services are not test fixtures

Reactome's production services (the website, its APIs and its databases) are not
used for development, comparison or verification: a burst of requests can load the
live site.

**So:** runs use a private copy of the release's graph and a local content service.
The release's own published files (diagram files, the bulk SBGN archive), fetched one
at a time only when a comparison needs them, are the only reference taken from
Reactome's servers, and they are kept out of the repository.

### VII. Loose licences, and nothing private in a public repository

This repository is public and Apache-2.0. A copyleft dependency would bind the
website's content service that imports it; a fixture copied from real data could
carry what should not be published.

**So:** dependencies are under loose open-source licences (MIT, BSD, Apache-2.0 or
the like). Fixtures are small and made for the purpose. Nothing internal (host names,
server paths, credentials, release-process detail) and no people's names go in code,
fixtures, logs, commit messages or pull requests.

## Quality Gates

Every change passes these; the first spec's first tasks make each one real
(Principle V):

- **The unit tests run and pass**, each fix with a test seen failing first.
- **Types, formatting and lint** as CI runs them.
- **For a change to what is written:** the output for the fixtures is validated, and
  compared with Java's for the same input by meaning (glyphs, arcs and their
  geometry by id, not file order), and the difference is in the pull request.

## Development Workflow

- **Specs first.** Feature-sized work goes through Spec Kit before any code:
  `/speckit-specify` → `/speckit-plan` → `/speckit-tasks`. The specs live in
  `specs/`, and the pull request that completes a task ticks it in `tasks.md` with
  its number.
- **Each change by pull request,** with CI green and an adversarial review before it
  merges.
- **Work that also touches the website** (`reactome/WebsiteAngular`) keeps its
  website part in that repository's specs.

## Governance

This constitution outranks other practice in this repository. It is changed by pull
request, with the reason for the change; a principle is removed only with the cost
it was guarding against shown to be gone.

**Version**: 1.0.0 | **Ratified**: 2026-11-06 | **Last Amended**: 2026-11-06
