#!/bin/sh
# Finds node and runs run.mjs. A hook fired inside a desktop app inherits that
# app's PATH, which on a machine where node comes from nvm holds no node at
# all: "/bin/sh: node: command not found", Charu's machine, 8 September 2026.
# Order: the node Korture was installed with, then PATH, then nvm, then the
# usual places. Never does any work itself.
here="$(cd "$(dirname "$0")" && pwd)"
cfg="${KORTURE_HOME:-$HOME/.korture}/config.json"
node=""
if [ -f "$cfg" ]; then
  node="$(sed -n 's/.*"nodePath": *"\([^"]*\)".*/\1/p' "$cfg" | head -1)"
  # Windows (Git Bash, which Claude Code uses for hooks): the JSON keeps each
  # backslash doubled, C:\\Users\\..., and the test below needs it single.
  case "$node" in *'\\'*) node="$(printf '%s' "$node" | sed 's/\\\\/\\/g')" ;; esac
fi
[ -x "$node" ] || node="$(command -v node 2>/dev/null)"
[ -x "$node" ] || node="$(ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1)"
for c in /usr/local/bin/node /opt/homebrew/bin/node; do [ -x "$node" ] || { [ -x "$c" ] && node="$c"; }; done
[ -x "$node" ] || exit 0
exec "$node" "$here/run.mjs" "$@"
