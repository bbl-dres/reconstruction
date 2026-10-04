#!/bin/bash
# Restore a LichtFeld Studio build saved from build_lichtfeld.sh, instead of building again (1-3 hours).
# Needs the same image (runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404: Ubuntu 24.04, CUDA 12.8) and a GPU of the
# generation it was built on: LichtFeld compiles its CUDA code for the build machine's GPU only (sm_120 = Blackwell:
# RTX 5090, RTX PRO 4500/6000). Installs the system libraries it links against and unpacks the archive.
#
#   bash install_lichtfeld.sh ARCHIVE [PREFIX]     default PREFIX: /workspace/lichtfeld
#   bash install_lichtfeld.sh - [PREFIX]           the build is already there (a network volume): libraries only
set -euo pipefail
ARCHIVE=${1:--}
PREFIX=${2:-/workspace/lichtfeld}
export DEBIAN_FRONTEND=noninteractive
apt-get update
# The packages the build installed (the -dev packages bring the runtime libraries along).
apt-get install -y libxinerama-dev libxcursor-dev xorg-dev libglu1-mesa-dev libwayland-dev libxkbcommon-dev \
  libegl-dev libdecor-0-dev libibus-1.0-dev libdbus-1-dev libsystemd-dev libgtk-3-dev
if [ "$ARCHIVE" != - ]; then
  mkdir -p "$PREFIX"
  tar -xzf "$ARCHIVE" -C "$PREFIX" --no-same-owner
fi
BINARY=$(find "$PREFIX" -maxdepth 2 -type f -name LichtFeld-Studio | head -1)
# The binary looks for its own libraries (USD, OpenMesh, ...) in the build machine's folders; elsewhere they are
# found through LD_LIBRARY_PATH, which lichtfeld.env sets (train_run.sh loads it).
echo "export LD_LIBRARY_PATH=$(find "$PREFIX" -name '*.so*' -printf '%h\n' | sort -u | paste -sd:)\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}" > "$PREFIX/lichtfeld.env"
source "$PREFIX/lichtfeld.env"
missing=$(ldd "$BINARY" | grep "not found" || true)
[ -z "$missing" ] || { echo "Missing libraries:"; echo "$missing"; exit 1; }
echo "LichtFeld ready: $BINARY"
