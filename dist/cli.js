/**
 * The command line (spec 001 T024, contracts/cli.md), run as `node src/cli.ts` from a
 * checkout:
 *
 *     sbgn-exporter bulk --diagrams <folder> --out <file.tar.gz> [--species "Homo sapiens"]
 *     sbgn-exporter files --diagrams <folder> --out <folder> (--species <name> | --pathways <id,...>)
 *     sbgn-exporter convert <layout.json> [--out <file.sbgn>]
 *
 * `bulk` and `files` list the pathways from the graph (src/graph.ts; settings from the
 * environment only) and read each one's layout from `{diagrams}/{stId}.json`, a local
 * folder: nothing is fetched. A pathway that cannot be written is named on standard error
 * with the reason, and the run carries on with the rest (FR-016).
 *
 * Exit status: 0 if every listed pathway was written; 1 if any failed (the archive or
 * folder still holds the rest); 2 for a usage error or an unreachable graph, with nothing
 * written.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bulkList, graphSettings, openGraph, pathwayIdentifier, pathwayList, } from "./graph.js";
import { toSbgn } from "./index.js";
import { readLayout } from "./layout.js";
import { tarGz } from "./tar.js";
const USAGE = `Usage:
  sbgn-exporter bulk --diagrams <folder> --out <file.tar.gz> [--species "Homo sapiens"]
  sbgn-exporter files --diagrams <folder> --out <folder> (--species <name> | --pathways <id,...>)
  sbgn-exporter convert <layout.json> [--out <file.sbgn>]
`;
/** The published bulk file's species. */
export const DEFAULT_SPECIES = 'Homo sapiens';
/** A usage error: exit status 2, nothing written. */
class UsageError extends Error {
    name = 'UsageError';
}
/** `--name value` pairs and positional arguments; an option given twice or without a value is refused. */
function parse(args, allowed) {
    const positional = [];
    const options = new Map();
    for (let i = 0; i < args.length; i++) {
        const arg = args[i] ?? '';
        if (!arg.startsWith('--')) {
            positional.push(arg);
            continue;
        }
        const name = arg.slice(2);
        const value = args[i + 1];
        if (!allowed.includes(name))
            throw new UsageError(`unknown option ${arg}`);
        if (options.has(name))
            throw new UsageError(`${arg} given twice`);
        if (value === undefined || value.startsWith('--'))
            throw new UsageError(`${arg} needs a value`);
        options.set(name, value);
        i++;
    }
    return { positional, options };
}
function required(args, name) {
    const value = args.options.get(name);
    if (value === undefined)
        throw new UsageError(`--${name} is required`);
    return value;
}
function message(error) {
    return error instanceof Error ? error.message : String(error);
}
/** One pathway's document from its layout file, or the reason it cannot be made. */
function document(diagrams, stId) {
    const file = join(diagrams, `${stId}.json`);
    let text;
    try {
        text = readFileSync(file, 'utf8');
    }
    catch (error) {
        const code = error instanceof Error && 'code' in error ? String(error.code) : '';
        return { reason: code === 'ENOENT' ? `no diagram file ${file}` : message(error) };
    }
    try {
        const layout = JSON.parse(text);
        return { sbgn: toSbgn(readLayout(layout)) };
    }
    catch (error) {
        return { reason: message(error) };
    }
}
/** Every pathway's document, failures named as they come; progress every 100. */
function convertAll(diagrams, list, context) {
    const written = [];
    let failed = 0;
    list.forEach(({ stId }, index) => {
        const result = document(diagrams, stId);
        if ('sbgn' in result)
            written.push({ name: `${stId}.sbgn`, sbgn: result.sbgn });
        else {
            failed++;
            context.stderr(`${stId}: ${result.reason}\n`);
        }
        if ((index + 1) % 100 === 0)
            context.stderr(`${String(index + 1)} of ${String(list.length)}\n`);
    });
    return { written, failed };
}
/** The list from the graph; an unreachable graph is a usage-level failure (exit 2). */
async function listFrom(context, read) {
    let graph;
    try {
        graph = context.graph(context.env);
    }
    catch (error) {
        context.stderr(`${message(error)}\n`);
        return 2;
    }
    try {
        return await read(graph);
    }
    catch (error) {
        context.stderr(`Cannot read the list of pathways from the graph: ${message(error)}\n`);
        return 2;
    }
    finally {
        await graph.close();
    }
}
function summary(context, written, failed) {
    context.stderr(`${String(written)} written, ${String(failed)} failed\n`);
    return failed > 0 ? 1 : 0;
}
/** The archive's modification time: SOURCE_DATE_EPOCH if set, else now. */
function archiveTime(env) {
    const epoch = env['SOURCE_DATE_EPOCH'];
    if (epoch === undefined || epoch === '')
        return Math.floor(Date.now() / 1000);
    if (!/^\d+$/.test(epoch))
        throw new UsageError(`SOURCE_DATE_EPOCH is not whole seconds: ${epoch}`);
    return Number(epoch);
}
async function bulk(args, context) {
    const diagrams = required(args, 'diagrams');
    const out = required(args, 'out');
    const species = args.options.get('species') ?? DEFAULT_SPECIES;
    if (args.positional.length > 0)
        throw new UsageError(`unexpected ${args.positional.join(' ')}`);
    const mtime = archiveTime(context.env);
    const list = await listFrom(context, (graph) => bulkList(graph, species));
    if (typeof list === 'number')
        return list;
    const { written, failed } = convertAll(diagrams, list, context);
    // In name order, as the published archive is (research R10).
    const entries = written
        .map(({ name, sbgn }) => ({ name, content: sbgn }))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    try {
        writeFileSync(out, tarGz(entries, { mtime }));
    }
    catch (error) {
        context.stderr(`Cannot write ${out}: ${message(error)}\n`);
        return 1;
    }
    return summary(context, written.length, failed);
}
async function files(args, context) {
    const diagrams = required(args, 'diagrams');
    const out = required(args, 'out');
    const species = args.options.get('species');
    const pathways = args.options.get('pathways');
    if (args.positional.length > 0)
        throw new UsageError(`unexpected ${args.positional.join(' ')}`);
    if ((species === undefined) === (pathways === undefined)) {
        throw new UsageError('give one of --species and --pathways');
    }
    let identifiers = [];
    if (pathways !== undefined) {
        identifiers = pathways.split(',').map((given) => {
            const id = pathwayIdentifier(given.trim());
            if (id === undefined)
                throw new UsageError(`not a stable id or a dbId: ${given}`);
            return id;
        });
    }
    const list = await listFrom(context, (graph) => species === undefined ? pathwayList(graph, identifiers) : bulkList(graph, species));
    if (typeof list === 'number')
        return list;
    mkdirSync(out, { recursive: true });
    const { written, failed } = convertAll(diagrams, list, context);
    for (const { name, sbgn } of written)
        writeFileSync(join(out, name), sbgn);
    // Each pathway asked for must be listed: one without a diagram is named.
    let missing = 0;
    for (const id of identifiers) {
        const found = list.some((p) => ('stId' in id ? p.stId === id.stId : p.dbId === id.dbId));
        if (!found) {
            missing++;
            context.stderr(`${id.given}: no pathway with a diagram in the graph\n`);
        }
    }
    return summary(context, written.length, failed + missing);
}
function convert(args, context) {
    const [layoutFile, ...rest] = args.positional;
    if (layoutFile === undefined || rest.length > 0)
        throw new UsageError('give one layout file');
    const out = args.options.get('out');
    let sbgn;
    try {
        const layout = JSON.parse(readFileSync(layoutFile, 'utf8'));
        sbgn = toSbgn(readLayout(layout));
    }
    catch (error) {
        context.stderr(`${layoutFile}: ${message(error)}\n`);
        return 1;
    }
    if (out === undefined)
        context.stdout(sbgn);
    else
        writeFileSync(out, sbgn);
    return 0;
}
/** The command line: its exit status. */
export async function main(args, context) {
    const [command, ...rest] = args;
    try {
        switch (command) {
            case 'bulk':
                return await bulk(parse(rest, ['diagrams', 'out', 'species']), context);
            case 'files':
                return await files(parse(rest, ['diagrams', 'out', 'species', 'pathways']), context);
            case 'convert':
                return convert(parse(rest, ['out']), context);
            default:
                throw new UsageError(command === undefined ? 'no command' : `unknown command ${command}`);
        }
    }
    catch (error) {
        if (!(error instanceof UsageError))
            throw error;
        context.stderr(`sbgn-exporter: ${error.message}\n${USAGE}`);
        return 2;
    }
}
if (import.meta.main) {
    process.exitCode = await main(process.argv.slice(2), {
        env: process.env,
        stdout: (text) => process.stdout.write(text),
        stderr: (text) => process.stderr.write(text),
        graph: (env) => openGraph(graphSettings(env)),
    });
}
