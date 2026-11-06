/**
 * What an SBGN-ML file written here declares about itself: libSBGN's 0.2 namespace,
 * which Java's converter writes today, and the Process Description language. Spec 001
 * decides the rest.
 */
export const SBGN_NAMESPACE = 'http://sbgn.org/libsbgn/0.2';
export const SBGN_LANGUAGE = 'process description';
/** The file an event's SBGN is saved as: its stable identifier and `.sbgn`. */
export function sbgnFileName(stableId) {
    if (!/^R-[A-Z]{3,4}-\d+$/.test(stableId)) {
        throw new Error(`Not a Reactome stable identifier: ${JSON.stringify(stableId)}`);
    }
    return `${stableId}.sbgn`;
}
