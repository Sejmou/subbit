/** Minimum time (seconds) to parse a very short word; also used as ε. */
export const MIN_PARSE_S = 0.1;

/** Upper comfortable reading speed (characters per second).
 *
 * Might need some further tweaking.
 * Maybe counting chars is even too simple as a general approach.
 *
 * From empirical tests in German, 28 CPS were still pretty comfortable to read.
 * */
export const MAX_CPS = 30;

/** LCS match ratio below this triggers full respread on large edits. */
export const LCS_RESPREAD_THRESHOLD = 0.5;
