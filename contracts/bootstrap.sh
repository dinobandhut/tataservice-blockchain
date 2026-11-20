#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

export PATH="$PATH:$HOME/.foundry/bin"

if ! command -v forge >/dev/null 2>&1; then
  echo "ERROR: Foundry (forge) is not installed or not in PATH." >&2
  exit 1
fi

mkdir -p lib deployments

if [[ ! -d "lib/forge-std" ]]; then
  echo "Installing forge-std..."
  git clone --depth 1 https://github.com/foundry-rs/forge-std.git lib/forge-std
fi

if [[ ! -d "lib/openzeppelin-contracts" ]]; then
  echo "Installing OpenZeppelin Contracts v5.1.0..."
  git clone --depth 1 --branch v5.1.0 https://github.com/OpenZeppelin/openzeppelin-contracts.git lib/openzeppelin-contracts
fi

echo "Building and running Solidity test suite..."
forge build
forge test -vvv
