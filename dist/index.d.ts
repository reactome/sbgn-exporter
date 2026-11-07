import { type DiagramLayout } from './layout.ts';
export { SBGN_LANGUAGE, SBGN_MEDIA_TYPE, SBGN_NAMESPACE, sbgnFileName } from './sbgn.ts';
export { SbgnLayoutError, type BoxShape, type CircleShape, type Compartment, type Connector, type ConnectorType, type Coordinate, type DiagramLayout, type DiagramObject, type Edge, type LayoutId, type Node, type NodeAttachment, type NodeProperties, type ReactionShape, type ReactomeId, type Segment, type Stoichiometry, } from './layout.ts';
/**
 * The SBGN-ML (Process Description, libSBGN 0.2) of a diagram layout: a pathway's diagram
 * file or a reaction's layout, parsed from JSON. The whole document, declaration to final
 * newline, to be sent or saved as UTF-8. Pure: the same layout gives the same text.
 *
 * The layout is read and checked as it is converted, whatever its declared type, so a
 * parsed file can be passed as it is.
 *
 * @throws SbgnLayoutError for a layout it cannot convert, naming the object.
 */
export declare function toSbgn(layout: DiagramLayout): string;
