# TracePilot / TracePilot Design System

## Direction
Dark-first chat application with enterprise data features (OKR tables, evidence panels, citation markers).
Light mode supported via `.dark` class toggle.

## Color Tokens (HSL via CSS custom properties)

### Light Mode (unchanged)
| Token              | Value                | Usage                        |
|--------------------|----------------------|------------------------------|
| `--background`     | `0 0% 100%`          | Page background              |
| `--card`           | `0 0% 98%`           | Surface 1                    |
| `--sidebar`        | `0 0% 96%`           | Surface 2                    |
| `--popover`        | `0 0% 94%`           | Surface 3                    |
| `--border`         | `0 0% 91%`           | Borders                      |
| `--foreground`     | `0 0% 9%`            | Primary text                 |
| `--muted-foreground`| `0 0% 40%`          | Secondary text               |
| `--primary`        | `217 91% 35%`        | Accent / interactive         |

### Dark Mode — Premium Indigo-Tinted Palette
Surfaces use hue 240 (cool blue) at 4-8% saturation for subtle depth.
Accent: indigo (hue 245) for interactive elements — distinct from GPT (green), Claude (amber), Linear (blue).

| Token              | Value                | Approx Hex | Usage                        |
|--------------------|----------------------|------------|------------------------------|
| `--background`     | `240 8% 7%`          | `#0f0e15`  | App shell (deepest)          |
| `--sidebar`        | `240 6% 9%`          | `#14131a`  | Sidebar panel                |
| `--card`           | `240 6% 10%`         | `#17161d`  | Cards, message bubbles       |
| `--popover`        | `240 5% 14%`         | `#211f27`  | Popovers, modals             |
| `--muted`          | `240 5% 15%`         | `#24232a`  | Hover / active surface       |
| `--secondary`      | `240 5% 17%`         | `#2a2930`  | Secondary surface            |
| `--border`         | `240 5% 16%`         | `#272630`  | Subtle borders               |
| `--input`          | `240 5% 24%`         | `#3a3940`  | Input borders                |
| `--foreground`     | `220 10% 96%`        | `#f3f2f7`  | Primary text (cool white)    |
| `--muted-foreground`| `220 5% 60%`        | `#9696a0`  | Secondary text               |
| `--primary`        | `245 75% 50%`        | `#5558e6`  | Indigo accent                |
| `--ring`           | `245 75% 60%`        | `#7577ef`  | Focus ring                   |
| `--destructive`    | `0 75% 45%`          | `#c71f1f`  | Error (brighter for dark bg) |

### WCAG AA Contrast Verification

| Pair                              | Ratio     | Required | Status |
|-----------------------------------|-----------|----------|--------|
| Foreground on Background          | **17.3:1** | 4.5:1   | PASS   |
| Foreground on Card                | **15.8:1** | 4.5:1   | PASS   |
| Foreground on Popover             | **13.6:1** | 4.5:1   | PASS   |
| Foreground on Muted               | **13.0:1** | 4.5:1   | PASS   |
| Muted-fg on Background            | **6.5:1**  | 4.5:1   | PASS   |
| Muted-fg on Card                  | **6.0:1**  | 4.5:1   | PASS   |
| Muted-fg on Popover               | **5.1:1**  | 4.5:1   | PASS   |
| Muted-fg on Muted surface         | **4.9:1**  | 4.5:1   | PASS   |
| Primary-fg (white) on Primary btn | **5.3:1**  | 4.5:1   | PASS   |
| Primary text on Background        | **3.5:1**  | 3:1 UI  | PASS   |
| Ring on Background                | **4.9:1**  | 3:1 UI  | PASS   |
| Ring on Card                      | **4.5:1**  | 3:1 UI  | PASS   |
| Destructive-fg on Destructive     | **7.7:1**  | 4.5:1   | PASS   |

## Typography

| Role       | Class              | Size   | Weight | Font         |
|------------|--------------------|--------|--------|--------------|
| Page title | `text-lg`          | 18px   | 600    | Inter        |
| Section H  | `text-base`        | 16px   | 600    | Inter        |
| Body       | `text-sm`          | 14px   | 400    | Inter        |
| Caption    | `text-xs`          | 12px   | 400/500| Inter        |
| Code       | `font-mono text-xs`| 12px   | 400    | JetBrains Mono |

### Rules
- **Minimum font size**: `text-xs` (12px). Never go below 12px for readability at zoom.
- **Allowed arbitrary sizes**: `text-[11px]` ONLY for citation markers `[1]` in mono. All other text must use Tailwind scale.
- **No `text-[10px]`** — use `text-xs` instead to survive 90% zoom.
- **Font smoothing**: `antialiased` on `body` only. Never add `subpixel-antialiased` to individual elements.
- **Font loading**: Inter 300-700 + JetBrains Mono 400-600 via Google Fonts with `display=swap`.

## Spacing (base 4px, extracted from 315+ uses)

| Scale | Value  | Uses | Usage                          |
|-------|--------|------|--------------------------------|
| `1`   | 4px    | 129  | Inline icon-text pairs         |
| `2`   | 8px    | 315  | Between related items (primary)|
| `3`   | 12px   | 129  | Card internal gaps             |
| `4`   | 16px   | 168  | Component/section padding      |
| `6`   | 24px   |  72  | Major section dividers         |
| `12`  | 48px   |  11  | Large layout spacing           |

### Rules
- Use Tailwind spacing scale only. No arbitrary values like `p-[13px]`.
- Consistent padding: cards use `p-6`, sidebar sections use `p-3`/`px-4 py-3`.
- Primary unit is `2` (8px) — use as default gap/padding.

## Radii (extracted from 75 uses)

| Token        | Value   | Uses | Usage                  |
|--------------|---------|------|------------------------|
| `rounded`    | 4px     | 16   | Inline chips           |
| `rounded-md` | 6px     | 28   | Buttons, inputs (primary)|
| `rounded-lg` | 9px     | 20   | Cards, modals          |
| `rounded-full`| 9999px | 11   | Avatars, index badges  |

## Borders & Depth (107 borders, 8 shadows — borders-dominant)

### Rules
- **Always use 1px borders** (107 uses). No `0.5px` or `border-[1.5px]` on layout/text containers.
- `border-2` only for emphasis highlights (3 uses).
- Use `border-border` for default, `border-muted/50` for subtle dividers.
- Shadows used sparingly: `shadow-sm`/`shadow-md` only on hover states.
- Never use raw hex/rgb for border colors in custom components.

## Rendering (anti-blur rules)

### Rules
- **No `scale-[*]` on text containers**. Causes sub-pixel text rendering at non-100% zoom.
- **No `transform` on layout containers** (sidebar, main column, message list, composer).
- **`transition-transform` is OK** on small icons (chevrons, switches) but NOT on containers with readable text.
- **No `backdrop-filter`/`filter`/`will-change`** on app shell or text parents.
- **No global `zoom` CSS**.
- SVG icons only (lucide-react) — no raster scaling.

## Elevation

Use the `--elevate-1` / `--elevate-2` overlay system from index.css. No direct `backdrop-filter: blur()`.

## Component Patterns

### Message Bubble
- User: `bg-primary text-primary-foreground rounded-lg px-4 py-3`
- Assistant: `bg-card border rounded-lg p-6`
- Max width: `max-w-2xl` (user), full width (assistant)

### Citation Marker
- `font-mono text-[11px] text-primary bg-primary/10 px-1 rounded`
- Clickable, scrolls to evidence panel

### Evidence Card
- `bg-muted/40 hover:bg-muted/60 p-2.5 rounded-lg`
- Highlighted: `bg-primary/15 ring-2 ring-primary/40` (no scale transform)

### Status Badge (text-xs, not text-[10px])
- On Track: `bg-green-100 text-green-700` / dark: `bg-green-900/30 text-green-400`
- At Risk: `bg-yellow-100 text-yellow-700` / dark: `bg-yellow-900/30 text-yellow-400`
- Behind: `bg-red-100 text-red-700` / dark: `bg-red-900/30 text-red-400`

### Open Button (dark-mode aware)
- Available: `bg-primary/10 hover:bg-primary/15 text-primary rounded border border-primary/20`
- Disabled: `bg-muted text-muted-foreground rounded border border-muted cursor-not-allowed opacity-60`
- **Do NOT use** raw `bg-blue-50 text-blue-700 border-blue-200` — fails in dark mode.

## Resolved Violations (2026-02-15)

| Issue | Status | Fix Applied |
|-------|--------|-------------|
| `text-[10px]` (4 files) | FIXED | → `text-xs` |
| `scale-[1.01]` on text containers (2 files) | FIXED | → removed |
| `bg-white` in SourceCard | FIXED | → `bg-card` |
| `bg-blue-50 text-blue-700` Open buttons (5 files) | FIXED | → `bg-primary/10 text-primary border-primary/20` |
| `text-gray-400`/`text-gray-500` icons (4 files) | FIXED | → `text-muted-foreground` |
| Raw `bg-blue-600` Edit button (AnswerWithSources) | FIXED | → `bg-primary hover:bg-primary/90` |
| Raw gradient (AnswerWithSources answer box) | FIXED | → `bg-primary/5 border-primary/40` |

## Remaining (low priority)

| Issue | Severity | Notes |
|-------|----------|-------|
| Emoji icons in SourceCard/AnswerWithSources | Nitpick | Functional, but SVG preferred |
| SyncProgress.tsx raw colors | Nitpick | Has dark-safe `/10` opacity pattern already |

## Visual QA Checklist

- [ ] **Sidebar**: cool-tinted surface, nav items readable, active state visible
- [ ] **Chat list**: conversation items distinct from sidebar bg, hover state clear
- [ ] **Message bubbles**: user (indigo primary), assistant (card surface), text crisp
- [ ] **Composer**: input border visible against background, placeholder readable
- [ ] **Modals/Popovers**: popover surface darker than card, border visible
- [ ] **Evidence panel**: highlight ring visible without scale blur
- [ ] **Status badges**: green/yellow/red readable on card surface
- [ ] **Open buttons**: indigo tint readable in both light and dark
- [ ] **Primary CTA buttons**: white text on indigo bg, clearly discoverable
- [ ] **Disabled states**: muted appearance, not invisible
- [ ] **Focus ring**: indigo ring visible on all surfaces (3:1+ contrast)
- [ ] **Zoom 90%**: text crisp, no sub-pixel blur
- [ ] **Zoom 100%**: baseline check
- [ ] **Zoom 110%**: no overflow, badges fit
- [ ] **Zoom 125%**: table columns don't clip
- [ ] **Keyboard nav**: Tab through buttons/inputs/links, focus ring visible
