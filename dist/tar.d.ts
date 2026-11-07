/** One file of the archive. */
export interface TarEntry {
    /** Its name at the archive's top level, e.g. `R-HSA-109581.sbgn`. */
    readonly name: string;
    /** Its bytes; text is written as UTF-8. */
    readonly content: string | Uint8Array;
}
export interface TarOptions {
    /** Every entry's modification time, in whole seconds since 1970. */
    readonly mtime: number;
}
/** The uncompressed ustar archive of the entries, in their order. */
export declare function tar(entries: readonly TarEntry[], options: TarOptions): Uint8Array;
/** The archive gzipped: one gzip member, its header fixed. */
export declare function tarGz(entries: readonly TarEntry[], options: TarOptions): Uint8Array;
