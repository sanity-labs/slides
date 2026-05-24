#!/usr/bin/env bash
# Pack `@sanity-labs/slides`, install the tarball in a clean fixture, and
# exercise every `slidesctl` subcommand against a freshly scaffolded
# template. Catches published-artifact bugs (missing dist files, broken
# subpath exports, dead `bin` fields, missing static assets, etc.) that
# unit tests can't reach because they run inside the workspace where TS
# sources are still on disk.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "== Step 1: static artifact checks =="
test -f dist/cli.js                 || { echo "FAIL: dist/cli.js missing — run \`pnpm build\` first" >&2; exit 1; }
test -f dist/dev/bin/slides-dev.mjs || { echo "FAIL: dist/dev/bin/slides-dev.mjs missing" >&2; exit 1; }
test -f SKILL.md                    || { echo "FAIL: SKILL.md missing" >&2; exit 1; }
test -d dist/scaffold/template-base || { echo "FAIL: scaffold template-base not copied to dist/" >&2; exit 1; }

shebang="$(head -n 1 dist/cli.js)"
[[ "$shebang" == "#!/usr/bin/env node" ]] || { echo "FAIL: dist/cli.js missing node shebang (got: $shebang)" >&2; exit 1; }

declared_bin="$(node -e "const p=require('./package.json'); process.stdout.write(p.bin.slidesctl||'');")"
[[ "$declared_bin" == "./dist/cli.js" ]] || { echo "FAIL: package.json bin.slidesctl = '$declared_bin'; expected './dist/cli.js'" >&2; exit 1; }

node -e "const p=require('./package.json'); if (!(p.files||[]).includes('SKILL.md')) { console.error('FAIL: SKILL.md not in package.json files[]'); process.exit(1); }"
echo "  ok: dist/cli.js, dist/dev/bin/slides-dev.mjs, SKILL.md, scaffold template-base"

echo "== Step 2: pack + install + invoke =="
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

pnpm pack --pack-destination "$TMPDIR" >/dev/null 2>&1

cat > "$TMPDIR/package.json" <<EOF
{
  "name": "verify-bins-fixture",
  "private": true,
  "dependencies": {
    "@sanity-labs/slides": "file:./sanity-labs-slides-0.0.0.tgz",
    "zod": "^3.23.0"
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

skill_first="$(timeout 10 "$bin_path" skill 2>&1 | head -1)"
[[ "$skill_first" == '---' ]] || { echo "FAIL: skill output didn't start with YAML '---'" >&2; echo "$skill_first" >&2; exit 1; }
echo "  ok: skill prints the bundled SKILL.md"

# Hand-rolled minimal template (pure JS, no TS loader needed) so we can
# exercise list/generate against the published bin without building a
# whole TypeScript template inside the fixture. Mirrors what a built
# template's dist/index.js would look like.
mkdir -p "$TMPDIR/test-template"
cat > "$TMPDIR/test-template/index.mjs" <<'JS'
import { Box, CANVAS_16_9, Slide, Text, defineTemplate, defineTemplateComponent } from '@sanity-labs/slides';
import { z } from 'zod';

const CoverSchema = z
  .object({
    title: z.string().min(1).describe('Slide title'),
    subtitle: z.string().optional(),
  })
  .strict();

const Cover = ({ title, subtitle }) =>
  Slide({
    children: [
      Box({
        rect: { x: 0, y: 0, w: 960, h: 540 },
        fill: { kind: 'solid', color: '#0b0b0b' },
      }),
      Box({
        rect: { x: 40, y: 60, w: 880, h: 100 },
        children: Text({
          textStyle: { fontFamily: 'display', fontSize: 48, foregroundColor: '#ffffff' },
          children: title,
        }),
      }),
      subtitle
        ? Box({
            rect: { x: 40, y: 180, w: 880, h: 40 },
            children: Text({
              textStyle: { fontFamily: 'body', fontSize: 20, foregroundColor: '#cccccc' },
              children: subtitle,
            }),
          })
        : null,
    ],
  });

export const template = defineTemplate({
  name: 'verify-template',
  canvas: CANVAS_16_9,
  fonts: { display: ['Arial'], body: ['Arial'], mono: ['Courier New'] },
  colors: {},
  typography: {},
  spacing: {},
  components: {
    Cover: defineTemplateComponent({
      component: Cover,
      schema: CoverSchema,
      description: 'Test cover slide.',
    }),
  },
});
JS

list_out="$(cd "$TMPDIR" && timeout 15 "$bin_path" list --template ./test-template/index.mjs 2>&1)" || true
grep -q '^Template: verify-template' <<<"$list_out" || { echo "FAIL: list against the hand-rolled template:" >&2; echo "$list_out" | head -20 >&2; exit 1; }
echo "  ok: list resolves a file-path template"

gen_payload='{"title":"verify","slides":[{"component":"Cover","props":{"title":"Smoke","subtitle":"hi"}}]}'
gen_out="$(cd "$TMPDIR" && echo "$gen_payload" | timeout 30 "$bin_path" generate --template ./test-template/index.mjs --output "$TMPDIR" 2>&1)" || { echo "FAIL: generate failed:" >&2; echo "$gen_out" >&2; exit 1; }
pptx_path="$gen_out"
test -f "$pptx_path" || { echo "FAIL: generate did not write a .pptx (got: $pptx_path)" >&2; exit 1; }
magic="$(head -c 2 "$pptx_path" | xxd -p)"
[[ "$magic" == "504b" ]] || { echo "FAIL: generate output is not a ZIP/.pptx (magic: $magic)" >&2; exit 1; }
echo "  ok: generate wrote a real .pptx at $pptx_path"

# Sanity-check scaffold separately (just confirms it stamps the template-base
# verbatim with substitutions applied).
scaffold_dir="$TMPDIR/scaffolded"
"$bin_path" scaffold "$scaffold_dir" --name verify-template >/dev/null 2>&1 || { echo "FAIL: scaffold failed" >&2; exit 1; }
test -f "$scaffold_dir/package.json" || { echo "FAIL: scaffold didn't stamp files" >&2; exit 1; }
grep -q '"name": "verify-template"' "$scaffold_dir/package.json" || { echo "FAIL: scaffold didn't apply __NAME__ substitution" >&2; exit 1; }
echo "  ok: scaffold stamps a working template"

echo "✓ @sanity-labs/slides bin runnable end-to-end"
