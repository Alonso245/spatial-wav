#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export DOTNET_CLI_HOME="${DOTNET_CLI_HOME:-/workspace/.dotnet-cli}"
export NUGET_PACKAGES="${NUGET_PACKAGES:-/workspace/.nuget/packages}"
export DOTNET_CLI_TELEMETRY_OPTOUT=1
export DOTNET_NOLOGO=1
decoder_commit=7f530786b67f80cfaf0a7cf17187a8f5f680025d
if [ ! -d .deps/Cavern/.git ]; then
  mkdir -p .deps
  git clone https://github.com/VoidXH/Cavern.git .deps/Cavern
fi
test "$(git -C .deps/Cavern rev-parse HEAD)" = "$decoder_commit" || git -C .deps/Cavern checkout --detach "$decoder_commit"
python3 scripts/prepare-decoder.py
dotnet publish src/AtmosWeb -c Release -o dist --nologo -m:1 -p:UseSharedCompilation=false
