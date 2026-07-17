# Watch app — backlog

## Validate on hardware — NOT polish, and not done

- [ ] **Run this app on the actual VivoActive 4S.** Everything to date has only
      run in the simulator. See [HARDWARE-TESTING.md](HARDWARE-TESTING.md) for how
      to sideload and what to check. Until this is done, "Milestone 1 works" means
      "works against synthetic GPS and a fake heart rate" — the FIT reaching
      Garmin Connect, real GPS acquisition, and the wrist HR sensor are all
      unproven, and `minApiLevel 3.3.0` may not even match the watch's firmware.

---

## Polish backlog

Deferred visual/UX polish for the run app, to pick up after the core milestones.
None of these are needed for the recorder to work — they make it *feel* native.

Reference screenshots are native Garmin screens Ty photographed as targets.
They live in `references/` at the repo root (moved out of the Connect IQ build
path). Filenames below are relative to that folder.

## Transitions
- [ ] **Start / resume splash** — on start or unpause, briefly show a full-screen
      GREEN splash with a darker-shaded play glyph before dropping into the data
      screen. Ref: `Play-Resume-IndicatorScreen.jpg`.
- [ ] **Pause splash** — on pause, briefly show a full-screen RED splash with a
      darker-shaded stop glyph. Ref: `Pause-Stop-IndicatorScreen.jpg`.

## Paused state
- [ ] **Pause summary screen** — after the pause splash, show a summary of the run
      so far (metrics), with save (bottom) / discard (top) indicators; the
      top-right button resumes. Ref: `PausedScreen.jpg`.
- [ ] **Paused back-button screen** — when paused, Back opens an options screen
      like `Paused-BackButton-Screen.jpg`.

## Ready / paused affordance
- [ ] **Play-hint restyle** — make the blinking play hint a FILLED semicircle with
      the play triangle as *negative space* (cut out), instead of the current thin
      arc + solid triangle. (Impl: `drawPlayHint` in `RunRouterView.mc`.)

## Cleanup
- [ ] Remove the debug `System.println` calls (`onKey` / `onSelect` / `onBack` /
      `saveRun` / `discardRun`) once the button and save flow are confirmed.
- [ ] Rewrite the process-flavoured comments left over from building this
      (`// Step 3 (yours)`, `// TODO (Step 2)`, `// Placeholder render. Replaced
      by the real data screen in a later step`, and the `getInitialView` /
      `onPosition` narration). Comments should state a constraint or a *why* for
      a future reader — not narrate the order we built things in.

## Not a TODO — future-milestone reference
- `DistanceInputScreen.jpg` — the circular 0–9 distance input, for the distance
  entry screen in a later milestone.
