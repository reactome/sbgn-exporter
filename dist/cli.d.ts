import { type GraphReader } from './graph.ts';
/** What the command line reads and writes beyond its files: injected by tests. */
export interface Context {
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly stdout: (text: string) => void;
    readonly stderr: (text: string) => void;
    /** The graph for the settings in `env`. */
    readonly graph: (env: Readonly<Record<string, string | undefined>>) => GraphReader;
}
/** The published bulk file's species. */
export declare const DEFAULT_SPECIES = "Homo sapiens";
/** The command line: its exit status. */
export declare function main(args: readonly string[], context: Context): Promise<number>;
