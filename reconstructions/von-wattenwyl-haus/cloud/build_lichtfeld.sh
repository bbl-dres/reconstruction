#!/bin/bash
# Build LichtFeld Studio for Linux the way its own Ubuntu CI does (.github/workflows/ubuntu.yml at the tag),
# on RunPod's runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404 image (Ubuntu 24.04, CUDA 12.8 toolkit).
# Builds on the container disk and copies the result to PREFIX (a network volume keeps it for later sessions).
#
#   bash build_lichtfeld.sh [PREFIX] [TAG]     defaults: /workspace/lichtfeld v0.5.3
#
# The first build compiles all dependencies with vcpkg (USD, FFmpeg, OpenImageIO, ...): expect 1-3 hours.
# JOBS caps parallel compiles (default 12). A container sees the host's CPU count (112 on RunPod), and that many
# compiles of USD and OpenImageIO filled a 62 GB machine until it stopped responding. Finished libraries are cached
# on the volume (VCPKG_DEFAULT_BINARY_CACHE), so a rerun skips them.
set -euo pipefail
PREFIX=${1:-/workspace/lichtfeld}
TAG=${2:-v0.5.3}
WORK=/root/lichtfeld-build
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates gpg wget
wget -qO - https://apt.kitware.com/keys/kitware-archive-latest.asc | gpg --dearmor - > /usr/share/keyrings/kitware-archive-keyring.gpg
echo 'deb [signed-by=/usr/share/keyrings/kitware-archive-keyring.gpg] https://apt.kitware.com/ubuntu/ noble main' > /etc/apt/sources.list.d/kitware.list
apt-get update
# CMake 4.4.0 exactly: LichtFeld's CI pins it because 4.4.1 breaks feature detection.
apt-get install -y cmake=4.4.0-0kitware1ubuntu24.04.1 cmake-data=4.4.0-0kitware1ubuntu24.04.1 \
  git curl unzip gcc-14 g++-14 ninja-build zip tar pkg-config python3 python3-dev rsync \
  libxinerama-dev libxcursor-dev xorg-dev libglu1-mesa-dev libwayland-dev libxkbcommon-dev libegl-dev \
  libdecor-0-dev libibus-1.0-dev libdbus-1-dev libsystemd-dev libgtk-3-dev \
  nasm autoconf autoconf-archive automake libtool

JOBS=${JOBS:-12}
export CC=gcc-14 CXX=g++-14 VCPKG_ROOT=$WORK/vcpkg VCPKG_FORCE_SYSTEM_BINARIES=1 CMAKE_MAKE_PROGRAM=/usr/bin/ninja
export VCPKG_MAX_CONCURRENCY=$JOBS CMAKE_BUILD_PARALLEL_LEVEL=$JOBS VCPKG_DEFAULT_BINARY_CACHE=${VCPKG_DEFAULT_BINARY_CACHE:-/workspace/vcpkg-cache}
mkdir -p "$VCPKG_DEFAULT_BINARY_CACHE"
mkdir -p "$WORK" && cd "$WORK"
if [ ! -d vcpkg ]; then
  git clone https://github.com/microsoft/vcpkg.git
  ./vcpkg/bootstrap-vcpkg.sh -disableMetrics
  echo 'set(VCPKG_BUILD_TYPE release)' >> vcpkg/triplets/x64-linux.cmake
fi
[ -d LichtFeld-Studio ] || git clone --branch "$TAG" --depth 1 --recurse-submodules --shallow-submodules https://github.com/MrNeRF/LichtFeld-Studio.git
cd LichtFeld-Studio
# LichtFeld compiles its CUDA code for the build machine's GPU only (nvidia-smi), so build on the GPU type that will train.
cmake -B build -S . -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_CUDA_COMPILER=/usr/local/cuda/bin/nvcc \
  -DBUILD_PYTHON_STUBS=OFF -DLFS_DEV_IMPORT_SOURCE_PYTHON=OFF -DLFS_DEV_IMPORT_SOURCE_RESOURCES=OFF -DCUDA_DEVICE_DEBUG=OFF
cmake --build build -j "$JOBS"
mkdir -p "$PREFIX"
rsync -a --delete --exclude CMakeFiles --exclude '*.o' --exclude '*.a' --exclude vcpkg_installed/vcpkg build/ "$PREFIX/"
echo "Built $TAG into $PREFIX"
