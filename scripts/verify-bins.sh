#!/usr/bin/env bash
# Verify that the published react-pptx-mcp tarball produces a runnable
# `react-pptx-mcp` bin that can load a template (the Sanity reference) and
# write a real .pptx file.
#
# Why this exists:
#   - An earlier iteration declared `bin` pointing at `./src/cli.ts`. Node
#     refuses to run `.ts` under node_modules, so the bin link looked fine
#     until someone tried to invoke it.
#   - The published artifact must contain the compiled `dist/cli.js`, the
#     shebang, and the bundled SKILL.md.
#   - The bin must dynamically resolve a template (bare specifier OR file
#     path) and run end-to-end without the workspace.
#
# Layered checks:
#   1. Static artifact checks (dist/cli.js exists, shebang preserved, bin
#      points at dist/cli.js, SKILL.md is in `files`).
#   2. Pack every workspace package, install the tarballs in a clean fixture,
#      and invoke `react-pptx-mcp` with --help, list, skill, and generate
#      subcommands. The generate test writes a real .pptx and checks the
#      ZIP magic number.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MCP_PKG_DIR="packages/mcp"
MCP_DIST_CLI="$MCP_PKG_DIR/dist/cli.js"
MCP_SKILL="$MCP_PKG_DIR/SKILL.md"

echo "== Step 1: static artifact checks =="

if [[ ! -f "$MCP_DIST_CLI" ]]; then
  echo "FAIL: $MCP_DIST_CLI missing — did \`pnpm -r build\` run?" >&2
  exit 1
fi
shebang="$(head -n 1 "$MCP_DIST_CLI")"
if [[ "$shebang" != "#!/usr/bin/env node" ]]; then
  echo "FAIL: $MCP_DIST_CLI missing node shebang (got: $shebang)" >&2
  exit 1
fi
declared_bin="$(node -e "const p=require('./$MCP_PKG_DIR/package.json'); process.stdout.write(p.bin['react-pptx-mcp']||'');")"
if [[ "$declared_bin" != "./dist/cli.js" ]]; then
  echo "FAIL: $MCP_PKG_DIR/package.json bin.react-pptx-mcp = '$declared_bin'; expected './dist/cli.js'" >&2
  exit 1
fi
if [[ ! -f "$MCP_SKILL" ]]; then
  echo "FAIL: $MCP_SKILL missing — the SKILL.md must ship with the package." >&2
  exit 1
fi
node -e "
  const p=require('./$MCP_PKG_DIR/package.json');
  const files=p.files||[];
  if (!files.includes('SKILL.md')) {
    console.error('FAIL: $MCP_PKG_DIR/package.json files[] must include SKILL.md');
    process.exit(1);
  }
"
echo "  ok: $MCP_DIST_CLI shebang preserved, bin field correct, SKILL.md packed"

echo "== Step 2: pack + install + invoke =="

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

for pkg in packages/core packages/mcp templates/sanity; do
  (cd "$pkg" && pnpm pack --pack-destination "$TMPDIR" >/dev/null 2>&1)
done

cat > "$TMPDIR/package.json" <<EOF
{
  "name": "verify-bins-fixture",
  "private": true,
  "dependencies": {
    "react-pptx-mcp": "file:./react-pptx-mcp-0.0.0.tgz",
    "@sanity-labs/slides": "file:./sanity-labs-slides-0.0.0.tgz"
  },
  "pnpm": {
    "overrides": {
      "react-pptx": "file:./react-pptx-0.0.0.tgz",
      "react-pptx-mcp": "file:./react-pptx-mcp-0.0.0.tgz"
    }
  }
}
EOF

(cd "$TMPDIR" && pnpm install --no-frozen-lockfile --silent >/dev/null 2>&1)

bin_path="$TMPDIR/node_modules/.bin/react-pptx-mcp"
if [[ ! -x "$bin_path" ]]; then
  echo "FAIL: react-pptx-mcp not linked in node_modules/.bin/ after install" >&2
  exit 1
fi
echo "  ok: react-pptx-mcp linked at $bin_path"

usage_out="$(timeout 10 "$bin_path" --help 2>&1)" || true
if ! grep -q '^Usage: react-pptx-mcp' <<<"$usage_out"; then
  echo "FAIL: react-pptx-mcp --help did not print USAGE:" >&2
  echo "$usage_out" | head -20 >&2
  exit 1
fi
echo "  ok: --help prints USAGE"

list_out="$(cd "$TMPDIR" && timeout 10 "$bin_path" list --template @sanity-labs/slides 2>&1)" || true
if ! grep -q '^Template: sanity' <<<"$list_out"; then
  echo "FAIL: list against @sanity-labs/slides did not return the template name:" >&2
  echo "$list_out" | head -20 >&2
  exit 1
fi
echo "  ok: list resolves and reads @sanity-labs/slides"

skill_first_line="$(timeout 10 "$bin_path" skill 2>&1 | head -1)"
if [[ "$skill_first_line" != '---' ]]; then
  echo "FAIL: skill output did not start with the YAML front-matter delimiter ('---'):" >&2
  echo "$skill_first_line" >&2
  exit 1
fi
echo "  ok: skill prints the bundled SKILL.md"

gen_payload='{"title":"verify","slides":[{"component":"Cover","props":{"title":"Smoke","subtitle":"hi"}}]}'
gen_out="$(cd "$TMPDIR" && echo "$gen_payload" | timeout 30 "$bin_path" generate --template @sanity-labs/slides --output "$TMPDIR" 2>&1)" || {
  echo "FAIL: generate exited non-zero:" >&2
  echo "$gen_out" >&2
  exit 1
}
pptx_path="$gen_out"
if [[ ! -f "$pptx_path" ]]; then
  echo "FAIL: generate did not write a .pptx (got path: $pptx_path)" >&2
  exit 1
fi
# PPTX is a ZIP — sanity-check the magic number.
magic="$(head -c 2 "$pptx_path" | xxd -p)"
if [[ "$magic" != "504b" ]]; then
  echo "FAIL: generate output is not a ZIP/.pptx (magic: $magic)" >&2
  exit 1
fi
echo "  ok: generate wrote a real .pptx at $pptx_path"

echo "✓ react-pptx-mcp bin is runnable (static checks + packed-install round trip)"
