#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${1:-}"

if [[ -z "${VERSION}" ]]; then
  VERSION="$(grep -oP 'Version:\s*\K[0-9.]+' "${ROOT_DIR}/dm1-calculator.php" | head -1)"
fi

if [[ -z "${VERSION}" ]]; then
  echo "Could not determine plugin version." >&2
  exit 1
fi

DIST_ROOT="${ROOT_DIR}/dist"
PKG_DIR="${DIST_ROOT}/wordpress-dm1-calculator"
ZIP_PATH="${DIST_ROOT}/wordpress-dm1-calculator-${VERSION}.zip"

rm -rf "${PKG_DIR}" "${ZIP_PATH}"
mkdir -p "${PKG_DIR}"

cp -r \
  "${ROOT_DIR}/dm1-calculator.php" \
  "${ROOT_DIR}/assets" \
  "${ROOT_DIR}/lib" \
  "${ROOT_DIR}/README.md" \
  "${ROOT_DIR}/LICENSE" \
  "${PKG_DIR}/"

test -f "${PKG_DIR}/dm1-calculator.php"
test -f "${PKG_DIR}/assets/css/dm1-calculator.css"
test -f "${PKG_DIR}/assets/js/dm1-calculator.js"
test -f "${PKG_DIR}/lib/plugin-update-checker.php"

(
  cd "${DIST_ROOT}"
  if command -v zip >/dev/null 2>&1; then
    zip -rq "$(basename "${ZIP_PATH}")" "wordpress-dm1-calculator"
  else
    python3 - <<'PY'
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path("wordpress-dm1-calculator")
zip_path = Path.cwd() / f"{root.name}.zip"
with ZipFile(zip_path, "w", ZIP_DEFLATED) as archive:
    for path in sorted(root.rglob("*")):
        if path.is_file():
            archive.write(path, path.as_posix())
PY
    mv "wordpress-dm1-calculator.zip" "$(basename "${ZIP_PATH}")"
  fi
)

echo "${ZIP_PATH}"
