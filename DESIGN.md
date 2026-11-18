---
name: EzStorage
description: Architectural drafting for a shared teaching and therapy inventory.
colors:
  blue: "#173F8A"
  blue-hover: "#102F6B"
  yellow: "#F2C230"
  yellow-layer: "#D9A910"
  red: "#C2361F"
  ground: "#EEF2F6"
  ink: "#14213D"
  secondary: "#46546E"
  rule: "#C9D3DF"
  white: "#fff"
  inverse-muted: "#E4EBF7"
  hover-plane: "#E3E9F0"
  unit-light: "#DCE4EE"
  unit-shade: "#C7D2E0"
  unit-interior: "#9FB0C6"
  room-floor: "#F4F7FA"
  room-wall: "#D8E0EA"
  stock-mask: "rgba(10,18,36,.68)"
typography:
  display:
    fontFamily: "Barlow Semi Condensed, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: normal
  headline:
    fontFamily: "Noto Sans TC, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.6
  title:
    fontFamily: "Noto Sans TC, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.6
  item-title:
    fontFamily: "Noto Sans TC, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.6
  body:
    fontFamily: "Noto Sans TC, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  body-compact:
    fontFamily: "Noto Sans TC, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Noto Sans TC, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.6
  figure:
    fontFamily: "Barlow Semi Condensed, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: normal
  figure-compact:
    fontFamily: "Barlow Semi Condensed, Noto Sans TC, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  square: "0"
  field: "3px"
  control: "4px"
  keynote: "50%"
spacing:
  tight: "4px"
  label-gap: "6px"
  inline-gap: "8px"
  compact-gap: "12px"
  row-inset: "14px"
  gutter-mobile: "16px"
  section-gap: "20px"
  gutter-desktop: "24px"
  page-inset: "28px"
  wide-gap: "32px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 17px"
  button-primary-hover:
    backgroundColor: "{colors.blue-hover}"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.blue}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 17px"
  button-secondary-hover:
    backgroundColor: "{colors.ground}"
  button-text:
    backgroundColor: transparent
    textColor: "{colors.blue}"
    typography: "{typography.body}"
    rounded: "{rounded.square}"
    padding: "10px 0"
  input-field:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "9px 10px"
  room-navigation:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.inverse-muted}"
    height: "56px"
    padding: "0 16px"
  room-navigation-active:
    textColor: "{colors.white}"
  keynote-tag:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.figure}"
    rounded: "{rounded.keynote}"
    size: "36px"
    padding: "0"
  keynote-tag-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.yellow}"
  record-container:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.square}"
    padding: "22px 24px"
  layer-band:
    backgroundColor: "{colors.white}"
    textColor: "{colors.secondary}"
    typography: "{typography.body-compact}"
    rounded: "{rounded.square}"
    padding: "14px 0 8px"
  scan-choice:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.square}"
    padding: "22px"
---

# Design System: EzStorage

## Overview

**Creative North Star: "The Axonometric Inventory"**

The Axonometric Inventory treats the storage room as a legible architectural drawing. Cool pale planes, ink outlines, circled keynote tags, and a blue service bar make the physical location and its contents readable together. The character is practical, precise, and calm, with full color concentrated in item imagery.

Traditional Chinese text carries the instructions; condensed figures keep codes, dates, and quantities easy to compare. Dense information sits in white, ruled rows, with hierarchy supplied by weight and spacing. Flat controls and visible keyboard focus support colleagues using phones in the storage room and larger screens elsewhere.

**Key Characteristics:**

- Architectural linework, pale planes, and circled storage identifiers.
- Blue navigation and actions, yellow selection, and red overdue values.
- Compact Traditional Chinese text paired with condensed tabular figures.
- Flat, ruled containers with small control corners and generous touch targets.

## Colors

The palette resembles a cool drafting sheet marked with blue ink, yellow highlighter, and occasional red corrections. Frontmatter values are the implementation tokens; the sidecar's generated tonal ramps are swatch previews, not additional production colors.

### Primary

- **Cyanotype Blue** (`blue`): the continuous service bar, primary action fills, secondary action outlines, and actionable text.
- **Deep Cyanotype** (`blue-hover`): the darker fill of an enabled native primary button on hover.

### Secondary

- **Highlighter Yellow** (`yellow`): selected storage exteriors, active room underlines, selected tag lettering, text selection, and keyboard outlines.
- **Layer Ochre** (`yellow-layer`): the selected shelf band or drawer front within an already selected storage unit.

### Tertiary

- **Redline Red** (`red`): overdue negative day counts, the ring on storage tags that hold overdue items, and form or action errors. It is an exception signal, not a decorative accent.

### Neutral

- **Drafting Ground** (`ground`): the plain application background, drawing stage ground, read-only fields, and quiet hover or disabled surfaces.
- **Drawing Ink** (`ink`): main text, structural dividers, room outlines, tag borders, and focus halos.
- **Slate Annotation** (`secondary`): supporting text, dates' surrounding labels, field borders, and scrollbars.
- **Hairline Grey** (`rule`): repeated row dividers, print-label borders, and the drafting grid.
- **Paper White** (`white`): panels, forms, record rows, dialog surfaces, and the lightest storage faces.
- **Blue-Bar Annotation** (`inverse-muted`): secondary text against blue or selected dark backgrounds.
- **Hover Plane** (`hover-plane`): scan-choice hover, unselected storage hover, and the lighter room wall.
- **Unit Light / Unit Shade / Unit Interior** (`unit-light`, `unit-shade`, `unit-interior`): repeated storage face materials; interiors remain darker when exteriors turn yellow.
- **Room Floor / Room Wall** (`room-floor`, `room-wall`): the enclosing architectural planes, used with Hover Plane for the other wall.
- **Stock Mask** (`stock-mask`): a translucent dark overlay whose height shows the share of inventory already out or awaiting pickup today.

### Named Rules

**The Stock Signal Rule.** Yellow identifies selection; red identifies overdue values or errors. Keep these meanings consistent across room, panel, and forms.

## Typography

**Display Font:** Barlow Semi Condensed, with sans-serif fallback, for the compact wordmark.

**Body Font:** Noto Sans TC, with sans-serif fallback, for Traditional Chinese headings, instructions, and controls.

**Figure Font:** Barlow Semi Condensed, with Noto Sans TC and sans-serif fallbacks for shared numeric text; prominent counts and tags use the shorter Barlow/sans-serif stack.

**Character:** Clear Chinese forms carry the language while condensed figures give inventory codes and dates a drafting annotation character. There is no oversized marketing headline treatment.

### Hierarchy

- **Display** (`display`): the bold wordmark (700, 20px, normal line height).
- **Headline** (`headline`): page titles (700, 26px, 1.6); compact page titles reduce to (24px) below the stacked-layout breakpoint.
- **Title** (`title`): ordinary section headings (700, 20px, 1.6).
- **Item title** (`item-title`): inventory names and the panel's compact section headings (700, 16px, 1.6).
- **Body** (`body`): page copy and fields (400, 14px, 1.6). Email prose uses a more open line height (1.9) and maximum measure (65ch).
- **Compact body** (`body-compact`): panel descriptions, borrower rows, annotations, and layer controls (400, 13px, 1.6).
- **Label** (`label`): ordinary actions (500, 14px, 1.6); the panel action uses the compact size (13px).
- **Figure** (`figure`): prominent remaining counts and room tags (600, 16px, normal line height); the panel tag strengthens the weight (700).
- **Compact figure** (`figure-compact`): dates, borrower quantities, and compact codes (400, 13px, 1.6), with bold or semibold emphasis where the row needs rank.

The implemented scan-choice heading is a local step (18px), room-tab text is (15px), and QR labels use (17px). These are component treatments, not a requirement to expand every panel's type scale. Numeric text and number/date inputs use tabular figures; letter spacing and uppercase transformations are not authored treatments.

### Named Rules

**The Two-Size Panel Rule.** Keep inventory-panel text at the compact body and item-title sizes; establish rank with weight, hairlines, and spacing.

## Layout

The repeated spacing rhythm is compact: inline gaps, row insets, and section gutters come from the frontmatter scale. Desktop panel gutters are (24px), shrinking to (16px) on phones. Repeated content is organized into aligned rows separated by thin rules.

The room view uses a full-height drawing stage beside an independently scrolling information panel. Above the compact-desktop range, the blue bar is (56px) tall and the panel is (560px) wide; the stage takes the remaining width. From (900px) through (1170px), the panel narrows to (520px), navigation gaps tighten, and the wordmark subtitle is hidden. These dimensions describe the room view, not every page.

The header is a compact (56px) grid on wide desktop; from (900px) to (1099px), search occupies a second row for a (112px) header. On phones the header is (96px): wordmark, service menu and account first, then a native room picker and search. Secondary services use a native details menu with (44px) link targets. The drawing stage is above an independently scrolling panel. Before selection it uses at most (32dvh / 240px); after selecting a unit or showing search it shrinks to (128px), with an explicit overview expand control. Arrangement mode uses (260px) and visible rotation controls. These are implemented dimensions, pending real-browser confirmation.

Ordinary pages center within (1080px), focused forms within (720px), and the email preview within (1280px). Page padding is (36px 28px 64px), becoming (26px 16px 48px) on phones. Desktop form fields group horizontally; identity fields stack on phones, while dates share two columns below the quantity control. The email preview changes from a (330px) list beside content to a stacked list capped at (240px) above the message.

The QR-label layout uses four columns on desktop and two on phones. Printing uses A4 with (12mm) margins, three label columns, (4mm) gaps, and QR artwork sized to (33mm). Navigation and prototype action links are hidden in print.

The stage's background is a hairline drafting grid (40px squares). It belongs only to the 3D room's drawing surface; forms, records, mail, and print pages use plain grounds. The projected floor grid inside the 3D room is separate geometry, not a page-wide background.

## Elevation & Depth

Interface containers have no resting drop shadows. White surfaces, cool ground, and thin dividers establish hierarchy. The room itself has geometric depth through an orthographic camera, flat face colors, darker interiors, ink outlines (1.4px), and lighter floor-grid strokes (0.7px). This drawn depth and its opening mechanisms are native to the world. The dialog uses a translucent ink backdrop (`rgba(10,18,36,.5)`).

### Shadow Vocabulary

- **Keyboard halo** (`box-shadow: 0 0 0 5px var(--ink)`): a focus treatment paired with a yellow outline (2px) offset by (2px). Layer controls use a slightly larger outline offset (3px). It is not container elevation.

### Named Rules

**The Drawn Depth Rule.** Keep interface surfaces flat; express the room's depth through planes, outlines, and opening geometry, while retaining the keyboard focus halo.

The room camera, zoom, doors, drawers, and lids approach their target state by a factor (0.12 per animation frame). Selection nudges the camera toward the unit and applies a small zoom multiplier (1.08). There is no shared CSS transition-duration scale. Reduced-motion mode snaps room interpolation with a factor (1) and disables CSS animation, transition, and smooth scrolling.

## Shapes

Content containers, inventory thumbnails, scan-choice rows, and print labels are square and ruled. Inputs have subtly eased corners (3px); ordinary buttons, sign-in controls, and the dialog use small corners (4px). Circular geometry is reserved for storage keynote tags and their corresponding panel identifier (50% radius).

Structural boundaries use ink rules (1px); repeated row divisions use Hairline Grey (1px). Tag outlines match the drawing stroke (1.4px), leader lines are finer (1px), and small SVG action icons use strokes (1.5px). Item images are square (96px) and clip their proportional stock mask from the top edge.

## Components

### Buttons

Quiet, compact controls with a clear blue action hierarchy.

- **Primary:** blue fill and border, white text, small corners, padding (9px 17px), and minimum height (44px). Enabled native buttons darken on hover; link actions share the resting appearance but have no separately authored hover fill.
- **Secondary:** white fill, blue text and border, the same shape and padding; enabled native buttons hover to the cool ground.
- **Panel action:** compact text (13px), padding (10px 14px), and right alignment in the panel heading; small phones reduce its padding to (9px 10px).
- **Text action:** blue underlined text with underline offset (4px), padding (10px 0), and minimum height (44px). The cancellation action sits alone after a divider, with top margin (18px) and top padding (24px). Pressing it swaps it in place for the question 確定取消這筆預約？ with a primary 確定取消 and a secondary 保留預約, with no modal; focus moves to the first of them, and 保留預約 restores the original button and its focus.
- **Sign-in:** a transparent, white-outlined control on the blue bar, minimum height (36px) on desktop and (44px) on phones; hover adds a translucent white wash (`#ffffff18`).
- **Focus / disabled:** interactive controls use the keyboard halo. The base disabled-button treatment uses muted text, cool ground, a light rule border, and the not-allowed cursor.

### Keynote Tags

Storage identifiers drawn as architectural annotations, not status chips.

- **Default:** white circle (36px), ink outline (1.4px), and condensed semibold code (16px), attached to its unit with an ink leader line and endpoint dot.
- **Overdue:** a unit holding an item past its return date gets a red outline (`red`, 1.4px border plus a 2px outline offset by 2px); on phones the same ring is drawn on the circle. Keyboard focus replaces it with the yellow outline and ink halo, and the tag's accessible label adds 有逾期未還. It is a ring, not a badge or extra element.
- **Selected / hover:** selected tags invert to ink with yellow lettering; hover turns the visible circle yellow with ink lettering. Selection is also exposed through `aria-pressed`.
- **Phone:** a transparent target (44px) contains the smaller outlined circle (30px) with code text (14px). Tag placement avoids overlap; the visible circle and the hit area are deliberately different sizes.
- **Panel identifier:** ink circle (44px) with yellow bold code (16px); it reduces to (40px) on small phones.

### Cards / Containers

White ruled records rather than floating cards.

- **Record rows:** square white surfaces with a bottom hairline and padding (22px 24px), reducing to (20px 16px) on phones. Metadata wraps and actions use a separate spaced row.
- **Form rows:** white surfaces separated by hairlines, with padding (18px 20px), reducing to (16px) on phones.
- **Result surfaces:** a stronger ink top border and light bottom rule, with padding (28px); narrow layouts use (22px 18px). A single 回到房間 primary action under the message returns to the relevant room.
- **Dialog:** white surface, thin ink border, small corners, padding (28px), width (440px), and maximum width `calc(100vw - 32px)`. A plain SVG close control sits at the upper right.
- **Depth:** use the flat surface treatment described in Elevation & Depth.

### Inputs / Fields

Plain, readable fields with explicit labels and a strong focus treatment.

- **Text, email, date, number:** white fill, slate border (1px), subtle corners (3px), padding (9px 10px), and minimum height (44px). Labels sit above fields with a gap (6px).
- **Read-only:** the background changes to the cool ground. The caret uses the primary blue.
- **Quantity:** a square numeric center between two ground-filled buttons, with tabular figures and inline SVG minus/plus marks. Step buttons are (38px) wide on desktop and (44px) on phones, always at least (44px) tall.
- **Checkbox:** a blue-accented square (20px) inside a label target at least (44px) tall.
- **Errors / focus:** errors appear as red text near the form footer; the current build does not add a separate error-border variant. Fields retain the yellow outline and ink focus halo.

### Navigation

The continuous blue service bar retains the room context and all-room search. Desktop room links expose `aria-current="page"`; mobile uses a labelled native room picker. A native details menu groups QR printing, numbering rules and management. 我的借用 is its own always-visible link before the account button, as is the account button itself. Secondary links are (44px) targets; Escape dismisses the service menu. The selected room uses the original yellow underline on desktop.

### Inventory Rows and Layer Bands

Compact evidence of what is available and who holds the rest.

- **Layer band:** a compact text control and condensed layer code sit above a light divider, with padding (14px 0 8px). The selected or hovered control turns ink and bold; its minimum height grows from (24px) on desktop to (44px) on phones.
- **Item row:** square image (96px) beside flexible text, with gap (16px), vertical padding (14px), and a light bottom rule. Phone gaps shrink to (12px).
- **Availability:** image-darkening grows downward in proportion to the share already out or awaiting pickup today. Remaining and total figures sit beside the item name. Borrower rows align a name, date range, and bold day count with its unit (13 天, 0 天, -2 天), in a column sized to its content; overdue values keep their minus sign and turn red. Upcoming reservations use muted text.
- **Room selection:** selected exterior faces turn yellow while interiors stay blue-grey; choosing a layer adds the deeper ochre accent and scopes the panel. Doors swing, drawers slide, and box lids lift. Keynote buttons provide the parallel keyboard-accessible selection control.
- **Title block:** a small, ruled white block at the drawing stage's lower left groups the room name and date; it stays within the drawing surface.

### Asset Numbers and Inventory Search

- Keep the all-room search inside the blue `.topbar`, between room navigation and service links. Use an accessible label, a white 44px search input and a white-text clear action. Results and their live count stay in the room panel. Bind the persistent header controls once; preserve keyboard and Chinese input focus across room renders. Searching from another page returns to the room to show results.
- Show a separate 財產編號 line below each item name, with a quiet 編輯 action. Edit inline with labeled text input, 儲存 and 取消; never reuse the position code as the asset number. The field saves through the authenticated API and may be left empty.
- Render results as flat, ruled links with the item name, availability, asset number, room and position. Selecting a result opens its room/unit/layer and moves focus to the item. Empty searches restore the storage content; zero matches show recovery copy.
- Preserve the existing blue actions, slate annotations, condensed tabular codes, 3px input corners, 44px controls, and yellow/ink keyboard focus. Asset numbers wrap rather than truncate or widen the phone layout.

### Scan Choices

Large, flat rows for the three on-site actions.

- **Shape / spacing:** square white rows with thin grey boundaries, padding (22px), gap (18px), and minimum height (96px).
- **Type / icon:** bold action name (18px), supporting copy (14px), and an outlined inline SVG icon (28px). The pickup and return rows end their supporting copy with the signed-in user's count at this unit (你有 2 件待領取, 你有 1 件尚未歸還, or 目前沒有); the rows stay selectable.
- **State:** hover uses Hover Plane; keyboard focus uses the shared yellow outline and ink halo.

## Do's and Don'ts

### Do:

- Do keep blue for navigation and actions, yellow for selection, and red for overdue values and errors.
- Do use Noto Sans TC for Traditional Chinese text and condensed tabular figures for codes, dates, and quantities.
- Do keep inventory-panel hierarchy to compact body and item-title sizes, with weight and hairlines supplying rank.
- Do preserve drawn room depth, circled storage tags, leader lines, and the room-only 40px drafting grid.
- Do keep visible keyboard focus, phone-sized hit areas, and reduced-motion behavior when extending components.
- Do isolate the cancellation action with its divider and clear vertical space.
- Do retain a signed day count and a proportional top-down stock mask as readable availability signals.

### Don't:

- Don't extend the room's 40px drafting grid onto form, record, email, or print-page backgrounds.
- Don't replace the room's pale architectural planes with full-color decorative materials; keep illustrative color in item imagery.
- Don't add decorative drop shadows to flat interface containers or remove the focus halo in the name of flatness.
- Don't turn keynote identifiers into generic status pills or shrink their phone hit areas to the visible circle.
- Don't treat synthetic demo illustrations, sample inventory, account details, or draft email wording as production identity or content.


### Shelf Position Maps and Management

Each nonempty shelf displays a read-only two-dimensional position map with back at the top and front at the bottom. Item buttons link to their detailed inventory rows and include remaining quantities. Only administrators in arrangement mode receive drag handles; normal viewers retain the same spatial positions after editing ends. Position-map text uses (13px), native focus treatment, and the existing ground/rule palette. New items use spaced starting positions; very dense shelves still require deliberate rearrangement.

Selected furniture has labelled left/right (90 degree) rotation buttons in arrangement mode, each with a (44px) target. A failed save restores the prior transform. Mobile overview, rotation and arrangement states share the original blue/yellow action language.

Management retains the room / furniture / item grouping. Basic fields remain visible; native details elements hold model geometry and normalized shelf coordinates. Dimensions explicitly use room-model units, with the room model at (10 × 8). Status and error messages sit beside each form's submit control. In-memory drafts survive selector changes and internal navigation; the copy asks users to save before refreshing. Empty rooms provide role-specific next steps.
