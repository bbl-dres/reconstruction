#!/bin/bash
# Score a splat on the cloud machine: gsplat renders (dataset/render_gsplat.py) scored by dataset/evaluate.py,
# the same metrics as dataset/score_splat.py on the laptop, for splats too large for the laptop's GPU.
#
#   bash score_run.sh SPLAT DATASET OUT [all|capture]
set -euo pipefail
SPLAT=$1; DATASET=$2; OUT=$3; VIEWS=${4:-all}
VWH=/workspace/vwh
export PATH=/usr/local/cuda/bin:$PATH CUDA_HOME=/usr/local/cuda TORCH_CUDA_ARCH_LIST=12.0 MAX_JOBS=12
python3 -c "import gsplat" 2>/dev/null || pip install -q --break-system-packages gsplat==1.5.3 ninja  # a disposable machine
python3 "$VWH/dataset/render_gsplat.py" "$SPLAT" "$DATASET" "$OUT" --views "$VIEWS"
python3 "$VWH/dataset/evaluate.py" "$OUT" "$DATASET" --sheet 0 > /dev/null
python3 -c "import json, sys; s = json.load(open(sys.argv[1]))['summary']['all']; print(f\"{s['images']} images  PSNR {s['psnr']:.2f} dB  SSIM {s['ssim']:.3f}\")" "$OUT/metrics.json"
