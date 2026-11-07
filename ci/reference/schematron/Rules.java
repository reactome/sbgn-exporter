/*
 * libSBGN's Process Description rules (sbgn_pd.sch, ISO Schematron in XSLT 2.0) over a
 * folder of SBGN-ML files (spec 001 T021, research R11). Run by hand, never in CI, by
 * run.sh beside this file; it reads nothing but the files and opens no connection.
 *
 *     Rules official FILE...    libSBGN's own validator (org.sbgn.schematron.SchematronValidator)
 *                               on each file, as libSBGN ships it: it compiles the rules for
 *                               every file
 *     Rules folder FOLDER       the same two transforms, the rules compiled once, over every
 *                               .sbgn in the folder (a release in minutes, not hours)
 *
 * Both print one line per failed assertion, `file <TAB> severity <TAB> rule <TAB> about`,
 * as libSBGN's SVRLHandler reads them: the svrl:failed-assert's role (Error if none) and id,
 * and the svrl:diagnostic-reference named "id". run.sh checks on a sample that the two give
 * the same lines.
 */

import java.io.File;
import java.io.StringReader;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import javax.xml.parsers.SAXParserFactory;
import javax.xml.transform.Templates;
import javax.xml.transform.Transformer;
import javax.xml.transform.stream.StreamResult;
import javax.xml.transform.stream.StreamSource;
import org.sbgn.SbgnUtil;
import org.sbgn.schematron.Issue;
import org.sbgn.schematron.SchematronValidator;
import org.xml.sax.Attributes;
import org.xml.sax.InputSource;
import org.xml.sax.helpers.DefaultHandler;

public class Rules {

    public static void main(String[] args) throws Exception {
        if (args.length < 2) {
            System.err.println("Usage: Rules official FILE... | Rules folder FOLDER");
            System.exit(2);
        }
        if (args[0].equals("official")) {
            for (String name : Arrays.copyOfRange(args, 1, args.length)) {
                File file = new File(name);
                for (Issue issue : SchematronValidator.validate(file)) {
                    print(file.getName(), issue.getSeverity().toString(), issue.getRuleId(), issue.getAboutId());
                }
            }
            return;
        }
        // libSBGN's own two transforms (SchematronValidator.doValidation), the first done once.
        net.sf.saxon.TransformerFactoryImpl factory = new net.sf.saxon.TransformerFactoryImpl();
        Transformer compile = factory.newTransformer(new StreamSource(SbgnUtil.getResource("/iso_svrl_for_xslt2.xsl")));
        StringWriter compiled = new StringWriter();
        compile.transform(new StreamSource(SbgnUtil.getResource("/sbgn_pd.sch")), new StreamResult(compiled));
        Templates rules = factory.newTemplates(new StreamSource(new StringReader(compiled.toString())));
        File[] files = new File(args[1]).listFiles((dir, n) -> n.endsWith(".sbgn"));
        Arrays.sort(files);
        for (File file : files) {
            StringWriter svrl = new StringWriter();
            rules.newTransformer().transform(new StreamSource(file), new StreamResult(svrl));
            for (String[] issue : read(svrl.toString())) print(file.getName(), issue[0], issue[1], issue[2]);
        }
        System.err.println(files.length + " files");
    }

    static void print(String file, String severity, String rule, String about) {
        System.out.println(file + "\t" + severity.toUpperCase() + "\t" + rule + "\t" + about);
    }

    /** The failed assertions, as libSBGN's SVRLHandler reads them: [role, id, about]. */
    static List<String[]> read(String svrl) throws Exception {
        List<String[]> issues = new ArrayList<>();
        DefaultHandler handler = new DefaultHandler() {
            String role, rule, about, diagnostic;
            StringBuilder chars = new StringBuilder();
            boolean inReference;

            @Override
            public void startElement(String uri, String local, String name, Attributes a) {
                if (name.equals("svrl:failed-assert")) {
                    role = a.getValue("role") == null ? "Error" : a.getValue("role");
                    rule = a.getValue("id");
                } else if (name.equals("svrl:diagnostic-reference")) {
                    diagnostic = a.getValue("diagnostic");
                    chars.setLength(0);
                    inReference = true;
                }
            }

            @Override
            public void characters(char[] ch, int start, int length) {
                if (inReference) chars.append(ch, start, length);
            }

            @Override
            public void endElement(String uri, String local, String name) {
                if (name.equals("svrl:diagnostic-reference")) {
                    if ("id".equals(diagnostic)) about = chars.toString().trim();
                    inReference = false;
                } else if (name.equals("svrl:failed-assert")) {
                    issues.add(new String[] {role, rule, about});
                }
            }
        };
        SAXParserFactory.newInstance().newSAXParser().parse(new InputSource(new StringReader(svrl)), handler);
        return issues;
    }
}
