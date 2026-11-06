/**
 * The library's entry point, what the website imports (contracts/library.md). It grows
 * to the whole contract (toSbgn, SbgnLayoutError, the layout's types) with spec 001's
 * T011; it must never import the command line's or the comparison's dependencies.
 */
export { SBGN_LANGUAGE, SBGN_NAMESPACE, sbgnFileName } from "./sbgn.js";
