#!/bin/bash
# Check run (B2) on the training machine: dataset in the images-only frame, then LichtFeld with the laptop's settings
# (mrnf, 3 million cap, 60k steps), so the result compares with lichtfeld/output/full-loma-x2.
# Expects /workspace/vwh (scripts, alignment/output/images-109 and images-109-loma) and /workspace/lichtfeld (build).
#
#   bash train_check.sh [NAME] [extra LichtFeld options]     default NAME: full-own-x2
set -euo pipefail
NAME=${1:-full-own-x2}; shift || true
VWH=/workspace/vwh
LICHTFELD=$(find /workspace/lichtfeld -maxdepth 2 -type f -name LichtFeld-Studio -perm -u+x | head -1)
[ -n "$LICHTFELD" ] || { echo "No LichtFeld-Studio binary under /workspace/lichtfeld"; exit 1; }
python3 -c "import cv2, PIL, psutil" 2>/dev/null || pip install -q --break-system-packages opencv-python-headless pillow psutil  # a disposable machine

# Dataset from the images alone (no Matterport metadata on this machine), then onto the local disk for training.
cd "$VWH"
python3 alignment/to_dataset.py alignment/output/images-109-loma --dataset alignment/output/images-109 \
  --metadata /nonexistent --out /root/ds-own
mkdir -p "$VWH/alignment/output/images-109-loma-dataset"
cp /root/ds-own/report.json /root/ds-own/transforms.json "$VWH/alignment/output/images-109-loma-dataset/"
cp -r /root/ds-own/sparse "$VWH/alignment/output/images-109-loma-dataset/"

OUT=/root/out/$NAME
mkdir -p "$OUT"
date +%s > "$OUT/start"
python3 "$VWH/lichtfeld/train.py" full --dataset /root/ds-own --lichtfeld "$LICHTFELD" --steps-scaler=2 --out "$OUT" "$@" > "$OUT/console.txt" 2>&1 \
  && echo ok > "$OUT/status" || echo "failed $?" > "$OUT/status"
date +%s > "$OUT/end"
mkdir -p "$VWH/lichtfeld/output/$NAME"
cp "$OUT"/*.ply "$OUT"/console.txt "$OUT"/lichtfeld.log "$OUT"/start "$OUT"/end "$OUT"/status "$VWH/lichtfeld/output/$NAME/" 2>/dev/null || true
touch "/workspace/$NAME.done"
