#!/usr/bin/env bash
# Validates every .sbgn file under a folder against libSBGN 0.2's schema (spec 001 T003,
# research R11, constitution IV).
#
#   ci/validate.sh FOLDER
#
# The schema is libSBGN's resources/SBGN.xsd at the milestone2 tag, the version Java's
# files declare (http://sbgn.org/libsbgn/0.2). It is fetched from libSBGN's repository at
# that commit, not committed here, and refused unless its git blob hash is the one pinned
# below. SBGN_XSD may name a local copy to use instead of fetching; it is checked by the
# same hash.
#
# libSBGN, and so SBGN.xsd, is Copyright 2010-2011 LibSBGN community, available under
# either the GNU LGPL 2.1 or later or the Apache License 2.0 (libSBGN's COPYING.txt). It is
# used here under the Apache License 2.0, and only fetched, never redistributed.
#
# The validator is libxml2's xmllint (CI installs libxml2-utils); its version is printed
# with the verdict. The PD rules (sbgn_pd.sch) need XSLT 2.0 and are not run here.
#
# Exit status: 0 every file valid; 1 a file invalid; 2 nothing validated (a missing
# folder, no .sbgn files in it, no xmllint, or the schema missing or not the pinned one).

set -euo pipefail

readonly COMMIT=5c186ad45a28fc863a2449a3a49c6b0855af6fd7
readonly BLOB=2b7072cb5c090f864de2dda5160a2a8ae178bbac
readonly URL="https://raw.githubusercontent.com/sbgn/libsbgn/${COMMIT}/resources/SBGN.xsd"

refuse() {
    echo "ci/validate.sh: $*" >&2
    exit 2
}

[ $# -eq 1 ] || refuse "usage: ci/validate.sh FOLDER"
folder=$1
[ -d "$folder" ] || refuse "no such folder: $folder"
command -v xmllint >/dev/null || refuse "xmllint is not installed (libxml2-utils)"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
schema="$work/SBGN.xsd"

if [ -n "${SBGN_XSD:-}" ]; then
    cp "$SBGN_XSD" "$schema" || refuse "cannot read SBGN_XSD: $SBGN_XSD"
else
    curl -sSfL --retry 3 -o "$schema" "$URL" || refuse "cannot fetch $URL"
fi

# git's blob hash, without needing git: sha1 of "blob <size>\0" and the bytes.
size=$(wc -c <"$schema")
hash=$({ printf 'blob %d\0' "$size"; cat "$schema"; } | sha1sum | cut -d' ' -f1)
[ "$hash" = "$BLOB" ] || refuse "SBGN.xsd's blob hash is $hash, not libSBGN milestone2's $BLOB"

mapfile -d '' files < <(find "$folder" -type f -name '*.sbgn' -print0 | sort -z)
[ "${#files[@]}" -gt 0 ] || refuse "no .sbgn files under $folder"

echo "$(xmllint --version 2>&1 | head -n 1), libSBGN SBGN.xsd at ${COMMIT}"

valid=0
invalid=0
for file in "${files[@]}"; do
    # xmllint names the file and says "validates" or "fails to validate", with the
    # reasons, on standard error.
    if xmllint --noout --nonet --schema "$schema" "$file"; then
        valid=$((valid + 1))
    else
        invalid=$((invalid + 1))
    fi
done

echo "${#files[@]} files, ${valid} valid, ${invalid} invalid"
[ "$invalid" -eq 0 ]
