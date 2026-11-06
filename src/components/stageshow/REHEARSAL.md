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

---

# Rehearsal: landing doctor's-side demo

Component: `src/components/landing/doctor-demo.tsx` (+ `doctor-demo.css`), in the "Doctors & clinics"
tab of section 03 (above the coded care-team table, replacing the old static link card). Text in
`landing.solutions.panels.doctors.demo`; numbers from `restingHrStory()` (`src/lib/landing/sample-data.ts`,
tested), filled into the finding sentence on the server.

- **Gold copied:** `chart-scrub` (the headline readout, one eased stroke along the line, hairline and
  dot read off the drawn path), with `hero-demo`'s corner-bleed window.
- **Story (plays once, about 8 s, then holds; Replay button under it):** the link's first screen as the
  real `ShareGate` has it (no data, no name, read-only, valid 14 days, opening is logged and shown to
  the patient) → Open summary → the summary crossfades in (chrome stays): "Resting heart rate is up"
  with its sentence, the line draws, the usual range as a band, the last 4 nights in the attention
  colour → the pointer runs from mid-month to last night; the readout rolls to 65 bpm in the
  attention colour. It plays once because a loop would have to play the navigation backwards.
- **Mounted only once visible:** the tab panel is `hidden` until chosen, so the stage mounts when its
  frame has a width; otherwise it picked the phone design and measured its labels at zero width.
- **Sized for the slot:** the tab's visual column is about 406 px on a laptop, so the wide design is
  420 × 400 (scales to 0.97); phones (below 400) get 358 × 352 with the finding's sentence dropped.
- **Looks checked:** light and dark, English and Hebrew (the window mirrors by hand, the chart and its
  axis stay left to right), 1280 and 390.
- **Gate:** framing, insets, overlaps and clips are clear. Left: `jump` of the Open button's width on
  press and a `settle snap` in a `Roll` (both inside kit parts), `steps in its box` on the window's URL
  at 390 (the host page settling as the tab opens), and the kit-override false positive above.
- **Honesty:** doctor links are Hebrew-only today; the English caption says so.

---

# Rehearsal: landing organizations demo

Component: `src/components/landing/org-demo.tsx` (+ `org-demo.css`), in the "Organizations" tab of
section 03, replacing the static weekly-bars visual (removed with its text and styles: the real org
page has no per-group or weekly breakdown, so that picture promised more than exists). Text in
`landing.solutions.panels.orgs.demo`, word for word from the real org page (`staff.org`) and the
member's consent row (`core.consent.org_aggregate`, "Approve sharing" / "Stop sharing"); numbers in
`ORG_DEMO` (`src/lib/landing/sample-data.ts`).

- **Gold copied:** `overlap` (a smaller chromeless card in front of a window, over its filler) with
  `form-error`'s button that changes on itself.
- **Story (loops, about 9 s):** the org page says "Not enough participants to show" → on a member's
  own sharing page, Approve sharing next to "Join anonymous organization statistics" → as the fifth
  participant (the default `ORG_MIN_COHORT`), the notice crossfades to the four group averages,
  tiles in reading order → hold → Stop sharing → the notice returns. The reset is the real revoke,
  so the loop has a seen cause and no data rewinds on its own.
- **Sized for the slot** (the tab's ~406 px column): 420 × 400, phones 358 × 358 without the intro
  line (the notice states the rule). The member's card runs off the bottom with the sharing page's
  other rows as placeholders. Mounted only once its hidden tab is shown, as the doctor demo.
- **Looks checked:** light and dark, English and Hebrew (window and column mirrored by hand), 1280
  and 390.
- **Gate:** clear at 1280 apart from the kit-override false positive; at 390 also `steps in its box`
  on the window's URL as the host page settles.

---

# Rehearsal: landing patients demo

Component: `src/components/landing/patient-demo.tsx` (+ `patient-demo.css`), in the "Patients &
families" tab of section 03 (the default tab), replacing the static 60-night HRV chart (removed with
its text and data). Text in `landing.solutions.panels.patients.demo`, word for word from the Today
tab (`home.today`); numbers in `TODAY_DEMO` with `bandOf()` (`src/lib/landing/sample-data.ts`, tested).

- **Gold copied:** `phone-touch` (a phone pinned from the top, centered, running off the bottom;
  the screen at true iOS points), with `choreography`'s rows changing in place in reading order.
- **Story (plays once, about 5 s, then holds; Replay button):** the Today tab at 7:12, opened before
  last night has arrived: "Ring synced 9 hours ago", the freshness note, yesterday's "Body this
  morning", all four measures within the usual range. The background sync lands and the page
  refreshes once, as the real `syncOnVisit` + `SyncRefresher` do: "Ring synced just now", the note
  folds away (the card below rises with it), the day reads "A steady day", and each row's dot
  slides to this morning's value 140 ms apart while its number rolls. HRV lands below the usual
  range in the attention colour. No cursor: nothing is tapped in the real flow either.
- **Sized for the slot** (~406 px column): 420 × 520 with a 340 px phone; phones 358 × 500, 310 px.
- **Looks checked:** light and dark, English and Hebrew (the phone's frame and status bar stay left
  to right; values with their units and the number lines stay left to right), 1280 and 390.
- **Gate:** clear at both widths apart from the kit-override false positive.
