#!/bin/sh
# Runs inside gizra-postgres as OS user postgres.
set -eu
HBA="/var/lib/postgresql/data/pg_hba.conf"
MARKER="# gizra-docker-internal-trust"

if grep -qF "$MARKER" "$HBA" 2>/dev/null; then
  echo "already"
  exit 0
fi

TMP="$(mktemp)"
awk -v m="$MARKER" '
  !inserted && ($0 ~ /^host[^[:space:]]/ || $0 ~ /^host[[:space:]]/) {
    print m
    print "host all all 10.0.0.0/8 trust"
    print "host all all 172.16.0.0/12 trust"
    print "host all all 192.168.0.0/16 trust"
    inserted=1
  }
  { print }
  END {
    if (!inserted) {
      print m
      print "host all all 10.0.0.0/8 trust"
      print "host all all 172.16.0.0/12 trust"
      print "host all all 192.168.0.0/16 trust"
    }
  }
' "$HBA" > "$TMP"
mv "$TMP" "$HBA"
echo "updated"
