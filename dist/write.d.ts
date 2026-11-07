import type { SbgnDocument } from './model.ts';
/**
 * The document's SBGN-ML text, as libSBGN 0.2 writes it; to be saved or sent as UTF-8.
 *
 * @throws SbgnLayoutError for a label with a character XML 1.0 cannot hold, naming its
 *   glyph.
 */
export declare function writeSbgn(document: SbgnDocument): string;
