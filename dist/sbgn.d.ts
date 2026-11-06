/**
 * What an SBGN-ML file written here declares about itself: libSBGN's 0.2 namespace,
 * which Java's converter writes today, and the Process Description language. Spec 001
 * decides the rest.
 */
export declare const SBGN_NAMESPACE = "http://sbgn.org/libsbgn/0.2";
export declare const SBGN_LANGUAGE = "process description";
/** The file an event's SBGN is saved as: its stable identifier and `.sbgn`. */
export declare function sbgnFileName(stableId: string): string;
