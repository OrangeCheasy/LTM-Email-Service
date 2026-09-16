#!/usr/bin/env bash
set -euo pipefail

SOURCE="${1:-public/apple-touch-icon.png}"
OUTPUT="${2:-public/favicon.ico}"

if [[ ! -f "$SOURCE" ]]; then
  echo "Favicon source not found: $SOURCE" >&2
  exit 1
fi

if command -v magick >/dev/null 2>&1; then
  IM=(magick)
elif command -v convert >/dev/null 2>&1; then
  IM=(convert)
else
  sudo apt-get update
  sudo apt-get install -y imagemagick
  IM=(convert)
fi

"${IM[@]}" "$SOURCE" -background none -define icon:auto-resize=64,48,32,16 "$OUTPUT"

python3 - "$OUTPUT" <<'PY'
import struct
import sys

path = sys.argv[1]
with open(path, "rb") as handle:
    data = handle.read()

if len(data) < 6:
    raise SystemExit("Generated favicon is too small to be a valid ICO")

reserved, image_type, count = struct.unpack_from("<HHH", data, 0)
if reserved != 0 or image_type != 1 or count < 1:
    raise SystemExit("Generated favicon does not have a valid ICO header")

sizes = set()
for index in range(count):
    offset = 6 + index * 16
    if offset + 16 > len(data):
        raise SystemExit("Generated favicon has a truncated ICO directory")
    width, height = data[offset], data[offset + 1]
    sizes.add((256 if width == 0 else width, 256 if height == 0 else height))

required = {(16, 16), (32, 32), (48, 48), (64, 64)}
missing = sorted(required - sizes)
if missing:
    raise SystemExit(f"Generated favicon is missing required sizes: {missing}")

print(f"Validated ICO with sizes: {sorted(sizes)}")
PY
