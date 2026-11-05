#!/usr/bin/env bash
set -euo pipefail
export DOTNET_CLI_HOME="${DOTNET_CLI_HOME:-/workspace/.dotnet-cli}"
export NUGET_PACKAGES="${NUGET_PACKAGES:-/workspace/.nuget/packages}"
export DOTNET_NUGET_SIGNATURE_VERIFICATION=true
dotnet workload install wasm-tools --skip-manifest-update
# Explicitly verify the signed archives before running their tools.
sdk_root="$(dirname "$(readlink -f "$(command -v dotnet)")")"
shopt -s nullglob
packages=("$sdk_root"/packs/*/8.0.15/*.nupkg)
if [ "${#packages[@]}" -eq 0 ]; then
  echo 'No workload package archives found for signature validation.' >&2
  exit 1
fi
dotnet nuget verify "${packages[@]}" --all
