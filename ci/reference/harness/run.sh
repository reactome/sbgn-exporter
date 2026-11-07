#!/bin/sh
# Java's reference answers for diagram layouts (spec 001 T012, research R13), from
# diagram-exporter 2.0.12's SbgnConverter and libSBGN 0.2's writer under Java 11, in a
# container with no network. Run by hand when a fixture is added or a release is compared
# (T013, T032); never in CI.
#
#     ARIAL=/path/to/arial.ttf ci/reference/harness/run.sh MODE IN OUT
#
# MODE, IN and OUT are Harness.java's (its header says what each mode writes): IN a layout
# file and OUT the file to write, or IN a folder of layouts and OUT a folder.
#
# - The image (sbgn-reference-harness) is built from this folder the first time, and
#   whenever it changes: that build fetches the jars pom.xml names and checks them against
#   jars.sha256. Nothing is fetched when the harness runs.
# - ARIAL is the Arial plain font file Java is to measure labels with. Arial's licence does
#   not allow the file to be redistributed, so it is not in the image or this repository:
#   the host's is mounted, read only, where the image's fontconfig finds it. Its SHA-256 is
#   printed, to be recorded with the answers. The harness refuses to run if Java's "Arial"
#   is not Arial.
# - The run has no network (--network none): a container with one could reach whatever
#   the host reaches.
#
# Remove the image afterwards with `docker rmi sbgn-reference-harness`.
set -eu

if [ $# -ne 3 ] || [ -z "${ARIAL:-}" ]; then
    sed -n '2,25p' "$0" >&2
    exit 2
fi
mode=$1
in=$2
out=$3
[ -f "$ARIAL" ] || { echo "ARIAL: no such file: $ARIAL" >&2; exit 2; }
[ -e "$in" ] || { echo "No such layout or folder: $in" >&2; exit 2; }

here=$(cd "$(dirname "$0")" && pwd)
docker build -q -t sbgn-reference-harness "$here" >/dev/null

echo "Arial: $(sha256sum "$ARIAL" | cut -d' ' -f1)" >&2

arial=/usr/share/fonts/truetype/arial/arial.ttf
if [ -d "$in" ]; then
    mkdir -p "$out"
    exec docker run --rm --network none --user "$(id -u):$(id -g)" -e HOME=/tmp \
        -v "$(realpath "$ARIAL"):$arial:ro" \
        -v "$(realpath "$in"):/in:ro" -v "$(realpath "$out"):/out" \
        sbgn-reference-harness "$mode" /in /out
fi
outdir=$(dirname "$out")
mkdir -p "$outdir"
exec docker run --rm --network none --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$(realpath "$ARIAL"):$arial:ro" \
    -v "$(realpath "$in"):/in/$(basename "$in"):ro" -v "$(realpath "$outdir"):/out" \
    sbgn-reference-harness "$mode" "/in/$(basename "$in")" "/out/$(basename "$out")"
