/*
 * The text widths diagram-exporter's SbgnConverter measures labels with (spec 001 T006,
 * research R5, D4), written as the table src/text-widths.json.
 *
 * SbgnConverter measures a unit of information's label and a compartment's name with
 *
 *     new Canvas().getFontMetrics(new Font("Arial", Font.PLAIN, 16)).stringWidth(text)
 *
 * and this program makes the same call, under Java 11 headless, as the content service
 * runs it. What Java 11's stringWidth does (sun.font.FontDesignMetrics) decides the
 * table's shape:
 *
 *  - it walks the string's UTF-16 code units. While each is a "simple" one, it adds
 *    that character's advance; a character the font cannot draw is given the font's
 *    missing glyph, and its advance;
 *  - at the first code unit that is not simple (sun.font.FontUtilities.isNonSimpleChar:
 *    combining marks, complex scripts, bidi and joiner controls, surrogates) it measures
 *    the whole string with a TextLayout instead, where a character's width can depend
 *    on its neighbours.
 *
 * So the table holds each simple code unit's width alone (in runs, leaving out those
 * that measure as the missing glyph, whose width it gives once) and the ranges of the
 * code units that are not simple, which the exporter does not measure (src/text-width.ts).
 *
 * Its checks, each of which makes it fail:
 *  - the font found is Arial itself, not the logical font Java falls back to when the
 *    name is not installed;
 *  - with a font file given, that file at 16 points measures every code unit the same,
 *    so which file the host's "Arial" is can be recorded;
 *  - the code units the font cannot draw mostly measure the advance of the font's own
 *    missing glyph;
 *  - a string of simple code units measures the sum of their widths: every pair of the
 *    characters the font draws, and seeded random strings of any simple code units.
 *
 * Run by hand, never in CI, with Java 11 (Java runs one source file without a build; the
 * export lets it ask FontUtilities which code units are simple):
 *
 *     java -Djava.awt.headless=true --add-exports java.desktop/sun.font=ALL-UNNAMED \
 *         ci/reference/widths/Widths.java OUT.json [ARIAL.ttf]
 *
 * It reads nothing but the fonts and opens no connection. It writes the table in
 * Prettier's layout, so the committed file is its output byte for byte.
 */

import java.awt.Canvas;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.GraphicsEnvironment;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Random;
import java.util.TreeMap;
import sun.font.FontUtilities;

public class Widths {

    /** The last UTF-16 code unit. */
    static final int LAST = 0xFFFF;

    public static void main(String[] args) throws Exception {
        if (args.length < 1 || args.length > 2) {
            System.err.println("usage: Widths OUT.json [ARIAL.ttf]");
            System.exit(2);
        }
        if (!GraphicsEnvironment.isHeadless()) fail("run headless, as the content service runs");

        // SbgnConverter's own call.
        Font font = new Font("Arial", Font.PLAIN, 16);
        FontMetrics metrics = new Canvas().getFontMetrics(font);

        String family = font.getFamily(Locale.ROOT);
        String name = font.getFontName(Locale.ROOT);
        if (!family.equals("Arial") || !name.equals("Arial")) {
            fail("\"Arial\" is " + name + " (" + family + "): Arial is not installed");
        }

        boolean[] simple = new boolean[LAST + 1];
        boolean[] drawn = new boolean[LAST + 1];
        int[] width = new int[LAST + 1];
        for (int c = 0; c <= LAST; c++) {
            simple[c] = !FontUtilities.isNonSimpleChar((char) c);
            drawn[c] = simple[c] && font.canDisplay(c);
            width[c] = simple[c] ? metrics.stringWidth(String.valueOf((char) c)) : -1;
        }

        // The file behind the name, when given: the same widths for every simple code unit.
        if (args.length == 2) {
            Font file = Font.createFont(Font.TRUETYPE_FONT, new File(args[1])).deriveFont(Font.PLAIN, 16f);
            FontMetrics fileMetrics = new Canvas().getFontMetrics(file);
            int differ = 0;
            for (int c = 0; c <= LAST; c++) {
                if (simple[c] && fileMetrics.stringWidth(String.valueOf((char) c)) != width[c]) differ++;
            }
            if (differ != 0) fail(differ + " code units measure differently in " + args[1]);
            System.err.println("font file " + args[1] + ": every code unit measures the same");
        }

        // The missing glyph's advance, and how the code units the font cannot draw measure.
        float missingAdvance = font.createGlyphVector(metrics.getFontRenderContext(), new int[] {font.getMissingGlyphCode()})
                .getGlyphMetrics(0).getAdvance();
        int missing = Math.round(missingAdvance);
        TreeMap<Integer, Integer> undrawn = new TreeMap<>();
        int simpleCount = 0;
        int drawnCount = 0;
        for (int c = 0; c <= LAST; c++) {
            if (simple[c]) simpleCount++;
            if (drawn[c]) drawnCount++;
            else if (simple[c]) undrawn.merge(width[c], 1, Integer::sum);
        }
        int mode = undrawn.entrySet().stream().max((a, b) -> a.getValue() - b.getValue()).get().getKey();
        if (mode != missing) fail("undrawn code units mostly measure " + mode + ", the missing glyph " + missing);

        // A string of simple code units measures the sum of their widths.
        int[] drawable = indices(drawn);
        int[] simples = indices(simple);
        long pairs = 0;
        for (int a : drawable) {
            for (int b : drawable) {
                String s = new String(new char[] {(char) a, (char) b});
                if (metrics.stringWidth(s) != width[a] + width[b]) {
                    fail(String.format("U+%04X U+%04X measures %d, not %d", a, b, metrics.stringWidth(s), width[a] + width[b]));
                }
                pairs++;
            }
        }
        Random random = new Random(20261106L);
        int strings = 100_000;
        for (int n = 0; n < strings; n++) {
            char[] cs = new char[1 + random.nextInt(60)];
            int sum = 0;
            for (int i = 0; i < cs.length; i++) {
                // Mostly what the font draws, as Reactome's names are, with any simple code unit.
                cs[i] = (char) (random.nextInt(8) == 0 ? simples[random.nextInt(simples.length)] : drawable[random.nextInt(drawable.length)]);
                sum += width[cs[i]];
            }
            String s = new String(cs);
            if (metrics.stringWidth(s) != sum) fail("a string measures " + metrics.stringWidth(s) + ", not " + sum + ": " + s);
        }

        List<int[]> runs = new ArrayList<>();
        List<int[]> whole = new ArrayList<>();
        for (int c = 0; c <= LAST; c++) {
            if (!simple[c]) {
                extend(whole, c, 0);
            } else if (width[c] != missing || drawn[c]) {
                extend(runs, c, width[c]);
            }
        }

        StringBuilder out = new StringBuilder();
        out.append("{\n");
        out.append("  \"font\": \"Arial\",\n");
        out.append("  \"style\": \"plain\",\n");
        out.append("  \"size\": 16,\n");
        out.append("  \"java\": \"").append(System.getProperty("java.version")).append("\",\n");
        out.append("  \"missing\": ").append(missing).append(",\n");
        out.append("  \"runs\": [\n");
        for (int i = 0; i < runs.size(); i++) {
            int[] r = runs.get(i);
            out.append("    [").append(r[0]).append(", ").append(r[1]).append(", ").append(r[2]).append(']');
            out.append(i + 1 < runs.size() ? ",\n" : "\n");
        }
        out.append("  ],\n");
        out.append("  \"whole\": [\n");
        for (int i = 0; i < whole.size(); i++) {
            int[] r = whole.get(i);
            out.append("    [").append(r[0]).append(", ").append(r[1]).append(']');
            out.append(i + 1 < whole.size() ? ",\n" : "\n");
        }
        out.append("  ]\n");
        out.append("}\n");
        Files.write(Paths.get(args[0]), out.toString().getBytes(StandardCharsets.UTF_8));

        System.err.println("java " + System.getProperty("java.version") + ", font " + name + " (" + family + ")");
        System.err.println("simple code units: " + simpleCount + ", drawn: " + drawnCount + "; the undrawn measure (width=count) " + undrawn);
        System.err.println("missing glyph: code " + font.getMissingGlyphCode() + ", advance " + missingAdvance + ", measures " + missing);
        System.err.println("summed: " + pairs + " pairs, " + strings + " random strings");
        System.err.println("runs: " + runs.size() + "; ranges not simple: " + whole.size());
    }

    /** The indices that are true. */
    static int[] indices(boolean[] set) {
        int n = 0;
        for (boolean b : set) if (b) n++;
        int[] out = new int[n];
        for (int c = 0, i = 0; c < set.length; c++) if (set[c]) out[i++] = c;
        return out;
    }

    /** Adds c to the last run when it follows it with the same width, else starts a run. */
    static void extend(List<int[]> runs, int c, int width) {
        int[] last = runs.isEmpty() ? null : runs.get(runs.size() - 1);
        if (last != null && last[1] == c - 1 && last[2] == width) last[1] = c;
        else runs.add(new int[] {c, c, width});
    }

    static void fail(String message) {
        System.err.println("Widths: " + message);
        System.exit(1);
    }
}
