---
'@sanity-labs/slides': patch
---

Fix `<Box rect={...} className="flex flex-row gap-4">` silently dropping the className for layout. `flex-row`, `gap-*`, `pt-*`, `items-*`, `justify-*`, and other layout classes were ignored on rect-positioned boxes, even though the `layout.ts` comment promised "a rect-positioned card can use flex internally." Position and size still come from the rect; everything else now flows from className/style so a rect-positioned card lays its children out the way the agent asked.
