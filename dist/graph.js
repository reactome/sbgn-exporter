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
    const rows = await graph.read(BULK_QUERY, { speciesName });
    const list = rows.map(pathway);
    const seen = new Set();
    for (const { stId } of list) {
        if (seen.has(stId))
            throw new GraphAnswerError(`The graph lists ${stId} twice`);
        seen.add(stId);
    }
    return list;
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
