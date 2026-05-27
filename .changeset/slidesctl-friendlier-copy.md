---
'@sanity-labs/slides': patch
---

`slidesctl init` and friends — friendlier copy throughout.

The first version of the wizard leaked protocol jargon ("server name", "MCP client", "Pass --client claude-desktop explicitly") that meant nothing to a designer or PM setting up the tool for the first time. This rewrites every prompt, description, and success message in plain language.

The "server name" prompt is gone entirely on the happy path — the wizard derives a sensible label from the source and only asks the user to pick a different one when they're installing a second template that would collide. Most users will now see three questions: which template, where to save decks, and which app(s) to set it up for.

Also adds a friendly intro on first run and a "what to do next" block in the success message:

```
Let's set up a slide template so Claude can make decks in your brand.

? Which template? (paste a GitHub link, URL, or folder path)
? Where should Claude save the decks it makes? ~/Desktop/slides-template-decks
? Set up for Claude Desktop? Yes

✓ Done. "slides-template" is set up.

What to do next:
  1. Quit Claude Desktop completely (Cmd+Q) and reopen it.
  2. Ask Claude to make you a deck — e.g. "make a 5-slide pitch for Acme Corp".
  3. Generated files will appear in: ~/Desktop/slides-template-decks
```

Also adds `slidesctl update` (and surfaces it in `status` and the post-install message) so users know how to pull template changes over time.
