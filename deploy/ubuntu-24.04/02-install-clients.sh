#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TataService Blockchain — Install Pinned Go-Ethereum (Geth) & Lighthouse
# Supports native systemd Ubuntu 24.04 deployments (x86_64)
# =============================================================================

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: Please run as root (sudo bash $0)" >&2
  exit 1
fi

ARCH="$(uname -m)"
if [[ "${ARCH}" != "x86_64" ]]; then
  echo "ERROR: This script expects x86_64. Detected: ${ARCH}. Adjust download URLs or use Docker Compose." >&2
  exit 1
fi

GETH_VERSION="1.14.12"
GETH_COMMIT="293a300d"
LIGHTHOUSE_VERSION="v6.0.1"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

echo "Downloading Go-Ethereum v${GETH_VERSION}..."
GETH_TAR="geth-linux-amd64-${GETH_VERSION}-${GETH_COMMIT}.tar.gz"
curl -fsSL "https://gethstore.blob.core.windows.net/builds/${GETH_TAR}" -o "${TMP_DIR}/${GETH_TAR}"
tar -xzf "${TMP_DIR}/${GETH_TAR}" -C "${TMP_DIR}"
install -m 0755 "${TMP_DIR}/geth-linux-amd64-${GETH_VERSION}-${GETH_COMMIT}/geth" /usr/local/bin/geth

echo "Downloading Lighthouse ${LIGHTHOUSE_VERSION}..."
LH_TAR="lighthouse-${LIGHTHOUSE_VERSION}-x86_64-unknown-linux-gnu.tar.gz"
curl -fsSL "https://github.com/sigp/lighthouse/releases/download/${LIGHTHOUSE_VERSION}/${LH_TAR}" -o "${TMP_DIR}/${LH_TAR}"
tar -xzf "${TMP_DIR}/${LH_TAR}" -C "${TMP_DIR}"
install -m 0755 "${TMP_DIR}/lighthouse" /usr/local/bin/lighthouse

echo "Installed client versions:"
/usr/local/bin/geth version | head -n 3
/usr/local/bin/lighthouse --version
