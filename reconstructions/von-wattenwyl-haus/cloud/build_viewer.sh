#!/bin/bash
# Build a streamed web viewer for a splat trained on the cloud machine (viewer/make_viewer.py --lod), with the
# capture positions taken from the training dataset instead of Matterport's metadata.
#
#   bash build_viewer.sh SPLAT DATASET NAME "TITLE" "NOTE"
#   bash build_viewer.sh /root/out/full-10m-150k/splat_150000.ply /root/ds-full lichtfeld-hq "..." "..."
#
# Writes /workspace/vwh/viewer/output/NAME.html and NAME/ (the level-of-detail bundle).
set -euo pipefail
SPLAT=$1; DATASET=$2; NAME=$3; TITLE=$4; NOTE=$5
VWH=/workspace/vwh
[ -f /workspace/lichtfeld/lichtfeld.env ] && source /workspace/lichtfeld/lichtfeld.env  # library paths, see install_lichtfeld.sh
LICHTFELD=$(find /workspace/lichtfeld -maxdepth 2 -type f -name LichtFeld-Studio -perm -u+x | head -1)
if ! command -v npx > /dev/null; then  # Node.js 22 LTS from nodejs.org, checked against its published checksums
  mkdir -p /opt/node && cd /tmp
  curl -fsSLO https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt
  FILE=$(grep -oE 'node-v22\.[0-9.]+-linux-x64\.tar\.xz' SHASUMS256.txt | head -1)
  curl -fsSLO "https://nodejs.org/dist/latest-v22.x/$FILE"
  grep " $FILE\$" SHASUMS256.txt | sha256sum -c
  tar -xJf "$FILE" -C /opt/node --strip-components=1
  export PATH=/opt/node/bin:$PATH
fi
mkdir -p "$VWH/viewer/output"
python3 "$VWH/viewer/make_viewer.py" "$SPLAT" --lichtfeld "$LICHTFELD" --lod --dataset "$DATASET" --sweep 27 --toward 0 \
  --out "$VWH/viewer/output/$NAME.html" --title "$TITLE" --note "$NOTE"
du -sh "$VWH/viewer/output/$NAME.html" "$VWH/viewer/output/$NAME"
