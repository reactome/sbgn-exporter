/**
 * The bulk file's list of pathways, read from the release's graph (spec 001 T022, research
 * R10): diagram-exporter's own query for one species, the pathways with a diagram, ordered
 * by dbId, over Bolt with `neo4j-driver`, in a read-only session.
 *
 * The graph's address, user, password and database come from the environment
 * (`NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`), as pdf-export reads
 * them; never from a file or the command line. Only the command line imports this module:
 * the library's entry point does not, so the website's import loads no driver.
 */
import neo4j from 'neo4j-driver';
/** A graph setting missing or not usable. */
export class GraphSettingsError extends Error {
    name = 'GraphSettingsError';
}
/** The settings from NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD and NEO4J_DATABASE. */
export function graphSettings(env) {
    const uri = env['NEO4J_URI'];
    if (uri === undefined || uri === '') {
        throw new GraphSettingsError('NEO4J_URI is not set: the address of the release graph');
    }
    return {
        uri,
        user: env['NEO4J_USER'] ?? 'neo4j',
        password: env['NEO4J_PASSWORD'] ?? '',
        database: env['NEO4J_DATABASE'] ?? 'graph.db',
    };
}
/**
 * diagram-exporter's query for `--target <species name>` (Main.java), returning each
 * pathway's stable id and dbId in place of the whole node.
 */
export const BULK_QUERY = 'MATCH (p:Pathway{hasDiagram:True, speciesName:$speciesName}) ' +
    'WITH DISTINCT p ' +
    'RETURN p.stId AS stId, p.dbId AS dbId ' +
    'ORDER BY p.dbId';
/** A row of the list that is not a pathway's stable id and dbId. */
export class GraphAnswerError extends Error {
    name = 'GraphAnswerError';
}
const STABLE_ID = /^R-[A-Z]{3,4}-\d+$/;
function pathway(row, index) {
    if (typeof row === 'object' && row !== null && !Array.isArray(row)) {
        const stId = Reflect.get(row, 'stId');
        const dbId = Reflect.get(row, 'dbId');
        if (typeof stId === 'string' && STABLE_ID.test(stId) && Number.isSafeInteger(dbId)) {
            if (typeof dbId === 'number')
                return { stId, dbId };
        }
    }
    throw new GraphAnswerError(`The graph's row ${String(index)} is not a pathway's stable id and dbId: ${JSON.stringify(row)}`);
}
/**
 * The pathways of a species with a diagram, ordered by dbId, as diagram-exporter lists
 * them for the bulk file.
 *
 * @throws GraphAnswerError for a row that is not a stable id and a dbId, or a stable id
 *   listed twice.
 */
export async function bulkList(graph, speciesName) {
    return checked(await graph.read(BULK_QUERY, { speciesName }));
}
function checked(rows) {
    const list = rows.map(pathway);
    const seen = new Set();
    for (const { stId } of list) {
        if (seen.has(stId))
            throw new GraphAnswerError(`The graph lists ${stId} twice`);
        seen.add(stId);
    }
    return list;
}
/**
 * diagram-exporter's query for a list of pathways (`--target` with more than one
 * identifier, Main.java), returning each pathway's stable id and dbId in place of the node.
 */
export const LIST_QUERY = 'MATCH (p:Pathway{hasDiagram:True}) ' +
    'WHERE p.dbId IN $dbIds OR p.stId IN $stIds ' +
    'WITH DISTINCT p ' +
    'RETURN p.stId AS stId, p.dbId AS dbId ' +
    'ORDER BY p.dbId';
/** An identifier read as Java reads one, or undefined for one that is neither form. */
export function pathwayIdentifier(given) {
    const stable = /^(R-[A-Z]{3,4}-\d+)(?:\.\d+)?$/.exec(given);
    if (stable?.[1] !== undefined)
        return { stId: stable[1], given };
    if (/^\d+$/.test(given)) {
        const dbId = Number(given);
        if (Number.isSafeInteger(dbId))
            return { dbId, given };
    }
    return undefined;
}
/**
 * The pathways with a diagram among those identified, ordered by dbId, as diagram-exporter
 * lists them; an identifier that names none of them is left out, as Java leaves it out.
 */
export async function pathwayList(graph, identifiers) {
    const stIds = identifiers.flatMap((id) => ('stId' in id ? [id.stId] : []));
    // As Bolt integers: a JavaScript number goes as a float, which an index on dbId,
    // an integer, may not be used for.
    const dbIds = identifiers.flatMap((id) => ('dbId' in id ? [neo4j.int(id.dbId)] : []));
    const rows = await graph.read(LIST_QUERY, { dbIds, stIds });
    return checked(rows);
}
/** neo4j-driver's driver for the settings: basic auth, integers as numbers. */
function connect(settings) {
    // Reactome's ids are well below 2^53.
    return neo4j.driver(settings.uri, neo4j.auth.basic(settings.user, settings.password), {
        disableLosslessIntegers: true,
    });
}
/**
 * A reader over Bolt: each query in its own read-only session on the settings' database.
 * `driver` is neo4j-driver's for the settings; a test gives its own.
 */
export function openGraph(settings, driver = connect(settings)) {
    return {
        async read(query, parameters) {
            const session = driver.session({
                database: settings.database,
                defaultAccessMode: neo4j.session.READ,
            });
            try {
                const result = await session.executeRead(async (tx) => await tx.run(query, parameters));
                return result.records.map((record) => record.toObject());
            }
            finally {
                await session.close();
            }
        },
        close: () => driver.close(),
    };
}
