/**
 * A float's text as JDK 11's `Float.toString` writes it, which libSBGN's writer uses for
 * every number in Java's SBGN files (research R4).
 *
 * JDK 11 does not always write the fewest digits that read back as the same float
 * (`3.0E10` is written `3.0000001E10`, `1.0E-45` is written `1.4E-45`), and later JDKs
 * do, so neither JavaScript's own shortest form nor a newer JDK's will do: this follows
 * JDK 11's own steps. It is an independent implementation, written for this repository,
 * of the algorithm of OpenJDK 11's `jdk.internal.math.FloatingDecimal` for a float
 * (`dtoa` in its compatible format, and `getChars`); no OpenJDK source text is copied.
 *
 * In outline: a float that is a whole number below 2^63 is written from its integer,
 * rounded to the digits its precision supports. Any other is developed digit by digit
 * as the quotient of two integers B / S, stopping once the remainder is within half an
 * ulp (M) of either neighbour, and rounding the last digit by that remainder. Java does
 * this in 32-bit integers, 64-bit integers or big integers according to the operands'
 * estimated sizes, each with its own wrap-around and its own stopping test; all three
 * are kept, because each can decide a digit.
 */
declare const float32Brand: unique symbol;
/** A number that is exactly a float: `Math.fround` leaves it as it is. */
export type Float32 = number & {
    readonly [float32Brand]: true;
};
/** Whether a number is exactly a float (NaN and both zeros are). */
export declare function isFloat32(value: number): value is Float32;
/** A double rounded to float, as Java's `floatValue()` and `(float)` do. */
export declare function float32(value: number): Float32;
/** The float with these IEEE 754 single-precision bits, an unsigned 32-bit integer. */
export declare function floatFromBits(bits: number): Float32;
/** The float's text as JDK 11's `Float.toString(f)` writes it. */
export declare function javaFloat(value: Float32): string;
export {};
