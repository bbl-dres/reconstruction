#!/bin/bash
# One LichtFeld training run on a cloud machine, from the images-only alignment on the volume (/workspace/vwh):
# builds the dataset on the local disk, trains, and copies the splat and logs to the volume.
#
#   bash train_run.sh NAME full|holdout [LichtFeld or train.py options...]
#   bash train_run.sh holdout-3m-60k holdout --steps-scaler=2
#   bash train_run.sh full-10m-150k full --max-cap 10000000 --steps-scaler=5
#
# holdout leaves out every 10th position (s005, s015, ...); score with dataset/score_splat.py on the laptop.
set -euo pipefail
NAME=$1; SPLIT=$2; shift 2
VWH=/workspace/vwh
LICHTFELD=$(find /workspace/lichtfeld -maxdepth 2 -type f -name LichtFeld-Studio -perm -u+x | head -1)
[ -n "$LICHTFELD" ] || { echo "No LichtFeld-Studio binary under /workspace/lichtfeld"; exit 1; }
[ -f /workspace/lichtfeld/lichtfeld.env ] && source /workspace/lichtfeld/lichtfeld.env  # library paths, see install_lichtfeld.sh
python3 -c "import cv2, PIL, psutil" 2>/dev/null || pip install -q --break-system-packages opencv-python-headless pillow psutil  # a disposable machine

DATASET=/root/ds-$SPLIT
if [ ! -f "$DATASET/transforms.json" ]; then
  extra=(); [ "$SPLIT" = holdout ] && extra=(--holdout-every 10)
  python3 "$VWH/alignment/to_dataset.py" "$VWH/alignment/output/images-109-loma" --dataset "$VWH/alignment/output/images-109" \
    --metadata /nonexistent --out "$DATASET" "${extra[@]}"
fi

OUT=/root/out/$NAME
mkdir -p "$OUT"
date +%s > "$OUT/start"
(while true; do nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits >> "$OUT/gpu-memory-mib.txt"; sleep 30; done) &
SAMPLER=$!
python3 "$VWH/lichtfeld/train.py" full --dataset "$DATASET" --lichtfeld "$LICHTFELD" --out "$OUT" "$@" > "$OUT/console.txt" 2>&1 \
  && echo ok > "$OUT/status" || echo "failed $?" > "$OUT/status"
kill $SAMPLER
date +%s > "$OUT/end"
mkdir -p "$VWH/lichtfeld/output/$NAME"
cp "$OUT"/*.ply "$OUT"/console.txt "$OUT"/lichtfeld.log "$OUT"/start "$OUT"/end "$OUT"/status "$OUT"/gpu-memory-mib.txt \
  "$VWH/lichtfeld/output/$NAME/" 2>/dev/null || true
cp "$DATASET/report.json" "$VWH/lichtfeld/output/$NAME/dataset-report.json"
touch "/workspace/$NAME.done"
