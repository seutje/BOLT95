#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="${ROOT_DIR}/.cache/whisper.cpp"
BUILD_DIR="${ROOT_DIR}/.wasm-build"
OUTPUT_DIR="${ROOT_DIR}/public/wasm/generated"
WHISPER_REVISION="23ee03506a91ac3d3f0071b40e66a430eebdfa1d"
EMSDK_IMAGE="emscripten/emsdk@sha256:460fff8f8ac87e11b16447fbd66538a686eafa0e4fb977aa0989ed19fe2079f7"

if [[ ! -d "${SOURCE_DIR}/.git" ]]; then
  mkdir -p "$(dirname "${SOURCE_DIR}")"
  git clone https://github.com/ggml-org/whisper.cpp.git "${SOURCE_DIR}"
fi

git -C "${SOURCE_DIR}" fetch --tags origin
git -C "${SOURCE_DIR}" checkout --detach "${WHISPER_REVISION}"
test "$(git -C "${SOURCE_DIR}" rev-parse HEAD)" = "${WHISPER_REVISION}"

mkdir -p "${BUILD_DIR}" "${OUTPUT_DIR}"

docker run --rm \
  --user "$(id -u):$(id -g)" \
  --volume "${ROOT_DIR}:/work" \
  --volume "${SOURCE_DIR}:/source:ro" \
  --workdir /work \
  "${EMSDK_IMAGE}" \
  bash -lc 'emcmake cmake -S /work/spikes/whisper/native -B /work/.wasm-build -DWHISPER_SOURCE_DIR=/source -DCMAKE_BUILD_TYPE=Release && cmake --build /work/.wasm-build --parallel && /emsdk/upstream/bin/wasm-dis /work/.wasm-build/bolt95-whisper.wasm -o /work/.wasm-build/whisper.wat && grep -Eq "v128|f32x4|i32x4" /work/.wasm-build/whisper.wat'

cp "${BUILD_DIR}/bolt95-whisper.js" "${OUTPUT_DIR}/whisper.js"
cp "${BUILD_DIR}/bolt95-whisper.wasm" "${OUTPUT_DIR}/whisper.wasm"
node "${ROOT_DIR}/scripts/inspect-whisper-build.mjs"
