# Watch UI — polish backlog

Deferred visual/UX polish for the run app, to pick up after the core milestones.
None of these are needed for the recorder to work — they make it *feel* native.

Reference screenshots are native Garmin screens Ty photographed as targets.
They currently live in `watch/resources/references/`, but that's inside the
Connect IQ build path and should be moved out to a repo-root `references/` —
update the paths below if/when it moves.

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

## Not a TODO — future-milestone reference
- `DistanceInputScreen.jpg` — the circular 0–9 distance input, for the distance
  entry screen in a later milestone.
