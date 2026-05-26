---
'@sanity-labs/slides': minor
---

Add `Template.skill` field and `slides_guidelines` MCP tool so templates can expose design guidelines to the agent.

`Template.skill?: string` lets template authors bundle a markdown document with brand rules, component-selection heuristics, and visual constraints. The new `slides_guidelines` tool returns it to the agent at session start. `slides_list` hints when guidelines are available so the agent knows to read them.

SKILL.md updated to document the new tool (8 tools total, up from 7) and adds a "Read guidelines" step to the Tier 1 workflow. The scaffold template-base ships a placeholder SKILL.md that gets stamped into new templates.
