# Rehearsal: landing "send to my doctor" demo

Component: `src/components/landing/share-demo.tsx` (+ `share-demo.css`), shown under the steps in
section 06 "How it works" on `/`. Built with the Stageshow skill (`.agents/skills/stageshow`); the
kit is vendored in `src/components/stageshow/kit` (MIT, see `kit/LICENSE`).

- **Gold copied:** `hero-demo` (corner bleed, beats, popover from a trigger) with the satellite rules
  of `overlap` / `static-card`.
- **Story (about 11 s, loops):** Sharing page → Send next to the neurologist → review popover
  ("30-day dashboard and a PDF, link valid 14 days") → Confirm → button becomes Sent → the doctor's
  read-only view arrives over the window's navigation, HRV line draws in → "Opened" grows beside the
  doctor's name → hold → reset in place, last change first.
- **Poster (reduced motion, thumbnails):** sent, the doctor's view open, marked Opened.
- **Compact (phone, below 640 px):** 358 × 340, no navigation, one doctor row, the review popover
  opens above Send, the doctor's card runs off the bottom with its chart whole.
- **Looks checked:** light and dark (follows `prefers-color-scheme`), English and Hebrew (the
  picture mirrors; the macOS chrome stays left to right; the chart keeps time left to right).
- **Gate (`film.mjs --gate`, 1280 and 390):** framing, insets and clipping are clear. What remains:
  - `kit override … .ss-phone…` ×5: a false positive. Next bundles the kit's CSS into chunks whose
    URLs lack `/kit/`, so the filmer mistakes the kit's own phone styles for the demo's. The demo
    uses no phone.
  - `jump: ss-chart__dot`: the kit's Chart draws in on `performance.now()`, not the stage clock, so
    the filmer's sampled frames see the dot skip. Smooth in a real browser.
- **Not checked:** Safari and Firefox, a real phone, screen-reader output beyond the figure's
  `role="img"` label.

Vendoring notes: seven kit files carry `// @ts-nocheck` because the kit was written without
`noUncheckedIndexedAccess`; `.agents` and `.claude` are excluded from `tsconfig.json`.
