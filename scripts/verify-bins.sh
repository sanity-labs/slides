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
test -d dist/scaffold/deck-base     || { echo "FAIL: scaffold deck-base not copied to dist/" >&2; exit 1; }
test -f runtime-tsconfig.json       || { echo "FAIL: runtime-tsconfig.json missing at package root" >&2; exit 1; }
node -e "const p=require('./package.json'); if (!(p.files||[]).includes('runtime-tsconfig.json')) { console.error('FAIL: runtime-tsconfig.json not in package.json files[]'); process.exit(1); }"

shebang="$(head -n 1 dist/cli.js)"
[[ "$shebang" == "#!/usr/bin/env node" ]] || { echo "FAIL: dist/cli.js missing node shebang (got: $shebang)" >&2; exit 1; }

declared_bin="$(node -e "const p=require('./package.json'); process.stdout.write(p.bin.slidesctl||'');")"
[[ "$declared_bin" == "./dist/cli.js" ]] || { echo "FAIL: package.json bin.slidesctl = '$declared_bin'; expected './dist/cli.js'" >&2; exit 1; }

node -e "const p=require('./package.json'); if (!(p.files||[]).includes('SKILL.md')) { console.error('FAIL: SKILL.md not in package.json files[]'); process.exit(1); }"
echo "  ok: dist/cli.js, dist/dev/bin/slides-dev.mjs, SKILL.md, scaffold template-base"

echo "== Step 2: pack + install + invoke =="
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

# Detect the tarball name dynamically so the script works on any version
# (including the changesets Version Packages branch where the version is bumped).
tgz_path="$(pnpm pack --pack-destination "$TMPDIR" 2>/dev/null | tail -1)"
tgz_basename="$(basename "$tgz_path")"
test -f "$TMPDIR/$tgz_basename" || { echo "FAIL: pnpm pack did not produce a tarball (got: $tgz_path)" >&2; exit 1; }
echo "  packed: $tgz_basename"

cat > "$TMPDIR/package.json" <<EOF
{
  "name": "verify-bins-fixture",
  "private": true,
  "dependencies": {
    "@sanity-labs/slides": "file:./$tgz_basename",
    "react": "^19.0.0",
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
import { createElement } from 'react';
import { Box, CANVAS_16_9, Slide, Text, defineTemplate, defineTemplateComponent } from '@sanity-labs/slides';
import { z } from 'zod';

const CoverSchema = z
  .object({
    title: z.string().min(1).describe('Slide title'),
    subtitle: z.string().optional(),
  })
  .strict();

// Slide / Box / Text are marker components — calling them as functions returns
// null. They must be passed as React-element types via createElement so the
// reconciler sees them in the resulting tree.
const h = createElement;
const Cover = ({ title, subtitle }) =>
  h(
    Slide,
    null,
    h(Box, {
      rect: { x: 0, y: 0, w: 960, h: 540 },
      fill: { kind: 'solid', color: '#0b0b0b' },
    }),
    h(
      Box,
      { rect: { x: 40, y: 60, w: 880, h: 100 } },
      h(
        Text,
        { textStyle: { fontFamily: 'display', fontSize: 48, foregroundColor: '#ffffff' } },
        title,
      ),
    ),
    subtitle
      ? h(
          Box,
          { rect: { x: 40, y: 180, w: 880, h: 40 } },
          h(
            Text,
            { textStyle: { fontFamily: 'body', fontSize: 20, foregroundColor: '#cccccc' } },
            subtitle,
          ),
        )
      : null,
  );

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
# Empty-deck-shell guard: confirm the .pptx contains at least one actual slide.
# Local file headers in a ZIP carry the filename inline so a raw grep works.
LC_ALL=C grep -q 'ppt/slides/slide1.xml' "$pptx_path" || { echo "FAIL: generate output has no ppt/slides/slide1.xml — the deck is just a shell" >&2; exit 1; }
echo "  ok: generate wrote a real .pptx at $pptx_path"

# Sanity-check scaffold separately (just confirms it stamps the template-base
# verbatim with substitutions applied).
scaffold_dir="$TMPDIR/scaffolded"
"$bin_path" scaffold "$scaffold_dir" --name verify-template >/dev/null 2>&1 || { echo "FAIL: scaffold failed" >&2; exit 1; }
test -f "$scaffold_dir/package.json" || { echo "FAIL: scaffold didn't stamp files" >&2; exit 1; }
grep -q '"name": "verify-template"' "$scaffold_dir/package.json" || { echo "FAIL: scaffold didn't apply __NAME__ substitution" >&2; exit 1; }
echo "  ok: scaffold stamps a working template"

# create-deck + agent-authored component + render. Mirrors the full code-gen
# loop an MCP-driven agent would walk through.
deck_dir="$TMPDIR/deck"
(cd "$TMPDIR" && timeout 30 "$bin_path" create-deck "$deck_dir" >/dev/null) || { echo "FAIL: create-deck failed" >&2; exit 1; }
test -f "$deck_dir/src/index.ts" || { echo "FAIL: create-deck didn't write src/index.ts" >&2; exit 1; }
grep -q '// <generated-components>' "$deck_dir/src/index.ts" || { echo "FAIL: create-deck missing anchors" >&2; exit 1; }
echo "  ok: create-deck scaffolds with anchors"

# Hand-write a component the way slides_add_component would, splice the
# anchors with a small Node script that imports the bundled writeAnchors,
# then call slidesctl generate against the deck's src/index.ts to confirm
# the loaded template carries the new component.
cat > "$deck_dir/src/components/Hero.tsx" <<'TSX'
/** @jsxRuntime automatic @jsxImportSource react */
import type { ReactElement } from 'react';
import { Slide, Box, Text } from '@sanity-labs/slides';
import { z } from 'zod';

export const HeroSchema = z.object({ title: z.string().min(1) }).strict();

export const Hero = ({ title }: z.infer<typeof HeroSchema>): ReactElement => (
  <Slide>
    <Box rect={{ x: 0, y: 0, w: 960, h: 540 }} fill={{ kind: 'solid', color: '#0b0b0b' }} />
    <Box rect={{ x: 60, y: 220, w: 840, h: 100 }}>
      <Text textStyle={{ fontFamily: 'display', fontSize: 56, foregroundColor: '#ffffff' }}>
        {title}
      </Text>
    </Box>
  </Slide>
);
TSX

# Splice the deck's index.ts the same way slides_add_component would. We do
# the find/replace directly in bash instead of going through the library API
# so this script keeps testing only the published bin surface.
python3 - "$deck_dir/src/index.ts" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
s = s.replace('// <generated-imports>\n// </generated-imports>',
              "// <generated-imports>\nimport { Hero, HeroSchema } from './components/Hero.js';\n// </generated-imports>")
s = s.replace('// <generated-components>\n    // </generated-components>',
              "// <generated-components>\n    Hero: defineTemplateComponent({\n      component: Hero,\n      schema: HeroSchema,\n      description: 'Hero',\n    }),\n    // </generated-components>")
open(p, 'w').write(s)
PY
grep -q 'Hero: defineTemplateComponent' "$deck_dir/src/index.ts" || { echo "FAIL: anchor splice didn't register Hero" >&2; exit 1; }

deck_payload='{"title":"deck verify","slides":[{"component":"Hero","props":{"title":"Hello from a deck"}}]}'
deck_pptx="$(cd "$TMPDIR" && echo "$deck_payload" | timeout 30 "$bin_path" generate --template "$deck_dir/src/index.ts" --output "$TMPDIR" 2>&1)" || { echo "FAIL: generate against deck failed:" >&2; echo "$deck_pptx" >&2; exit 1; }
test -f "$deck_pptx" || { echo "FAIL: deck generate didn't write a .pptx (got: $deck_pptx)" >&2; exit 1; }
magic="$(head -c 2 "$deck_pptx" | xxd -p)"
[[ "$magic" == "504b" ]] || { echo "FAIL: deck output is not a ZIP/.pptx (magic: $magic)" >&2; exit 1; }
LC_ALL=C grep -q 'ppt/slides/slide1.xml' "$deck_pptx" || { echo "FAIL: deck output has no ppt/slides/slide1.xml — the deck is just a shell" >&2; exit 1; }
echo "  ok: deck + agent-authored Hero rendered to $deck_pptx"

echo "✓ @sanity-labs/slides bin runnable end-to-end"
