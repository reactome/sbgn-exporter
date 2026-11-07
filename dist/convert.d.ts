import { type DiagramLayout } from './layout.ts';
import type { SbgnDocument } from './model.ts';
/**
 * The SBGN-ML document of a diagram layout, as Java's converter makes it but for the
 * declared differences (spec FR-003).
 *
 * @throws SbgnLayoutError for a layout Java cannot convert or would write invalid, naming
 *   the object.
 */
export declare function convert(layout: DiagramLayout): SbgnDocument;
