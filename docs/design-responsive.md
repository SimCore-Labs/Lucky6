# The Complete Viewport & Responsive Design Guide
### Mobile · Tablet · Desktop · Foldable · Ultra-wide — how every element should behave

**Version:** Part 1 of 3 · **Last researched:** October 2026
**Audience:** Developers and UI/UX designers building any kind of website (marketing, e-commerce, SaaS, dashboards, blogs, portfolios).
**Rule of the whole guide:** *Design for the content and the thumb first, then enhance for bigger screens.*

---

## TABLE OF CONTENTS (PART 1)

1. How screens actually work (the mental model)
2. The viewport meta tag
3. CSS units, and which to use where
4. The real-world device landscape (global + Nigeria)
5. Breakpoint strategy
6. Layout system: containers, gutters, margins, grids
7. Typography on every viewport
8. Images on every viewport
9. Logo behavior on every viewport
10. Icons and SVG
11. Navigation patterns per viewport
12. Touch targets and input methods
13. Forms on every viewport
14. Safe areas, notches, dynamic toolbars, keyboards
15. Spacing system
16. Buttons and CTAs
17. Cards and grids
18. Hero sections
19. Tables and data
20. Modals, drawers, popovers
21. Footers
22. Quick-reference master table

(Part 2: tablets, foldables, orientation, large desktop/TV, performance, accessibility, testing, CSS starter kit. Part 3: full component recipes, Tailwind recipes, checklists, anti-patterns.)

---

# 1. HOW SCREENS ACTUALLY WORK

## 1.1 Physical pixels vs CSS pixels

A phone that is advertised as "1170 pixels wide" does NOT give you 1170 pixels to design with. Browsers report a smaller number, the **CSS pixel** width, and the hardware scales it up using a **device pixel ratio (DPR)**.

| Device | Physical px | DPR | CSS px (what you design for) |
|---|---|---|---|
| iPhone 13/14 | 1170 × 2532 | 3 | 390 × 844 |
| Typical budget Android (Tecno/Infinix/Samsung A-series) | 720 × 1600 | 2 | 360 × 800 |
| Galaxy S-series | 1080 × 2340 | 3 | 360 × 780 |
| Pixel 7 | 1080 × 2400 | 2.6 | 412 × 915 |
| Full HD laptop (100% scaling) | 1920 × 1080 | 1 | 1920 × 1080 |
| Same laptop at 125% Windows scaling | 1920 × 1080 | 1.25 | 1536 × 864 |
| MacBook Air 13" | 2560 × 1664 | 2 | 1280 × 832 (default scaled) |
| 4K monitor at 150% | 3840 × 2160 | 1.5 | 2560 × 1440 |

**Rule:** Always design and test using CSS pixels. Never design against physical resolution.

**Why 1536×864 and 1366×768 matter:** Many Windows laptops ship at 125% or 150% scaling, so a "1080p" laptop reports 1536 or 1280 CSS px wide. Your "desktop" layout will often be seen at 1280–1536px, not 1920.

## 1.2 The three viewports (important!)

1. **Layout viewport**: the area the page is laid out against (what `100%` width refers to).
2. **Visual viewport**: the part the user currently sees (changes when they pinch-zoom or the keyboard opens).
3. **Ideal viewport**: the layout viewport set to match the device width. This is what `width=device-width` achieves.

Without the viewport meta tag, mobile browsers pretend the screen is about 980px wide and shrink your whole site. That is the "tiny desktop site on my phone" problem.

## 1.3 Pixel density and images

| DPR | Typical devices | Image you should serve (for a 400 CSS px wide slot) |
|---|---|---|
| 1x | Old laptops, cheap monitors | 400 px wide |
| 1.5x | Some Windows laptops, some Androids | 600 px wide |
| 2x | Most Androids in Nigeria, MacBooks, iPads | 800 px wide |
| 3x | iPhone Pro, flagship Androids | 1200 px wide (diminishing returns; cap at 2x for photos) |

**Practical tip:** serve up to 2x for most images. 3x photos are heavy and the visual benefit is small, which matters on Nigerian mobile data costs.

## 1.4 Orientation

Every phone and tablet can rotate. The width and height swap, so a 390×844 phone becomes 844×390 in landscape. In landscape, your "mobile" layout may suddenly get an 844px viewport, which falls in the *tablet* breakpoint range but with a tiny height (390px). Always test short-and-wide viewports (see Part 2).

---

# 2. THE VIEWPORT META TAG

## 2.1 The correct tag (copy this)

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

| Part | Meaning |
|---|---|
| `width=device-width` | Layout viewport = actual device width in CSS px |
| `initial-scale=1` | Start at 100% zoom, no auto-shrinking |
| `viewport-fit=cover` | Allows content to extend under notches/rounded corners (then you MUST handle safe areas, see section 14) |

## 2.2 What NEVER to put in the tag

```html
<!-- ❌ WRONG: blocks pinch-zoom, fails accessibility -->
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
```

- Blocking zoom is an accessibility failure (WCAG 1.4.4 Resize Text). Low-vision users depend on zoom.
- `maximum-scale=1` is commonly used to stop iOS zooming into inputs. The correct fix is `font-size: 16px` on inputs (see section 13).

## 2.3 Optional extras

```html
<!-- Browser UI color (Android Chrome address bar, Safari tab bar) -->
<meta name="theme-color" content="#0b0b0f">
<!-- Support both light and dark UI -->
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0b0b0f">
<!-- Tell the browser which color schemes your CSS supports -->
<meta name="color-scheme" content="light dark">
```

---

# 3. CSS UNITS: WHICH TO USE WHERE

| Unit | Relative to | Use for | Avoid for |
|---|---|---|---|
| `px` | CSS pixel | Borders, shadows, hairlines, tiny fixed offsets | Font sizes (ignores user font settings) |
| `rem` | Root font size (default 16px) | Font sizes, spacing, breakpoints, max-widths | Nothing really; this is your default |
| `em` | Parent/own font size | Padding inside buttons (scales with text), media queries | Deeply nested sizing (compounds) |
| `%` | Parent size | Widths in fluid layouts | Heights (parent often has no fixed height) |
| `vw` | 1% viewport width | Fluid typography (inside `clamp`), full-bleed sections | Scroll containers (includes scrollbar width, causes horizontal scroll) |
| `vh` | 1% viewport height (old) | Avoid on mobile | **Mobile hero sections (see below)** |
| `svh` | 1% **small** viewport height (toolbars shown) | Full-screen mobile sections that must never be cut off | n/a |
| `lvh` | 1% **large** viewport height (toolbars hidden) | Backgrounds that should fill when toolbars retract | Content that must stay visible |
| `dvh` | 1% **dynamic** viewport height (changes live) | App shells, full-height layouts | Animated elements (causes layout jank during scroll) |
| `ch` | Width of "0" glyph | Line length limits: `max-width: 65ch` | n/a |
| `vmin` / `vmax` | Smaller / larger viewport dimension | Square elements, orientation-proof sizing | n/a |
| `cqw` / `cqi` | 1% of container width/inline size | Component-level fluid sizing (container queries) | n/a |
| `fr` | Fraction of free grid space | CSS Grid columns | n/a |

## 3.1 The 100vh problem on mobile

On mobile, browser toolbars (address bar and bottom bar) slide in and out as you scroll. `100vh` equals the height with toolbars *hidden*, so a `100vh` hero is taller than the visible area when toolbars are showing. The bottom of your hero (usually the CTA) is cut off.

```css
/* ❌ Cuts off bottom on mobile */
.hero { min-height: 100vh; }

/* ✅ Modern: always fits the visible area with toolbars shown */
.hero { min-height: 100svh; }

/* ✅ With fallback for old browsers */
.hero {
  min-height: 100vh;      /* fallback */
  min-height: 100svh;     /* modern */
}
```

Use **`svh`** for "must fit on screen," **`dvh`** for app-like full-height shells, **`lvh`** for decorative backgrounds.

## 3.2 Why `rem` for breakpoints

Media queries in `rem`/`em` respect the user's browser font-size setting. If someone sets their default font to 20px, a `48rem` breakpoint triggers at 960px instead of 768px, so your layout switches to the compact version *when text is larger*. That is the correct behavior. Pixel breakpoints ignore this.

```css
/* 48rem = 768px at default font size */
@media (min-width: 48rem) { ... }
```

---

# 4. THE REAL-WORLD DEVICE LANDSCAPE

## 4.1 Global (StatCounter, mid-2026, all platforms combined)

| Resolution (CSS px) | Share (approx.) | Type |
|---|---|---|
| 1920 × 1080 | ~9.4% | Desktop/laptop |
| 414 × 896 | ~6.4% | iPhone XR/11 class |
| 360 × 800 | ~5.7% | Android |
| 375 × 812 | ~4.4% | iPhone X/11 Pro/12 mini class |
| 384 × 832 | ~3.7% | Android |
| 390 × 844 | ~3.3% | iPhone 12–14 |

## 4.2 Nigeria (StatCounter, July 2026, mobile)

| Resolution (CSS px) | Share (approx.) | Notes |
|---|---|---|
| **360 × 800** | **~17.2%** | Budget/mid Android. Your #1 target |
| **360 × 806** | **~17.0%** | Same family, different browser chrome |
| 414 × 896 | ~8.4% | iPhone XR/11/Plus |
| 360 × 820 | ~7.7% | Android |
| 412 × 915 | ~4.0% | Pixel/Samsung S-series |
| 385 × 854 | ~3.4% | Android |

**What this means:** about 40%+ of Nigerian mobile traffic is exactly **360px wide**. If your layout works at 360, it works at nearly everything above. Also test at **320px** (small/old devices, and the WCAG reflow requirement).

## 4.3 Reference device widths (CSS px, portrait)

### Phones
| Device | Width × Height |
|---|---|
| Very small / old Android, iPhone SE 1st gen | 320 × 568 |
| Galaxy A-series / Tecno / Infinix / itel common | 360 × 640 – 360 × 820 |
| iPhone SE (2nd/3rd gen), iPhone 8 | 375 × 667 |
| iPhone X / XS / 11 Pro / 12 mini / 13 mini | 375 × 812 |
| iPhone 12 / 13 / 14 | 390 × 844 |
| iPhone 14 Pro / 15 / 16 | 393 × 852 |
| iPhone 16 Pro | 402 × 874 |
| iPhone XR / 11 / 8 Plus | 414 × 896 / 414 × 736 |
| iPhone 14 Plus / 15 Plus | 428 × 926 |
| iPhone 14 Pro Max / 15 Pro Max / 16 Plus | 430 × 932 |
| iPhone 16 Pro Max | 440 × 956 |
| Pixel 7 / Galaxy S-class | 412 × 915 |

### Tablets
| Device | Width × Height (portrait) |
|---|---|
| iPad mini (6th gen) | 744 × 1133 |
| iPad (9th gen, 10.2") | 810 × 1080 |
| iPad (10th gen) / iPad Air 10.9" | 820 × 1180 |
| iPad Pro 11" | 834 × 1194 |
| iPad Pro 12.9" | 1024 × 1366 |
| iPad Pro 13" (M4) | ~1032 × 1376 |
| Generic Android tablet 10" | 800 × 1280 |
| Older iPad (classic) | 768 × 1024 |

### Foldables (approximate; vary by model)
| State | Typical width |
|---|---|
| Cover screen (folded) | ~280–360 px wide, very tall and narrow |
| Inner screen (unfolded) | ~600–900 px wide, nearly square |

### Laptops & desktops
| Class | CSS width |
|---|---|
| Old/small laptop | 1280 × 720 / 1366 × 768 |
| Windows laptop at 125% | 1536 × 864 |
| MacBook Air 13" | 1440 × 900 / 1470 × 956 |
| MacBook Pro 14" | 1512 × 982 |
| MacBook Pro 16" | 1728 × 1117 |
| Full HD desktop | 1920 × 1080 |
| QHD/2K desktop | 2560 × 1440 |
| 4K at 100% (rare) | 3840 × 2160 |
| Ultrawide | 3440 × 1440 |
| TV (browser on smart TV) | usually 1920 × 1080 CSS |

---

# 5. BREAKPOINT STRATEGY

## 5.1 Philosophy

1. **Mobile-first:** write base styles for the smallest screen, then add `min-width` queries to enhance.
2. **Content-driven:** add a breakpoint where *your layout starts to look bad*, not because a famous device exists.
3. **Fewer is better:** 3–5 breakpoints are enough for most sites. Fluid sizing does the rest.
4. **Container queries for components,** media queries for page structure.

## 5.2 Recommended breakpoint set

| Name | Min width | rem | Represents | Layout intent |
|---|---|---|---|---|
| base (xs) | 0 | 0 | 320–479 phones | Single column, stacked everything |
| `sm` | 480px | 30rem | Large phones, small landscape phones | Still mostly single column; 2-col for small cards |
| `md` | 768px | 48rem | Tablets portrait, large foldables | 2–3 columns, inline nav may appear |
| `lg` | 1024px | 64rem | Tablet landscape, small laptops | Full desktop layout, sidebars appear |
| `xl` | 1280px | 80rem | Laptops/desktops | Wider containers, more whitespace |
| `2xl` | 1536px | 96rem | Large desktops | Cap content width; add margins, not stretching |

## 5.3 Tailwind CSS v4 defaults (for reference)

| Prefix | Min width | Media query |
|---|---|---|
| `sm:` | 40rem (640px) | `@media (width >= 40rem)` |
| `md:` | 48rem (768px) | `@media (width >= 48rem)` |
| `lg:` | 64rem (1024px) | `@media (width >= 64rem)` |
| `xl:` | 80rem (1280px) | `@media (width >= 80rem)` |
| `2xl:` | 96rem (1536px) | `@media (width >= 96rem)` |

Tailwind's `sm` is 640px, which is *larger* than most Nigerian phones (360px). Everything under 640px uses your **unprefixed base styles**. So your base style IS your 360px design. Add a custom smaller breakpoint if needed:

```css
@theme {
  --breakpoint-xs: 30rem; /* 480px */
  --breakpoint-3xl: 120rem; /* 1920px */
}
```

**Tailwind v4 container query note:** container variants like `@md:` are based on the *container's* width and use a smaller scale than viewport breakpoints (`@md` = 448px, not 768px). Do not assume `md:` and `@md:` are the same size.

## 5.4 Media query cheat sheet

```css
/* Mobile first: base styles = smallest screen */
.component { ... }

@media (min-width: 30rem)  { /* 480px+ */ }
@media (min-width: 48rem)  { /* 768px+ */ }
@media (min-width: 64rem)  { /* 1024px+ */ }
@media (min-width: 80rem)  { /* 1280px+ */ }
@media (min-width: 96rem)  { /* 1536px+ */ }

/* Range syntax (modern, all current browsers) */
@media (48rem <= width < 64rem) { /* tablet only */ }

/* Orientation */
@media (orientation: landscape) and (max-height: 32rem) { /* short landscape phones */ }

/* Input capability (better than guessing from width!) */
@media (hover: hover) and (pointer: fine)   { /* mouse/trackpad */ }
@media (hover: none) and (pointer: coarse)  { /* touchscreen */ }

/* User preferences */
@media (prefers-reduced-motion: reduce) { }
@media (prefers-color-scheme: dark) { }
@media (prefers-contrast: more) { }
@media (prefers-reduced-data: reduce) { }  /* limited support, still worth including */

/* High density */
@media (min-resolution: 2dppx) { }
```

**Key insight:** *Width does not equal device type.* A 1024px iPad is touch; a 1024px laptop is mouse. Use `(hover: hover)` and `(pointer: coarse)` to decide hover effects and target sizes, and `min-width` for layout.

## 5.5 Container queries (component-level responsiveness)

```css
.card-wrapper { container-type: inline-size; container-name: card; }

.card { display: grid; gap: 1rem; }

@container card (min-width: 28rem) {
  .card { grid-template-columns: 8rem 1fr; }   /* image left, text right */
}
```

Use these when the same component appears in a narrow sidebar and a wide main area. The component adapts to *its* space, not the screen.

---

# 6. LAYOUT SYSTEM

## 6.1 Page container

| Viewport | Side padding (gutter) | Max content width |
|---|---|---|
| 320–479 | 16px (1rem) | 100% |
| 480–767 | 16–24px | 100% |
| 768–1023 | 24–32px | 100% (or 720px for text pages) |
| 1024–1279 | 32px | 960–1024px |
| 1280–1535 | 32–48px | 1200–1280px |
| 1536+ | 48px+ | 1280–1440px (centered, never stretch) |

```css
.container {
  width: 100%;
  max-width: 80rem;                    /* 1280px */
  margin-inline: auto;
  padding-inline: clamp(1rem, 4vw, 3rem);   /* 16px to 48px, fluid */
}
```

At 360px width: 360 − 32 = **328px** of usable content width. Design every element to fit 328px comfortably.

## 6.2 Grid column system

| Viewport | Columns | Gutter (gap) | Margin |
|---|---|---|---|
| Mobile (<768) | 4 | 16px | 16px |
| Tablet (768–1023) | 8 | 24px | 24–32px |
| Desktop (1024+) | 12 | 24–32px | 32–48px, or auto when capped |

You don't need to build a 12-col system manually. Use CSS Grid and let content decide:

```css
/* Auto-responsive cards: no breakpoints needed */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  gap: clamp(1rem, 2vw, 2rem);
}
```

The `min(100%, 16rem)` trick prevents overflow on screens narrower than 16rem (256px).

## 6.3 Layout patterns by viewport

| Pattern | Mobile | Tablet | Desktop |
|---|---|---|---|
| Main + sidebar | Sidebar stacks below (or hides into a drawer) | Sidebar below or collapsible | Sidebar beside, ~280–320px |
| Product grid | 1–2 columns | 2–3 columns | 3–5 columns |
| Blog index | 1 column | 2 columns | 3 columns or featured + grid |
| Pricing tables | Stacked cards (or horizontal scroll-snap) | 2–3 across | 3–4 across |
| Feature sections | Image above text | Image beside text | Alternating image/text rows |
| Dashboard | Single column, tabs | 2-column widgets | 3–4 column widgets + sidebar |
| Article | Full width | ~680px centered | ~680–720px centered (+ optional TOC aside) |

## 6.4 Overflow rules (the #1 responsive bug)

Horizontal scrolling on mobile almost always comes from one of these. Check each:

```css
/* Global safety net (use as diagnosis, not a permanent cure) */
*, *::before, *::after { box-sizing: border-box; }
img, video, svg, canvas { max-width: 100%; height: auto; }

/* Long strings: URLs, emails, German-style long words */
p, li, h1, h2, h3, td { overflow-wrap: break-word; }

/* Flex children refuse to shrink below content size */
.flex-child { min-width: 0; }

/* Grid children same issue */
.grid-child { min-width: 0; }
```

**Common culprits:** fixed `width: 400px` elements; `100vw` (includes the scrollbar); absolutely positioned decorations off-screen; wide tables; long unbroken text; `<pre>` code blocks; images with HTML width attributes and no `max-width`.

**Never** fix it with `overflow-x: hidden` on `body` as your only solution. It hides the symptom, breaks `position: sticky`, and can clip content.

---

# 7. TYPOGRAPHY ON EVERY VIEWPORT

## 7.1 Core rules

1. **Body text minimum 16px (1rem)** on all devices. Never smaller for paragraphs.
2. **Line length: 45–75 characters** (ideal ~65). Use `max-width: 65ch`.
3. **Line height:** body 1.5–1.7; headings 1.1–1.3.
4. **Use `rem`** so user font settings are respected.
5. **Contrast:** 4.5:1 for normal text, 3:1 for large text (≥24px, or ≥18.66px bold).
6. **Support 200% text zoom** without losing content or function.
7. **Don't use all caps for long text**; it reduces readability.
8. **Left-align body text** on every screen size. Avoid justified text on narrow screens (rivers of whitespace).

## 7.2 Type scale by viewport

| Element | Mobile (360) | Tablet (768) | Desktop (1280) | Large (1536+) |
|---|---|---|---|---|
| Display / Hero H1 | 32–40px | 44–52px | 56–72px | 64–80px |
| H1 (page title) | 28–32px | 36–40px | 40–48px | 48–56px |
| H2 | 24–26px | 28–32px | 32–40px | 36–44px |
| H3 | 20–22px | 22–26px | 24–28px | 28–32px |
| H4 | 18px | 18–20px | 20–22px | 22–24px |
| Body | 16px | 16–17px | 16–18px | 18px |
| Lead paragraph | 18px | 19–20px | 20–22px | 22–24px |
| Small / caption | 14px | 14px | 14px | 14–15px |
| Button label | 16px | 16px | 16px | 16–17px |
| Nav link | 16–18px (drawer) | 15–16px | 15–16px | 16px |
| Legal / footnote | 12–13px (never smaller) | 13px | 13px | 13–14px |

## 7.3 Fluid typography with `clamp()`

`clamp(min, preferred, max)` scales smoothly between a floor and a ceiling, with no breakpoints needed.

```css
:root {
  --fs-hero: clamp(2rem,   1.2rem  + 3.5vw,  3.75rem);   /* 32px → 60px  */
  --fs-h1:   clamp(1.75rem, 1.2rem + 2.4vw,  3rem);      /* 28px → 48px  */
  --fs-h2:   clamp(1.5rem,  1.1rem + 1.8vw,  2.5rem);    /* 24px → 40px  */
  --fs-h3:   clamp(1.25rem, 1.05rem + 0.9vw, 1.75rem);   /* 20px → 28px  */
  --fs-body: clamp(1rem,    0.95rem + 0.25vw, 1.125rem); /* 16px → 18px  */
  --fs-small: 0.875rem;                                   /* 14px fixed   */
}

body { font-size: var(--fs-body); line-height: 1.6; }
h1 { font-size: var(--fs-h1); line-height: 1.15; }
h2 { font-size: var(--fs-h2); line-height: 1.2; }
h3 { font-size: var(--fs-h3); line-height: 1.3; }
```

**Always include a `rem` in the preferred value** (like `1.2rem + 3.5vw`), not just `vw`. A pure `vw` value ignores the user's zoom and fails accessibility.

## 7.4 Line length control

```css
.prose { max-width: 65ch; }          /* articles */
.prose-wide { max-width: 75ch; }
.lead { max-width: 55ch; }           /* hero subtext */
h1, h2 { text-wrap: balance; }       /* even headline line breaks (modern browsers) */
p { text-wrap: pretty; }             /* avoids single-word last lines */
```

## 7.5 Font loading & performance

| Practice | Why |
|---|---|
| Use `font-display: swap` | Text visible immediately with fallback font |
| Self-host fonts or preconnect to Google Fonts | Fewer round trips |
| Limit to 2 families, 2–4 weights | Less data (important on mobile data plans) |
| Prefer variable fonts | One file, all weights |
| Use `system-ui` stack as fallback | Matches the OS, zero load |
| `size-adjust` on fallback `@font-face` | Reduces layout shift when the web font loads |

```css
font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

## 7.6 Typography behavior rules by viewport

**Mobile:**
- Headings can wrap to 3–4 lines; that's fine. Do not shrink below the scale just to fit one line.
- Avoid text over images unless you add a scrim/overlay for contrast.
- Break long words with `overflow-wrap: break-word` and `hyphens: auto` (set `lang` on `<html>`).
- Paragraph spacing ≈ 1em–1.25em between paragraphs.

**Tablet:**
- Two-column text only if each column ≥ 35ch.
- Keep body at 16–17px; don't scale headings too aggressively.

**Desktop:**
- Constrain line length; never let paragraphs run the full 1200px width.
- Large displays: raise body to 18px for comfort at distance.
- Headlines can use tighter letter-spacing (−0.01 to −0.03em) at display sizes only.

---

# 8. IMAGES ON EVERY VIEWPORT

## 8.1 Non-negotiable base

```css
img { max-width: 100%; height: auto; display: block; }
```

```html
<!-- ALWAYS set width/height attributes: reserves space and prevents layout shift (CLS) -->
<img src="hero-800.webp" width="800" height="450" alt="Descriptive text" loading="lazy" decoding="async">
```

## 8.2 Responsive images with `srcset` + `sizes`

```html
<img
  src="photo-800.webp"
  srcset="photo-400.webp 400w, photo-800.webp 800w, photo-1200.webp 1200w, photo-1600.webp 1600w"
  sizes="(min-width: 80rem) 33vw, (min-width: 48rem) 50vw, 100vw"
  width="1200" height="800"
  alt="..." loading="lazy" decoding="async">
```

- `w` descriptors tell the browser the file width; `sizes` tells it how wide the image will *display*. The browser then chooses based on viewport and DPR.
- Reading `sizes`: "at 80rem+ the image takes 33% of viewport width, at 48rem+ 50%, otherwise 100%."

## 8.3 Art direction with `<picture>`

Use when the *crop* should change, not just the size (wide hero on desktop, tight portrait crop on mobile).

```html
<picture>
  <source media="(min-width: 64rem)" srcset="hero-wide.avif" type="image/avif">
  <source media="(min-width: 64rem)" srcset="hero-wide.webp" type="image/webp">
  <source media="(min-width: 30rem)" srcset="hero-square.webp" type="image/webp">
  <source srcset="hero-portrait.webp" type="image/webp">
  <img src="hero-portrait.jpg" width="800" height="1000" alt="...">
</picture>
```

## 8.4 Formats

| Format | Use for | Notes |
|---|---|---|
| AVIF | Photos | Best compression; slower encode |
| WebP | Photos + graphics | Excellent support; safe default |
| JPEG | Fallback photos | Universal |
| PNG | Needs transparency + lossless, screenshots | Heavy; prefer WebP/AVIF |
| SVG | Logos, icons, illustrations | Infinite scaling, tiny size |
| GIF | Avoid | Use `<video autoplay muted loop playsinline>` instead |

## 8.5 Image sizing guide (display width → file width you provide)

| Slot | Mobile display | File widths to generate |
|---|---|---|
| Full-width hero | 360–430px | 480, 800, 1200, 1600, 2000 |
| Card thumbnail | ~328px (1 col) / ~160px (2 col) | 320, 480, 640, 800 |
| Product image (main) | 328px | 480, 800, 1200 |
| Avatar | 40–64px | 64, 128, 192 |
| Blog inline image | 328px | 480, 800, 1200 |
| Open Graph / share | n/a | 1200 × 630 |

## 8.6 Aspect ratios

```css
.media { aspect-ratio: 16 / 9; object-fit: cover; width: 100%; }
.card-img { aspect-ratio: 4 / 3; object-fit: cover; }
.avatar { aspect-ratio: 1; border-radius: 50%; object-fit: cover; }
.hero-img { aspect-ratio: 4 / 5; }               /* mobile portrait */
@media (min-width: 48rem) { .hero-img { aspect-ratio: 16 / 9; } }
```

| Context | Mobile ratio | Desktop ratio |
|---|---|---|
| Hero | 4:5 or 1:1 | 16:9 or 21:9 |
| Card | 4:3 or 1:1 | 4:3 or 3:2 |
| Product | 1:1 or 4:5 | 1:1 or 4:5 |
| Video | 16:9 | 16:9 |
| Banner | 2:1 | 3:1 or 4:1 |

## 8.7 Loading behavior

| Image | Attribute |
|---|---|
| Above-the-fold hero / LCP image | `loading="eager"` + `fetchpriority="high"`. **Never lazy-load the LCP image** |
| Everything below the fold | `loading="lazy"` |
| Decorative background images | CSS `background-image`, and consider hiding on mobile |
| Offscreen carousels | Lazy + only load active slide |

```html
<img src="hero.webp" fetchpriority="high" loading="eager" width="1200" height="800" alt="...">
<link rel="preload" as="image" href="hero.webp" imagesrcset="..." imagesizes="...">
```

## 8.8 Mobile data-saving rules (important for Nigeria)

- Keep total page weight under ~1.5 MB for mobile where possible, hero image under ~150 KB.
- Compress to quality 70–80 for WebP/AVIF.
- Use blurred low-quality placeholders (LQIP / blurhash) for perceived speed.
- Avoid auto-playing background video on mobile. Use a poster image instead; respect `prefers-reduced-data`.
- Avoid heavy parallax and huge decorative images on small screens.

## 8.9 Image behavior summary

| | Mobile | Tablet | Desktop |
|---|---|---|---|
| Hero image | Full-bleed, portrait/square crop, text below or overlaid with scrim | Full-bleed, 3:2–16:9 | Full-bleed or half-split, 16:9–21:9 |
| Gallery | 1-col swipe or 2-col grid | 3-col grid | 4-col or masonry, lightbox |
| Product images | Swipeable carousel with dots + pinch zoom | Carousel or thumbnails side | Thumbnails + hover zoom |
| Background images | Often replaced with solid color/gradient | Moderate | Full |
| Logos strip (clients) | 2–3 per row, or horizontal scroll | 4–5 per row | 5–8 per row |

---

# 9. LOGO BEHAVIOR ON EVERY VIEWPORT

## 9.1 Sizes

| Viewport | Header height | Logo display height | Logo max width |
|---|---|---|---|
| Mobile (<768) | 56–64px | 24–32px | ~120–140px |
| Tablet | 64–72px | 28–36px | ~140–170px |
| Desktop | 72–88px | 32–44px | ~160–220px |
| Large desktop | 80–96px | 36–48px | ~180–240px |
| Footer logo | n/a | 32–48px (any viewport) | ~160–200px |

Logo clear space: keep padding around the logo equal to the height of its "x-height" mark or ~½ logo height.

## 9.2 Logo variants (build all of these)

| Variant | When |
|---|---|
| **Full lockup** (symbol + wordmark) | Desktop/tablet header, footer, print |
| **Compact lockup** (smaller/stacked or shortened) | Mobile header |
| **Symbol / icon only** | Favicon, app icon, tiny headers, loading screens, avatar |
| **Wordmark only** | When the symbol is redundant, e.g. next to a large hero symbol |
| **Monochrome light + dark** | Dark mode, image overlays, dark footers |

```html
<a href="/" class="logo" aria-label="Company name, home">
  <picture>
    <source media="(min-width: 48rem)" srcset="logo-full.svg">
    <img src="logo-compact.svg" alt="Company name" width="120" height="32">
  </picture>
</a>
```

Alternatively, with inline SVG and CSS:

```css
.logo .wordmark { display: none; }
@media (min-width: 48rem) { .logo .wordmark { display: inline; } }
```

## 9.3 Logo rules

- **Always SVG** for crispness at any DPR. Provide PNG only as fallback (2x/3x).
- **Always set width/height** attributes to prevent layout shift.
- The logo links to the home page (`/`) on every viewport.
- Logo position: **left-aligned** on desktop; **left or centered** on mobile (left is the safe default; centered works for ecommerce with a hamburger on the left and cart on the right).
- Never stretch or distort; always `height: auto` or fixed height with `width: auto`.
- Use `alt` text equal to the brand name (or `aria-label` on the link if the logo is decorative inside a link).
- **Minimum legible size:** don't render a detailed logo below ~24px tall. Switch to the symbol-only variant.
- Provide a dark-mode version, or use `fill: currentColor`.
- **Favicon set:** `favicon.ico` (32×32), `icon.svg`, `apple-touch-icon.png` (180×180), `icon-192.png`, `icon-512.png` (PWA), maskable icon with safe zone.
- **Sticky header shrink:** it's common to reduce logo height by 15–25% when the header becomes sticky on scroll (desktop) to save vertical space.

---

# 10. ICONS AND SVG

| Rule | Detail |
|---|---|
| Format | Inline SVG or SVG sprite; avoid icon fonts (accessibility and loading issues) |
| Size | 16px (inline with small text), 20px (UI), 24px (standard), 32px+ (feature icons) |
| Touch target | Icon 24px **inside** a 44–48px tappable area (padding) |
| Color | `fill="currentColor"` / `stroke="currentColor"` so it inherits text color |
| Stroke weight | Keep consistent: 1.5px or 2px across the whole set |
| Accessibility | Decorative: `aria-hidden="true"`. Meaningful standalone: `role="img"` + `aria-label` |
| Scaling | Use `em`/`rem` sizing so icons scale with text: `width: 1.25em; height: 1.25em;` |

```css
.icon-btn {
  display: inline-grid; place-items: center;
  min-width: 2.75rem; min-height: 2.75rem;   /* 44px hit area */
}
.icon-btn svg { width: 1.5rem; height: 1.5rem; }
```

---

# 11. NAVIGATION PATTERNS PER VIEWPORT

## 11.1 Overview

| Viewport | Primary nav pattern |
|---|---|
| Mobile (<768) | Hamburger → full-screen overlay or slide-in drawer; OR bottom tab bar (apps/dashboards, 3–5 items) |
| Tablet (768–1023) | Hamburger OR condensed inline nav (≤5 short links); icon + label rails for apps |
| Desktop (1024+) | Full horizontal nav; mega menus for big sites; sidebar for apps |
| Large desktop | Same as desktop; cap the width; don't spread links edge to edge |

## 11.2 Mobile header

- Height 56–64px, fixed or sticky.
- Left: logo (or hamburger). Right: primary action (cart, search, CTA button) + hamburger.
- Max **3 elements** visible in the bar (logo, one action, menu).
- The menu opens as a drawer: width `min(85vw, 20rem)` or full screen; includes a visible **close** button, a backdrop, focus trap, and `Esc` to close.
- Menu links: font ≥ 16–18px, row height ≥ 48px, divider lines, nested items as accordions.
- Put the primary CTA (Sign up / Get quote / Call) inside the menu *and* keep a compact one in the header if it's key to conversion.
- Search: collapses to an icon that expands to a full-width field.
- Lock body scroll while the menu is open (`overflow: hidden` on `<body>` or use `<dialog>`).

## 11.3 Bottom tab bar (mobile apps / web apps)

- 3–5 destinations, icon + short label (≤ 10 chars).
- Height 56–64px + safe area inset bottom.
- Active state clearly distinguished (color + weight, not color alone).
- Not for marketing sites; use for dashboard/app-like products.

```css
.tabbar {
  position: fixed; inset: auto 0 0 0;
  display: grid; grid-auto-flow: column; grid-auto-columns: 1fr;
  padding-bottom: env(safe-area-inset-bottom);
  min-height: calc(3.5rem + env(safe-area-inset-bottom));
}
```

## 11.4 Tablet nav

- Portrait (≈768–834): treat like a big phone. Hamburger is fine, or inline nav with ≤5 items if they fit without wrapping.
- Landscape (≥1024): use the desktop pattern.
- Don't depend on hover (iPad has touch). Dropdowns must open on **tap**, not hover.

## 11.5 Desktop nav

- Height 72–88px (80px typical). Sticky is optional; if sticky, shrink to 56–64px on scroll.
- Left: logo. Center/right: links (4–7 max). Far right: CTA button (+ login/search).
- Dropdowns open on hover **and** on focus/click (keyboard accessible). Add a ~150ms hover intent delay.
- Mega menu: width constrained to container; 3–4 columns; no taller than ~70% of viewport height; scrollable if needed.
- Active link: underline or accent, not color alone.
- Include a skip link: `<a href="#main" class="skip-link">Skip to content</a>`.

## 11.6 Sidebar navigation (apps, docs, dashboards)

| Viewport | Behavior |
|---|---|
| Mobile | Off-canvas drawer (hamburger) or bottom tabs |
| Tablet | Collapsed icon rail (~72px) or drawer |
| Desktop | Persistent sidebar 240–280px; collapsible to 72px |
| Large desktop | Same; content area capped and centered |

## 11.7 Breadcrumbs, tabs, pagination

- **Breadcrumbs:** on mobile show only the parent ("← Category") or truncate the middle with "…".
- **Tabs:** on mobile, make them horizontally scrollable with scroll-snap and a visible fade at the edges; don't wrap onto 3 lines.
- **Pagination:** on mobile use Prev/Next + current page; on desktop show page numbers with ellipsis. Consider "Load more" for product lists.

---

# 12. TOUCH TARGETS AND INPUT METHODS

## 12.1 Official minimums

| Standard | Minimum target size |
|---|---|
| WCAG 2.2 SC 2.5.8 (Level AA, new in 2.2) | **24 × 24 CSS px**, or at least 24px spacing from neighboring targets |
| WCAG 2.2 SC 2.5.5 (Level AAA) | 44 × 44 CSS px |
| Apple Human Interface Guidelines | 44 × 44 pt |
| Google Material Design | 48 × 48 dp |

**Practical rule for this guide:** every tappable thing is **at least 44×44px** on touch devices, ideally 48×48. WCAG's 24px is the legal floor, not the design target.

## 12.2 Spacing between targets

- At least **8px** between adjacent tappable elements (12px preferred).
- Don't stack two small links directly on top of each other (footer link lists need ≥ 44px row height *or* generous padding).
- Close buttons ("×") must not sit within 8px of another action.

```css
a, button, [role="button"], input, select, textarea, summary {
  min-height: 2.75rem;  /* 44px */
}

/* Inline text links inside paragraphs are exempt in WCAG, but keep readable */
p a { min-height: 0; }

/* Larger targets on touch, tighter on mouse */
@media (pointer: coarse) { .btn { min-height: 3rem; } }
@media (pointer: fine)   { .btn { min-height: 2.5rem; } }
```

## 12.3 Expanding a hit area without changing the look

```css
.icon-btn { position: relative; }
.icon-btn::after {      /* invisible extra tap area */
  content: ""; position: absolute; inset: -0.5rem;
}
```

## 12.4 Input method rules

| Input | Behavior |
|---|---|
| Touch | No hover-only functionality. Tap = click. Provide visible pressed (`:active`) state. No tiny targets. |
| Mouse | Hover states, cursor changes, tooltips are OK (but not for essential info). |
| Keyboard | Visible `:focus-visible` outline (≥2px, 3:1 contrast). Logical tab order. No traps. |
| Stylus / pen | Treat like touch for sizing; support hover where available. |
| Voice / switch | Labels must match visible text (WCAG 2.5.3 Label in Name). |
| TV remote | D-pad focus navigation; large focus rings; 10-foot UI (see Part 2). |

```css
/* Only apply hover effects on devices that can hover */
@media (hover: hover) and (pointer: fine) {
  .card:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); }
}

:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
```

## 12.5 Gestures

| Gesture | Guidance |
|---|---|
| Swipe (carousels) | Always provide visible alternatives (arrows/dots). Don't hijack horizontal swipe on the whole page. |
| Pinch-zoom | Never disable on content pages. For maps/images, handle it intentionally. |
| Pull-to-refresh | Don't override it unless building an app. |
| Long-press | Not discoverable; never required. |
| Drag-and-drop | Provide a non-drag alternative (buttons or menu). |
| Back swipe (iOS edge swipe) | Keep drawers from starting at the very left edge, to avoid conflicts. |

---

# 13. FORMS ON EVERY VIEWPORT

## 13.1 Universal rules

- **One column** on mobile; two columns on desktop only for short related fields (First name / Last name; City / State).
- Visible `<label>` above every input (not placeholder-only).
- Input height 44–52px; font-size **≥ 16px**.
- 12–16px between fields. Group related fields with `<fieldset>`.
- Inline validation on blur, error text beneath the field in text *and* an icon (not color alone).
- Primary submit button: full width on mobile, auto width on desktop (left-aligned, or right-aligned at the end of a form).

## 13.2 The iOS zoom-on-focus issue

Safari on iPhone auto-zooms into any input whose computed font size is **below 16px**. Fix it with the font size, not by disabling zoom.

```css
input, select, textarea { font-size: 1rem; }  /* 16px minimum */
```

## 13.3 Use the right input type and attributes (this brings up the right keyboard)

| Field | Markup |
|---|---|
| Email | `<input type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false">` |
| Phone (Nigeria) | `<input type="tel" inputmode="tel" autocomplete="tel">` |
| Numbers (amounts) | `<input inputmode="decimal">` |
| OTP / PIN code | `<input inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6">` |
| Password | `<input type="password" autocomplete="current-password">` + show/hide toggle |
| New password | `autocomplete="new-password"` |
| Name | `autocomplete="name"` / `given-name` / `family-name` |
| Address | `autocomplete="street-address"`, `postal-code`, etc. |
| Search | `<input type="search" enterkeyhint="search">` |
| Date | `<input type="date">` (native pickers are best on mobile) |
| Card number | `inputmode="numeric" autocomplete="cc-number"` |

## 13.4 Behavior per viewport

| Element | Mobile | Tablet | Desktop |
|---|---|---|---|
| Layout | 1 column | 1–2 columns | 1–2 columns; max form width 480–640px |
| Labels | Above field | Above field | Above (preferred) or beside for long forms |
| Select menus | Native `<select>` (best UX on mobile) | Native | Custom only if fully accessible |
| Date/time | Native picker | Native | Native or accessible custom calendar |
| Multi-step forms | Strongly recommended for long forms; show progress | Same | Same, or a single page with sections |
| Submit button | Full width, sticky bottom for long forms (above the safe area) | Auto width | Auto width |
| Keyboard open | Scroll the focused field into view; don't let the keyboard cover the submit button | n/a | n/a |
| Autofocus | Avoid on mobile (opens the keyboard and hides context) | Avoid | OK on search/login |

## 13.5 Sticky submit bar with keyboard-safe positioning

```css
.form-actions-sticky {
  position: sticky; bottom: 0;
  padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom));
  background: var(--bg); border-top: 1px solid var(--line);
}
```

---

# 14. SAFE AREAS, NOTCHES, DYNAMIC TOOLBARS, KEYBOARDS

## 14.1 Safe-area insets

Modern phones have notches, Dynamic Island, rounded corners, and home indicators. With `viewport-fit=cover`, your content can render under them, so you must pad.

```css
:root {
  --safe-top:    env(safe-area-inset-top, 0px);
  --safe-right:  env(safe-area-inset-right, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left:   env(safe-area-inset-left, 0px);
}

.header { padding-top: var(--safe-top); }
.footer, .tabbar, .sticky-cta { padding-bottom: var(--safe-bottom); }

/* Landscape: notch on the left/right */
.page { padding-inline: max(1rem, var(--safe-left), var(--safe-right)); }
```

## 14.2 Dynamic toolbars

| Problem | Fix |
|---|---|
| `100vh` taller than the visible area | Use `100svh` / `100dvh` |
| Fixed bottom bar jumps as the toolbar hides | Use `position: sticky` where possible, or `bottom: 0` + safe-area padding |
| Page jumps when the address bar collapses | Avoid heights tied to `dvh` on elements near content that reflows |

## 14.3 Virtual keyboard

- The keyboard covers up to ~40–50% of the screen.
- Avoid putting critical buttons at the very bottom with `position: fixed` on pages with inputs. They end up hovering above the keyboard or hidden, depending on the browser.
- Use `interactive-widget=resizes-content` in the viewport meta (Chrome/Android) if you want the layout to resize with the keyboard:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
```

- You can listen to `window.visualViewport` resize events to adjust fixed UI.

## 14.4 Display cutouts and foldable hinges (see Part 2)

Foldables expose a hinge/fold region; use `@media (horizontal-viewport-segments: 2)` and `env(viewport-segment-*)`. Details in Part 2.

---

# 15. SPACING SYSTEM

Use an **8px base unit** (with a 4px half-step) as your scale.

| Token | rem | px | Typical use |
|---|---|---|---|
| `--space-1` | 0.25 | 4 | Icon-to-text gaps |
| `--space-2` | 0.5 | 8 | Tight stacking, between small items |
| `--space-3` | 0.75 | 12 | Form field gaps, chip padding |
| `--space-4` | 1 | 16 | Default gap, mobile gutter |
| `--space-5` | 1.5 | 24 | Card padding, tablet gutter |
| `--space-6` | 2 | 32 | Between groups, desktop gutter |
| `--space-8` | 3 | 48 | Section sub-spacing |
| `--space-10` | 4 | 64 | Section padding (mobile) |
| `--space-12` | 6 | 96 | Section padding (desktop) |
| `--space-16` | 8 | 128 | Hero padding (large desktop) |

## 15.1 Section vertical padding by viewport

| Viewport | Section padding (top/bottom) |
|---|---|
| Mobile | 48–64px |
| Tablet | 64–80px |
| Desktop | 80–120px |
| Large desktop | 96–144px |

```css
.section { padding-block: clamp(3rem, 2rem + 5vw, 7rem); }   /* 48px → 112px */
```

## 15.2 Spacing rules

- Spacing **between** groups > spacing **within** groups (proximity principle).
- On mobile, compress vertical rhythm by ~25–35% compared to desktop. Don't remove whitespace entirely; cramped mobile pages feel cheap.
- Use `gap` (flex/grid) instead of margins between siblings. It avoids collapsing and first/last child hacks.
- Use `padding-inline` / `margin-inline` (logical properties) to support RTL languages (Arabic) automatically.

---

# 16. BUTTONS AND CTAs

| Property | Mobile | Tablet | Desktop |
|---|---|---|---|
| Height | 48–52px | 44–48px | 40–48px |
| Horizontal padding | 20–24px | 20–24px | 24–32px |
| Font size | 16px | 16px | 16px |
| Width | Full width (primary CTA in forms/cards) | Auto or full width in narrow containers | Auto (min-width ~120px) |
| Border radius | Consistent system-wide (8–12px or pill) | Same | Same |
| Gap between buttons | 12px stacked | 12–16px, side by side | 16px, side by side |
| Order when stacked | Primary first (top), secondary below | Primary on the right (side by side) | Primary on the right/left consistently |
| Hover | None (use `:active`) | Only if hover-capable | Color shift, subtle lift |

## 16.1 Button states (all required)

default · hover · focus-visible · active/pressed · disabled · loading · (success/error where relevant).

- Disabled buttons must still have ≥3:1 contrast against the background where possible, with an explanation of why they're disabled.
- Loading state: keep the width stable (no jumping), show a spinner, and set `aria-busy="true"`.
- Don't rely on color alone for state.

## 16.2 CTA placement

| Viewport | Placement |
|---|---|
| Mobile | Above the fold in the hero; repeated after each key section; **sticky bottom bar** CTA for conversion pages (e.g., "Buy now", "Call us", "WhatsApp") |
| Tablet | Same as mobile with more room; side-by-side primary/secondary |
| Desktop | Hero, top-right nav button, end of sections; no sticky bar needed |

**WhatsApp/Call floating button (very relevant for Nigerian businesses):** a 56px circular button, bottom-right, 16px from the edge (+ safe-area), must not cover content or the cookie bar, and needs a text label or `aria-label`.

---

# 17. CARDS AND GRIDS

| Property | Mobile | Tablet | Desktop |
|---|---|---|---|
| Columns | 1 (or 2 for compact product cards) | 2–3 | 3–4 (up to 5 for tiny product cards) |
| Card padding | 16px | 20–24px | 24px |
| Gap | 16px | 20–24px | 24–32px |
| Image position | Top (full-bleed in the card) | Top | Top or left (list view) |
| Title | 18–20px, max 2–3 lines (`line-clamp`) | 18–20px | 20–22px |
| Description | 14–16px, 2–3 lines clamped | 3 lines | 3–4 lines |
| Whole-card link | Entire card tappable (one link, no nested links) | Same | Same + hover lift |
| Metadata | Single line, wrap OK | Single line | Single line |

```css
.card-title {
  display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2;
  -webkit-box-orient: vertical; overflow: hidden;
}
```

## 17.1 Product cards (e-commerce)

- Mobile 2-column grid is the norm for catalogs (each card ≈ 156px wide at 360px; keep text to price + title + 1 badge).
- Price is the most prominent text after the image: 16–18px bold. Strikethrough old price smaller.
- "Add to cart" as a full-width button at the bottom or an icon button (44px).
- Wishlist heart: 44px tap area, top-right of the image.
- Rating: stars + count in 12–14px text.
- Format prices with the locale: `new Intl.NumberFormat("en-NG", {style:"currency", currency:"NGN"})`.

---

# 18. HERO SECTIONS

| Property | Mobile | Tablet | Desktop |
|---|---|---|---|
| Height | Auto (content-based) with `min-height: 70–85svh`, or full `100svh` for landing pages | 60–80svh | 70–90vh (cap at ~900px) |
| Layout | Stacked: text then image (or image then text) | Stacked or 2-col | Split 50/50 or 60/40, or full-bleed image with overlay text |
| Headline | 32–40px, ≤ 4 lines | 44–52px | 56–72px, ≤ 3 lines |
| Subtext | 16–18px, ≤ 3 lines | 18–20px | 20–22px, max ~55ch |
| CTAs | Stacked, full width | Side by side | Side by side |
| Text over image | Needs dark/light scrim (≥ 4.5:1 contrast) | Same | Same |
| Social proof | Below CTAs, compact row | Same | Inline beside CTAs |
| Scroll cue | Optional, small | Optional | Optional |

```css
.hero {
  min-height: 85svh;
  display: grid; align-content: center;
  padding-block: clamp(2rem, 6vw, 6rem);
}
@media (min-width: 64rem) {
  .hero { grid-template-columns: 1.1fr 0.9fr; align-items: center; gap: 4rem; min-height: min(90vh, 56rem); }
}
```

---

# 19. TABLES AND DATA

Tables are the hardest component on mobile. Pick one strategy:

| Strategy | When | How |
|---|---|---|
| **Horizontal scroll container** | Wide numeric tables where comparison matters | Wrap in `overflow-x: auto`; freeze first column with `position: sticky; left: 0`; show a fade/shadow cue |
| **Stacked cards** | List-like data (orders, users) | Each row becomes a card with label/value pairs (`<td data-label="...">`) |
| **Column prioritization** | Many columns, few essential | Hide low-priority columns on mobile; reveal in an expandable row |
| **Chart instead** | Trends | Replace the table with a simplified chart + "View data" toggle |

```html
<div class="table-wrap" role="region" aria-label="Orders" tabindex="0">
  <table>...</table>
</div>
```
```css
.table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
th:first-child, td:first-child { position: sticky; left: 0; background: var(--bg); }
```

| Table property | Mobile | Desktop |
|---|---|---|
| Row height | 48–56px (touch) | 40–48px |
| Font | 14–16px | 14–16px |
| Header | Sticky if vertical scroll | Sticky |
| Pagination | Prev/Next or infinite scroll | Numbered |
| Actions | Overflow "⋯" menu per row | Inline icon buttons |

**Charts:** make them responsive (SVG with `viewBox`, or a library's responsive mode), reduce tick labels on mobile (show 3–4, not 12), increase touch targets for t