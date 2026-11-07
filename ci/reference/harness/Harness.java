/*
 * Java's reference answers (spec 001 T012, research R13): diagram-exporter 2.0.12's own
 * SbgnConverter, and libSBGN 0.2's own writer, run on diagram layouts. Run in the
 * container ci/reference/harness/run.sh builds, with no network; never in CI.
 *
 *     Harness MODE IN OUT
 *
 * IN is a layout file (a release's diagram/{stId}.json, or a reaction's layout as the
 * content service answers it) and OUT the file to write; or IN is a folder, every *.json
 * in it is read, and OUT is a folder where each answer is written under the layout's
 * name, with the mode's extension. A layout Java fails on is named on standard error,
 * the rest are written, and the exit status is 1.
 *
 * MODE is what is written:
 *
 *  - sbgn: Java's answer as the content service writes it: SbgnConverter.getSbgn(), then
 *    SbgnUtil.writeToFile. Its glyph and arc order is Java's own, which changes from run
 *    to run (research R3.1), and so do some of its points (R3.2).
 *  - ordered (.sbgn): the same, its glyphs and arcs first put in the fixed order (D1:
 *    compartments, nodes, edges in layout order; arcs by node, then connector) and its
 *    stoichiometry glyphs written cardinality (D3). For a layout without production arcs,
 *    this exporter's answer byte for byte (test/write.test.ts).
 *  - json: getSbgn()'s map as JSON, glyphs (with theirs) and arcs sorted by id, each float
 *    widened to a double (Double.toString, exact): what test/convert.test.ts compares with.
 *  - model (.sbgn): IN is a document model as JSON (src/model.ts's shape); libSBGN's
 *    bindings are built from it, each number cast to float, and written by its writer.
 *  - arcs-fresh, arcs-in-order (.jsonl): each edge's process box and ports, then each
 *    connector's arc points, one JSON object a line, from getEdgeGlyph and getArc (private;
 *    called by reflection, which is why this class is in the converter's package). Fresh
 *    reads the layout anew for every arc, so the backbone is as given when it starts (D2's
 *    reading); in order writes the arcs one after another from one reading, as getSbgn
 *    does, so each OUTPUT's reversal of the backbone carries over.
 *
 * Every mode checks first that Java's "Arial" is Arial itself, not the logical font Java
 * falls back to when the name is not installed: label widths are Arial's (D4).
 */
package org.reactome.server.tools.diagram.exporter.sbgn;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.reactome.server.tools.diagram.data.DiagramFactory;
import org.reactome.server.tools.diagram.data.layout.Compartment;
import org.reactome.server.tools.diagram.data.layout.Connector;
import org.reactome.server.tools.diagram.data.layout.Diagram;
import org.reactome.server.tools.diagram.data.layout.DiagramObject;
import org.reactome.server.tools.diagram.data.layout.Edge;
import org.reactome.server.tools.diagram.data.layout.Node;
import org.sbgn.SbgnUtil;
import org.sbgn.bindings.Arc;
import org.sbgn.bindings.Bbox;
import org.sbgn.bindings.Glyph;
import org.sbgn.bindings.Label;
import org.sbgn.bindings.Port;
import org.sbgn.bindings.Sbgn;

import java.awt.Font;
import java.io.File;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.StringJoiner;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class Harness {

    public static void main(String[] args) throws Exception {
        if (args.length != 3) {
            System.err.println("Usage: Harness sbgn|ordered|json|model|arcs-fresh|arcs-in-order IN OUT");
            System.exit(2);
        }
        String family = new Font("Arial", Font.PLAIN, 16).getFamily(Locale.ROOT);
        if (!family.equals("Arial")) {
            System.err.println("Java's \"Arial\" is " + family + ": Arial is not installed");
            System.exit(2);
        }
        String mode = args[0];
        String extension = mode.equals("json") ? ".json" : mode.startsWith("arcs") ? ".jsonl" : ".sbgn";
        Path in = Paths.get(args[1]);
        Path out = Paths.get(args[2]);
        boolean failed = false;
        if (Files.isDirectory(in)) {
            Files.createDirectories(out);
            List<Path> layouts;
            try (Stream<Path> files = Files.list(in)) {
                layouts = files.filter(p -> p.toString().endsWith(".json")).sorted().collect(Collectors.toList());
            }
            for (Path layout : layouts) {
                String name = layout.getFileName().toString().replaceFirst("\\.json$", extension);
                failed |= !run(mode, layout, out.resolve(name));
            }
        } else {
            failed = !run(mode, in, out);
        }
        System.exit(failed ? 1 : 0);
    }

    /** One layout's answer; false, with the reason on standard error, where Java fails. */
    static boolean run(String mode, Path in, Path out) {
        try {
            String json = new String(Files.readAllBytes(in), StandardCharsets.UTF_8);
            switch (mode) {
                case "sbgn":
                    SbgnUtil.writeToFile(new SbgnConverter(DiagramFactory.getDiagram(json)).getSbgn(), out.toFile());
                    break;
                case "ordered":
                    SbgnUtil.writeToFile(ordered(DiagramFactory.getDiagram(json)), out.toFile());
                    break;
                case "json":
                    write(out, Dump.document(new SbgnConverter(DiagramFactory.getDiagram(json)).getSbgn()) + "\n");
                    break;
                case "model":
                    SbgnUtil.writeToFile(new Model().document(new ObjectMapper().readTree(json)), out.toFile());
                    break;
                case "arcs-fresh":
                case "arcs-in-order":
                    write(out, Arcs.of(json, mode.equals("arcs-fresh")));
                    break;
                default:
                    System.err.println("Unknown mode " + mode);
                    return false;
            }
            return true;
        } catch (Exception | Error e) {
            Throwable cause = e instanceof InvocationTargetException ? e.getCause() : e;
            System.err.println(in.getFileName() + ": " + cause);
            return false;
        }
    }

    static void write(Path out, String text) throws Exception {
        Files.write(out, text.getBytes(StandardCharsets.UTF_8));
    }

    /** getSbgn(), in the fixed order (D1), stoichiometry written cardinality (D3). */
    static Sbgn ordered(Diagram d) {
        Sbgn sbgn = new SbgnConverter(d).getSbgn();
        List<String> order = new ArrayList<>();
        for (Compartment c : d.getCompartments()) order.add("compartmentVertex_" + c.getReactomeId() + "_" + c.getId());
        for (Node n : d.getNodes()) order.add("entityVertex_" + n.getReactomeId() + "_" + n.getId());
        for (Edge e : d.getEdges()) order.add("reactionVertex_" + e.getReactomeId() + "_" + e.getId());
        for (Node n : d.getNodes()) {
            for (Connector c : n.getConnectors()) {
                order.add("arc_" + n.getId() + "_" + c.getType().toLowerCase() + "_" + c.getEdgeId());
            }
        }
        sbgn.getMap().getGlyph().sort(Comparator.comparingInt((Glyph g) -> order.indexOf(g.getId())));
        sbgn.getMap().getArc().sort(Comparator.comparingInt((Arc a) -> order.indexOf(a.getId())));
        for (Arc a : sbgn.getMap().getArc()) {
            for (Glyph g : a.getGlyph()) if (g.getClazz().equals("stoichiometry")) g.setClazz("cardinality");
        }
        return sbgn;
    }

    static String f(float v) {
        return Double.toString((double) v);
    }

    /** getSbgn()'s map as JSON, sorted by id. */
    static class Dump {
        static String text(String v) {
            StringBuilder b = new StringBuilder("\"");
            for (char c : v.toCharArray()) {
                if (c == '"' || c == '\\') b.append('\\').append(c);
                else if (c < 0x20 || c > 0x7e) b.append(String.format("\\u%04x", (int) c));
                else b.append(c);
            }
            return b.append('"').toString();
        }

        static String box(Bbox b) {
            return "{\"x\":" + f(b.getX()) + ",\"y\":" + f(b.getY()) + ",\"w\":" + f(b.getW()) + ",\"h\":" + f(b.getH()) + "}";
        }

        static String point(float x, float y) {
            return "{\"x\":" + f(x) + ",\"y\":" + f(y) + "}";
        }

        static String id(Object o) {
            if (o instanceof Glyph) return ((Glyph) o).getId();
            if (o instanceof Port) return ((Port) o).getId();
            throw new IllegalStateException(String.valueOf(o));
        }

        static String glyph(Glyph g) {
            StringBuilder b = new StringBuilder("{\"class\":" + text(g.getClazz()) + ",\"id\":" + text(g.getId()));
            if (g.getCompartmentOrder() != null) b.append(",\"compartmentOrder\":").append(f(g.getCompartmentOrder()));
            if (g.getLabel() != null) {
                b.append(",\"label\":{\"text\":").append(text(g.getLabel().getText()));
                if (g.getLabel().getBbox() != null) b.append(",\"bbox\":").append(box(g.getLabel().getBbox()));
                b.append('}');
            }
            if (g.getBbox() != null) b.append(",\"bbox\":").append(box(g.getBbox()));
            b.append(",\"glyphs\":").append(glyphs(g.getGlyph()));
            b.append(",\"ports\":[");
            for (int i = 0; i < g.getPort().size(); i++) {
                Port p = g.getPort().get(i);
                b.append(i > 0 ? "," : "").append("{\"id\":" + text(p.getId()) + ",\"x\":" + f(p.getX()) + ",\"y\":" + f(p.getY()) + "}");
            }
            return b.append("]}").toString();
        }

        static String glyphs(List<Glyph> list) {
            List<Glyph> sorted = new ArrayList<>(list);
            sorted.sort(Comparator.comparing(Glyph::getId));
            StringJoiner j = new StringJoiner(",\n", "[", "]");
            for (Glyph g : sorted) j.add(glyph(g));
            return j.toString();
        }

        static String document(Sbgn sbgn) {
            org.sbgn.bindings.Map map = sbgn.getMap();
            StringBuilder out = new StringBuilder("{\"language\":" + text(map.getLanguage()) + ",\n\"glyphs\":" + glyphs(map.getGlyph()) + ",\n\"arcs\":[");
            List<Arc> arcs = new ArrayList<>(map.getArc());
            arcs.sort(Comparator.comparing(Arc::getId));
            for (int i = 0; i < arcs.size(); i++) {
                Arc a = arcs.get(i);
                out.append(i > 0 ? ",\n" : "").append("{\"class\":" + text(a.getClazz()) + ",\"id\":" + text(a.getId())
                        + ",\"source\":" + text(id(a.getSource())) + ",\"target\":" + text(id(a.getTarget()))
                        + ",\"glyphs\":" + glyphs(a.getGlyph()));
                if (a.getStart() != null) {
                    out.append(",\"start\":").append(point(a.getStart().getX(), a.getStart().getY())).append(",\"next\":[");
                    for (int k = 0; k < a.getNext().size(); k++) {
                        out.append(k > 0 ? "," : "").append(point(a.getNext().get(k).getX(), a.getNext().get(k).getY()));
                    }
                    out.append("],\"end\":").append(point(a.getEnd().getX(), a.getEnd().getY()));
                }
                out.append('}');
            }
            return out.append("]}").toString();
        }
    }

    /** libSBGN's bindings built from a document model given as JSON. */
    static class Model {
        final java.util.Map<String, Object> refs = new HashMap<>();

        static float number(JsonNode n, String field) {
            return (float) n.get(field).doubleValue();
        }

        static Bbox box(JsonNode n) {
            Bbox b = new Bbox();
            b.setX(number(n, "x"));
            b.setY(number(n, "y"));
            b.setW(number(n, "w"));
            b.setH(number(n, "h"));
            return b;
        }

        Glyph glyph(JsonNode n) {
            Glyph g = new Glyph();
            g.setClazz(n.get("class").asText());
            g.setId(n.get("id").asText());
            if (n.has("compartmentOrder")) g.setCompartmentOrder(number(n, "compartmentOrder"));
            Label l = new Label();
            l.setText(n.get("label").get("text").asText());
            if (n.get("label").has("bbox")) l.setBbox(box(n.get("label").get("bbox")));
            g.setLabel(l);
            g.setBbox(box(n.get("bbox")));
            for (JsonNode c : n.get("glyphs")) g.getGlyph().add(glyph(c));
            for (JsonNode p : n.get("ports")) {
                Port port = new Port();
                port.setId(p.get("id").asText());
                port.setX(number(p, "x"));
                port.setY(number(p, "y"));
                g.getPort().add(port);
                refs.put(port.getId(), port);
            }
            refs.put(g.getId(), g);
            return g;
        }

        Sbgn document(JsonNode doc) {
            org.sbgn.bindings.Map map = new org.sbgn.bindings.Map();
            map.setLanguage(doc.get("language").asText());
            for (JsonNode g : doc.get("glyphs")) map.getGlyph().add(glyph(g));
            for (JsonNode n : doc.get("arcs")) {
                Arc a = new Arc();
                a.setClazz(n.get("class").asText());
                a.setId(n.get("id").asText());
                a.setSource(refs.get(n.get("source").asText()));
                a.setTarget(refs.get(n.get("target").asText()));
                for (JsonNode c : n.get("glyphs")) a.getGlyph().add(glyph(c));
                Arc.Start s = new Arc.Start();
                s.setX(number(n.get("start"), "x"));
                s.setY(number(n.get("start"), "y"));
                a.setStart(s);
                for (JsonNode p : n.get("next")) {
                    Arc.Next x = new Arc.Next();
                    x.setX(number(p, "x"));
                    x.setY(number(p, "y"));
                    a.getNext().add(x);
                }
                Arc.End e = new Arc.End();
                e.setX(number(n.get("end"), "x"));
                e.setY(number(n.get("end"), "y"));
                a.setEnd(e);
                map.getArc().add(a);
            }
            Sbgn sbgn = new Sbgn();
            sbgn.setMap(map);
            return sbgn;
        }
    }

    /** Process boxes, ports and arc points from SbgnConverter's private methods. */
    static class Arcs {
        static final Method EDGE_GLYPH;
        static final Method NODE_GLYPH;
        static final Method ARC;
        static final Field GLYPH_MAP;

        static {
            try {
                EDGE_GLYPH = SbgnConverter.class.getDeclaredMethod("getEdgeGlyph", Edge.class);
                NODE_GLYPH = SbgnConverter.class.getDeclaredMethod("getNodeGlyph", Node.class);
                ARC = SbgnConverter.class.getDeclaredMethod("getArc", Participant.class);
                GLYPH_MAP = SbgnConverter.class.getDeclaredField("glyphMap");
                EDGE_GLYPH.setAccessible(true);
                NODE_GLYPH.setAccessible(true);
                ARC.setAccessible(true);
                GLYPH_MAP.setAccessible(true);
            } catch (ReflectiveOperationException e) {
                throw new ExceptionInInitializerError(e);
            }
        }

        static String point(float x, float y) {
            return "[" + f(x) + "," + f(y) + "]";
        }

        @SuppressWarnings("unchecked")
        static java.util.Map<DiagramObject, Glyph> glyphs(SbgnConverter c) throws Exception {
            return (java.util.Map<DiagramObject, Glyph>) GLYPH_MAP.get(c);
        }

        /** A converter whose glyphs are made, as getSbgn makes them, without its arcs. */
        static SbgnConverter converter(Diagram d, StringBuilder out, boolean report) throws Exception {
            SbgnConverter c = new SbgnConverter(d);
            java.util.Map<DiagramObject, Glyph> g = glyphs(c);
            for (Node n : d.getNodes()) g.put(n, (Glyph) NODE_GLYPH.invoke(c, n));
            for (Edge e : d.getEdges()) {
                try {
                    g.put(e, (Glyph) EDGE_GLYPH.invoke(c, e));
                } catch (InvocationTargetException x) {
                    if (report) out.append("{\"edge\":" + e.getId() + ",\"throws\":\"" + x.getCause().getClass().getSimpleName() + "\"}\n");
                }
            }
            return c;
        }

        static String of(String json, boolean fresh) throws Exception {
            StringBuilder out = new StringBuilder();
            Diagram d = DiagramFactory.getDiagram(json);
            SbgnConverter c = converter(d, out, true);
            java.util.Map<DiagramObject, Glyph> g = glyphs(c);
            for (Edge e : d.getEdges()) {
                Glyph gl = g.get(e);
                if (gl == null) continue;
                Bbox b = gl.getBbox();
                Port p1 = gl.getPort().get(0);
                Port p2 = gl.getPort().get(1);
                out.append("{\"edge\":" + e.getId() + ",\"box\":[" + f(b.getX()) + "," + f(b.getY()) + "," + f(b.getW()) + "," + f(b.getH())
                        + "],\"ports\":[" + point(p1.getX(), p1.getY()) + "," + point(p2.getX(), p2.getY()) + "]}\n");
            }
            for (int ni = 0; ni < d.getNodes().size(); ni++) {
                for (int ci = 0; ci < d.getNodes().get(ni).getConnectors().size(); ci++) {
                    Diagram dd = d;
                    SbgnConverter cc = c;
                    if (fresh) {
                        dd = DiagramFactory.getDiagram(json);
                        cc = converter(dd, out, false);
                    }
                    Node n = dd.getNodes().get(ni);
                    Connector k = n.getConnectors().get(ci);
                    Edge e = null;
                    for (Edge x : dd.getEdges()) if (x.getId().equals(k.getEdgeId())) e = x;
                    String id = "\"node\":" + n.getId() + ",\"connector\":" + ci;
                    try {
                        Arc a = (Arc) ARC.invoke(cc, new Participant(n, e, k));
                        if (a.getStart() == null) {
                            out.append("{" + id + ",\"points\":null}\n");
                            continue;
                        }
                        StringJoiner next = new StringJoiner(",");
                        for (Arc.Next x : a.getNext()) next.add(point(x.getX(), x.getY()));
                        out.append("{" + id + ",\"start\":" + point(a.getStart().getX(), a.getStart().getY()) + ",\"next\":[" + next
                                + "],\"end\":" + point(a.getEnd().getX(), a.getEnd().getY()) + "}\n");
                    } catch (InvocationTargetException x) {
                        out.append("{" + id + ",\"throws\":\"" + x.getCause().getClass().getSimpleName() + "\"}\n");
                    }
                }
            }
            return out.toString();
        }
    }
}
