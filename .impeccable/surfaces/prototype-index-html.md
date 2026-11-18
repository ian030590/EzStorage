---
version: 1
slug: "prototype-index-html"
primary_target: "prototype/index.html"
related_targets: []
---

# Surface brief: EzStorage HTML prototype

## Scope and mode

Operate. A static, single-page HTML prototype (fake demo data, no backend) that shows every confirmed screen of EzStorage: the 3D room with the storage info panel, the scan page and borrow/reserve form, My Borrowings, the email previews with their one-click result pages, and the QR Code print page. Desktop and phone.

## Audience, task, constraints

- Colleagues borrowing teaching/therapy materials. On phones in a fluorescent-lit storage room (scan, pick up, return), and on desktop or phone elsewhere (browse, reserve, manage).
- Product rules live in PRODUCT.md. Build only what PRODUCT.md confirms. Prototype-only demo affordances (fake Google sign-in, simulated scan entry) must be labeled as prototype-only.
- No browser storage. State lives in memory and resets on reload.
- Added scope: edit each item's asset number inline and search all rooms by item name, asset number or position code. The search form lives inside `.topbar`; results stay in the room panel. Result selection locates the item's room/unit/layer. Asset numbers follow the same memory-only rule.

## Direction contract

THESIS: The storage room, drawn as an architectural axonometric, is the inventory itself: you read stock by looking at the room. This refuses the category default of a sidebar, a data table, and a 3D box embedded as one panel among many.

OWN-WORLD: Cyanotype-blue top bar (#173F8A). Cool drafting ground (#EEF2F6) with a 40px hairline grid. Ink (#14213D) linework at about 1.4px. Storage units are flat, pale blue-grey planes. Selection is a highlighter-yellow wash (#F2C230). Overdue is redline red (#C2361F). Full colour appears only in item photos. Storage units carry circled keynote tags (A1, B2) on leader lines. Type is Noto Sans TC, with Barlow Semi Condensed tabular figures for codes, dates, and counts. The panel uses two type sizes only; rank comes from weight and hairline rules. 取消預約 stands alone, with clear space around it.

STORY: A colleague sees which unit holds what, how many are left, who has each item and until when, and who is next. Then they borrow or reserve. Later, from an email, they extend, agree, or hand over in one click.

FIRST VIEWPORT: A blue bar holds the wordmark, the room tabs, the all-room search, QR Code 列印, 我的借用, and Google sign-in. The bar is 56px on wide desktop, 112px on compact desktop with the search on a second row, and 168px on phones with the search on a third row. The axonometric room fills the left ~61%, with keynote tags and a small title block (room, today's date). A 560px panel sits on the right: the unit tag, its type and layer count, and the primary 借用／預約 action. Below that, each layer is a section band (A1-1, A1-2). Each item shows a 96px photo darkened from the top by the share out, its name, remaining / total, borrower rows with day counts (negative in red), and a 接下來 list. On phones, the room sits on top and the panel becomes a bottom sheet.

FORM: Axonometric architectural drawing, position 5 of 7 on the ordered list; seed:997a04e16799defb. Signature interaction: clicking a unit eases the orthographic camera toward it and fills it highlighter yellow; doors swing open, drawers slide out, box lids lift; each layer then becomes clickable and scopes the panel.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Chosen composition

The decision sketch `.impeccable/mocks/decision/assigned.html` (1440x900 first viewport) is the composition the build matches.

## Unresolved

- Email wording in the prototype is draft copy; final wording must be confirmed with the developer before the GAS build.
- Real room plans, storage lists, item lists, and photos do not exist yet; everything in the prototype is synthetic demo data.
