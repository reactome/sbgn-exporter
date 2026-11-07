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
export interface GraphSettings {
    readonly uri: string;
    readonly user: string;
    readonly password: string;
    /** Reactome's graph database is named graph.db. */
    readonly database: string;
}
/** A graph setting missing or not usable. */
export declare class GraphSettingsError extends Error {
    readonly name = "GraphSettingsError";
}
/** The settings from NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD and NEO4J_DATABASE. */
export declare function graphSettings(env: Readonly<Record<string, string | undefined>>): GraphSettings;
/** One read-only query's rows, each as a plain object. */
export interface GraphReader {
    read(query: string, parameters: Readonly<Record<string, unknown>>): Promise<readonly unknown[]>;
    close(): Promise<void>;
}
/**
 * diagram-exporter's query for `--target <species name>` (Main.java), returning each
 * pathway's stable id and dbId in place of the whole node.
 */
export declare const BULK_QUERY: string;
/** A pathway of the bulk list. */
export interface BulkPathway {
    readonly stId: string;
    readonly dbId: number;
}
/** A row of the list that is not a pathway's stable id and dbId. */
export declare class GraphAnswerError extends Error {
    readonly name = "GraphAnswerError";
}
/**
 * The pathways of a species with a diagram, ordered by dbId, as diagram-exporter lists
 * them for the bulk file.
 *
 * @throws GraphAnswerError for a row that is not a stable id and a dbId, or a stable id
 *   listed twice.
 */
export declare function bulkList(graph: GraphReader, speciesName: string): Promise<BulkPathway[]>;
/** What this module uses of a `neo4j-driver` session's transaction. */
export interface BoltTransaction {
    run(query: string, parameters: Readonly<Record<string, unknown>>): PromiseLike<{
        readonly records: readonly {
            toObject(): unknown;
        }[];
    }>;
}
/** What this module uses of a `neo4j-driver` session. */
export interface BoltSession {
    executeRead<T>(work: (tx: BoltTransaction) => Promise<T>): Promise<T>;
    close(): Promise<void>;
}
/** What this module uses of a `neo4j-driver` driver. */
export interface BoltDriver {
    session(config: {
        database: string;
        defaultAccessMode: typeof neo4j.session.READ;
    }): BoltSession;
    close(): Promise<void>;
}
/**
 * A reader over Bolt: each query in its own read-only session on the settings' database.
 * `driver` is neo4j-driver's for the settings; a test gives its own.
 */
export declare function openGraph(settings: GraphSettings, driver?: BoltDriver): GraphReader;
