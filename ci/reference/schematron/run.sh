#!/bin/sh
# libSBGN's Process Description rules (sbgn_pd.sch) over a folder of SBGN-ML files (spec 001
# T021, research R11). Run by hand, never in CI.
#
#     ci/reference/schematron/run.sh CACHE FOLDER > failed.tsv
#
# The rules are XSLT 2.0 Schematron, which libxml2 cannot run. They are run by libSBGN
# 0.2's own Java pipeline (Rules.java beside this script): libSBGN's iso_svrl_for_xslt2.xsl
# compiles the sbgn_pd.sch libsbgn-0.2.jar carries, and Saxon-HE runs the result. The jars
# and stylesheets are fetched into CACHE once, each checked against the SHA-256 below;
# the run itself reads nothing but FOLDER and opens no connection. Needs a JDK 11 or later
# (javac, java).
#
# Licences: Saxon-HE is Mozilla Public License 2.0 (Saxonica); libSBGN, its rules and its
# stylesheets are LGPL 2.1 or later, or Apache 2.0 (libSBGN's COPYING.txt; the ISO
# Schematron skeleton's own notice, in the file, is MIT-style); JAXB and the activation
# framework are CDDL 1.1 / GPL 2.0 with the classpath exception. None is committed, none is
# a dependency of this package, and none is redistributed: they are fetched for a run.
#
# Output: one line per failed assertion, `file <TAB> severity <TAB> rule <TAB> object id`,
# as libSBGN's own validator reads them; FOLDER mode compiles the rules once. Before the
# folder, a sample of its files is run through libSBGN's own SchematronValidator too, and
# the run stops if the two disagree.
set -eu
if [ $# -ne 2 ]; then sed -n '2,24p' "$0" >&2; exit 2; fi
cache=$1
folder=$2
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$cache/res" "$cache/classes"

LIBSBGN=5c186ad45a28fc863a2449a3a49c6b0855af6fd7
MAVEN=https://repo1.maven.org/maven2
fetch() { # url name sha256
    if [ ! -f "$cache/$2" ]; then curl -sSfL -o "$cache/$2.part" "$1" && mv "$cache/$2.part" "$cache/$2"; fi
    echo "$3  $cache/$2" | sha256sum -c --quiet - || { echo "$2 is not the file pinned here" >&2; exit 2; }
}
fetch "$MAVEN/net/sf/saxon/Saxon-HE/9.9.1-8/Saxon-HE-9.9.1-8.jar" Saxon-HE-9.9.1-8.jar 504ad5c71b55a3fd04c5609419b5e51d51b419f26628b4b6254c38766487abdf
fetch https://www.biopax.org/m2repo/releases/org/sbgn/libsbgn/0.2/libsbgn-0.2.jar libsbgn-0.2.jar d0664655f95aed79bd21da69c6d0c835bfa1d4b974a42fa3d4ba58c56f9b1dbb
fetch "$MAVEN/javax/xml/bind/jaxb-api/2.3.0/jaxb-api-2.3.0.jar" jaxb-api-2.3.0.jar 883007989d373d19f352ba9792b25dec21dc7d0e205a710a93a3815101bb3d03
fetch "$MAVEN/org/glassfish/jaxb/jaxb-runtime/2.3.0/jaxb-runtime-2.3.0.jar" jaxb-runtime-2.3.0.jar da804c5e0d11414529caa39e83cb17c10f89b872fbfefee7c826bd117693dd49
fetch "$MAVEN/org/glassfish/jaxb/jaxb-core/2.3.0/jaxb-core-2.3.0.jar" jaxb-core-2.3.0.jar 055d062b049eb3195331c7822c71b86532883535bab87bb2f899a266097db493
fetch "$MAVEN/org/glassfish/jaxb/txw2/2.3.0/txw2-2.3.0.jar" txw2-2.3.0.jar a30888c85399f9e472ead38c495a21a425ba61412a14084493c090360c40e3f0
fetch "$MAVEN/com/sun/istack/istack-commons-runtime/3.0.5/istack-commons-runtime-3.0.5.jar" istack-commons-runtime-3.0.5.jar f19ac45cfbbe12fa952be1e691eae80a74c9c7f4ac46ab3f760ca9cfa3bc694b
fetch "$MAVEN/javax/activation/activation/1.1.1/activation-1.1.1.jar" activation-1.1.1.jar ae475120e9fcd99b4b00b38329bd61cdc5eb754eee03fe66c01f50e137724f99
for xsl in iso_svrl_for_xslt2.xsl:8bc20809aa8eb46aa1e18b1cd7219a451f4588643d9440da3d4b0c076f47213e \
           iso_schematron_skeleton_for_saxon.xsl:2ae7da140a15bc6630327c1371ff095701029b66d5653978bcf19b7d8295630c; do
    fetch "https://raw.githubusercontent.com/sbgn/libsbgn/$LIBSBGN/org.sbgn/resources/${xsl%%:*}" "res/${xsl%%:*}" "${xsl#*:}"
done

cp=$cache/classes:$cache/res
for jar in "$cache"/*.jar; do cp=$cp:$jar; done
javac --release 11 -nowarn -cp "$cp" -d "$cache/classes" "$here/Rules.java"
sample=$(find "$folder" -maxdepth 1 -name '*.sbgn' | sort | head -n 5)
# shellcheck disable=SC2086
java -cp "$cp" Rules official $sample | sort > "$cache/official.tsv"
java -Xmx2g -cp "$cp" Rules folder "$folder" > "$cache/folder.tsv"
pattern=$(for f in $sample; do basename "$f"; done | paste -sd'|')
if ! grep -E "^($pattern)	" "$cache/folder.tsv" | sort | cmp -s - "$cache/official.tsv"; then
    echo "libSBGN's own validator and the compiled-once run disagree on the sample" >&2
    exit 2
fi
cat "$cache/folder.tsv"
