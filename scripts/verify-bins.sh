#!/usr/bin/env bash
# Pack `@sanity-labs/slides`, install the tarball in a clean fixture, and
# exercise every `slidesctl` subcommand. Catches published-artifact bugs
# (missing dist files, broken subpath exports, dead `bin` fields, missing
# brand assets, etc.) that unit tests can't reach because they run inside
# the workspace where TS sources are still on disk.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PKG_DIR="packages/slides"
DIST_CLI="$PKG_DIR/dist/cli.js"
DIST_DEV_BIN="$PKG_DIR/dist/dev/bin/slides-dev.mjs"
SKILL="$PKG_DIR/SKILL.md"

echo "== Step 1: static artifact checks =="
test -f "$DIST_CLI"          || { echo "FAIL: $DIST_CLI missing — run \`pnpm build\` first" >&2; exit 1; }
test -f "$DIST_DEV_BIN"      || { echo "FAIL: $DIST_DEV_BIN missing — copy-static-assets.mjs didn't run" >&2; exit 1; }
test -f "$SKILL"             || { echo "FAIL: $SKILL missing — must ship with the package" >&2; exit 1; }
test -d "$PKG_DIR/dist/sanity/assets"     || { echo "FAIL: Sanity PNG assets not copied to dist/" >&2; exit 1; }
test -d "$PKG_DIR/dist/scaffold/template-base" || { echo "FAIL: scaffold template-base not copied to dist/" >&2; exit 1; }

shebang="$(head -n 1 "$DIST_CLI")"
[[ "$shebang" == "#!/usr/bin/env node" ]] || { echo "FAIL: $DIST_CLI missing node shebang (got: $shebang)" >&2; exit 1; }

declared_bin="$(node -e "const p=require('./$PKG_DIR/package.json'); process.stdout.write(p.bin.slidesctl||'');")"
[[ "$declared_bin" == "./dist/cli.js" ]] || { echo "FAIL: $PKG_DIR/package.json bin.slidesctl = '$declared_bin'; expected './dist/cli.js'" >&2; exit 1; }

node -e "const p=require('./$PKG_DIR/package.json'); if (!(p.files||[]).includes('SKILL.md')) { console.error('FAIL: SKILL.md not in package.json files[]'); process.exit(1); }"
echo "  ok: dist/cli.js (shebang + bin field), dist/dev/bin/slides-dev.mjs, SKILL.md, Sanity assets, scaffold template-base"

echo "== Step 2: pack + install + invoke =="
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

(cd "$PKG_DIR" && pnpm pack --pack-destination "$TMPDIR" >/dev/null 2>&1)

cat > "$TMPDIR/package.json" <<EOF
{
  "name": "verify-bins-fixture",
  "private": true,
  "dependencies": {
    "@sanity-labs/slides": "file:./sanity-labs-slides-0.0.0.tgz"
  }
}
EOF

(cd "$TMPDIR" && pnpm install --no-frozen-lockfile --silent >/dev/null 2>&1)

bin_path="$TMPDIR/node_modules/.bin/slidesctl"
test -x "$bin_path" || { echo "FAIL: slidesctl not linked at $bin_path after install" >&2; exit 1; }
echo "  ok: slidesctl linked at $bin_path"

usage_out="$(timeout 10 "$bin_path" --help 2>&1)" || true
grep -q '^Usage: slidesctl' <<<"$usage_out" || { echo "FAIL: --help did not print USAGE:" >&2; echo "$usage_out" | head -20 >&2; exit 1; }
echo "  ok: --help prints USAGE"

list_out="$(cd "$TMPDIR" && timeout 10 "$bin_path" list --template @sanity-labs/slides/sanity 2>&1)" || true
grep -q '^Template: sanity' <<<"$list_out" || { echo "FAIL: list against @sanity-labs/slides/sanity:" >&2; echo "$list_out" | head -20 >&2; exit 1; }
echo "  ok: list resolves and reads @sanity-labs/slides/sanity"

skill_first="$(timeout 10 "$bin_path" skill 2>&1 | head -1)"
[[ "$skill_first" == '---' ]] || { echo "FAIL: skill output didn't start with YAML '---'" >&2; echo "$skill_first" >&2; exit 1; }
echo "  ok: skill prints the bundled SKILL.md"

gen_payload='{"title":"verify","slides":[{"component":"Cover","props":{"title":"Smoke","subtitle":"hi"}}]}'
gen_out="$(cd "$TMPDIR" && echo "$gen_payload" | timeout 30 "$bin_path" generate --template @sanity-labs/slides/sanity --output "$TMPDIR" 2>&1)" || { echo "FAIL: generate failed:" >&2; echo "$gen_out" >&2; exit 1; }
pptx_path="$gen_out"
test -f "$pptx_path" || { echo "FAIL: generate did not write a .pptx (got: $pptx_path)" >&2; exit 1; }
magic="$(head -c 2 "$pptx_path" | xxd -p)"
[[ "$magic" == "504b" ]] || { echo "FAIL: generate output is not a ZIP/.pptx (magic: $magic)" >&2; exit 1; }
echo "  ok: generate wrote a real .pptx at $pptx_path"

scaffold_dir="$TMPDIR/scaffold-target"
"$bin_path" scaffold "$scaffold_dir" --name test-template >/dev/null 2>&1 || { echo "FAIL: scaffold failed" >&2; exit 1; }
test -f "$scaffold_dir/package.json" || { echo "FAIL: scaffold didn't stamp files" >&2; exit 1; }
grep -q '"name": "test-template"' "$scaffold_dir/package.json" || { echo "FAIL: scaffold didn't apply __NAME__ substitution" >&2; exit 1; }
echo "  ok: scaffold stamps a working template"

echo "✓ @sanity-labs/slides bin runnable end-to-end"
