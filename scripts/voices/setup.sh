#!/usr/bin/env bash
# Installe Kokoro (une seule fois) : un environnement Python isolé + le modèle (~350 Mo).
# Tout va dans assets-src/kokoro/, qui n'est pas envoyé sur git.
set -euo pipefail
cd "$(dirname "$0")/../.."
DIR=assets-src/kokoro
mkdir -p "$DIR"
[ -d "$DIR/.venv" ] || python3 -m venv "$DIR/.venv"
"$DIR/.venv/bin/pip" install -q kokoro-onnx soundfile
BASE=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
[ -f "$DIR/kokoro-v1.0.onnx" ] || curl -fL -o "$DIR/kokoro-v1.0.onnx" "$BASE/kokoro-v1.0.onnx"
[ -f "$DIR/voices-v1.0.bin" ] || curl -fL -o "$DIR/voices-v1.0.bin" "$BASE/voices-v1.0.bin"
echo "Kokoro est prêt : npm run voices"
