# The Java reference harness (spec 001 T012, research R13): diagram-exporter 2.0.12's
# SbgnConverter and libSBGN 0.2's writer under Java 11, as the content service runs them.
# Built and run by run.sh beside this file, by hand, never in CI.
#
# The jars are fetched here, at build time, from the repositories pom.xml names, and
# checked against jars.sha256; nothing is fetched when the harness runs, which is with no
# network. Arial is not in the image: its licence does not allow the font file to be
# redistributed, so run.sh mounts the host's, read only.

FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /harness
COPY pom.xml jars.sha256 Harness.java ./
RUN mvn -B -q dependency:copy-dependencies -DoutputDirectory=/harness/jars \
    && (cd jars && ls > ../jars.found && sha256sum -c ../jars.sha256) \
    && (cut -c67- jars.sha256 | sort | diff - jars.found) \
    && javac --release 11 -nowarn -cp 'jars/*' -d classes Harness.java

FROM eclipse-temurin:11-jre
COPY --from=build /harness/jars /opt/harness/jars
COPY --from=build /harness/classes /opt/harness/classes
USER 65534:65534
ENTRYPOINT ["java", "-Djava.awt.headless=true", "-cp", "/opt/harness/classes:/opt/harness/jars/*", \
    "org.reactome.server.tools.diagram.exporter.sbgn.Harness"]
