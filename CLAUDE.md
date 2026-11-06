# Working in this repository

Day-to-day guidance for anyone, human or agent, changing sbgn-exporter. The
principles are in [`.specify/memory/constitution.md`](.specify/memory/constitution.md);
where this file and the constitution disagree, the constitution wins.

## What it is

sbgn-exporter is to write Reactome's SBGN-ML (Process Description) in place of the
SBGN converter in `reactome/diagram-exporter`:

- **the release's bulk file,** `homo_sapiens.sbgn.tar.gz`, one file per human
  pathway with a diagram;
- **the website's SBGN of one pathway or reaction,** made on request by the website's
  content service, which imports this library.

Both from one implementation, matching Java's output but for declared fixes. How is
spec 001's to decide.

## Specs first: use Spec Kit

Feature-sized work goes through Spec Kit before any code, and the specs live in
`specs/`:

- **Feature-sized** means a new capability, a change to what is written, or
  anything that will take more than one pull request.
- **The sequence** is `/speckit-specify` → `/speckit-plan` → `/speckit-tasks`, then
  implementation task by task.
- **Keep `tasks.md` current.** The pull request that completes a task ticks it and
  adds its number, in the same pull request.
- **A single-PR fix** needs no new spec, but its description names the spec it
  belongs to, if any.
- **Work that also touches the website** (`reactome/WebsiteAngular`) keeps its
  website part in that repository's specs.

## The checks

`npm run check` runs the code's gates as CI does: types (`tsc`, strict), lint
(typescript-eslint's strict type-checked rules), formatting and the unit tests
(`node --test`, on Node 24's own type stripping).

- **`format`**: every file as Prettier 3.9.10 writes it (`.prettierrc`,
  `.prettierignore`). Fix with `npx prettier@3.9.10 --write .`, which a Spec Kit run
  needs afterwards: Spec Kit writes `[X]` and `*emphasis*`, which Prettier writes `[x]`
  and `_emphasis_`. Markdown can need a second pass.
- **Imports name their `.ts` file:** Node runs the TypeScript as it is, so a relative
  import, export or dynamic import of `.js` passes the type check but fails at run time;
  lint refuses each.

## Proving what is written

- **The reference** is what Java writes today: the content service's
  `/exporter/event/{id}.sbgn` on a local deployment, and the release's published
  `homo_sapiens.sbgn.tar.gz`, fetched only when a comparison needs it and kept out of
  the repository. No other Reactome production service is used.
- **Compare by meaning**, not bytes: Java's glyph and arc order changes from run to
  run, so files are compared glyph by glyph and arc by arc, by id.
- **Run against a private copy of the release's graph**, not a shared database.

## This repository is public

Nothing internal goes in it, in code, comments, commit messages or pull request
descriptions:

- no host names or server paths;
- no credentials;
- no internal release-process detail;
- no people's names.

## Before pushing

- The checks above pass.
- Every fix has a test seen failing first.
