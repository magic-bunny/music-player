#!/bin/zsh
set -e
player_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
export PATH="$HOME/.cargo/bin:$PATH"
cd "$player_dir"
exec cargo run --release --locked
