# Running the app on the real VivoActive 4S

**Everything built so far has only ever run in the Connect IQ simulator.** No
code in this folder has been executed on the physical watch. That's a real gap,
not a formality: the simulator feeds perfect GPS and synthetic heart rate, so the
parts of this app that matter most — acquiring a fix outdoors, reading HR off a
wrist, writing an activity that reaches Garmin Connect — are all unproven.

This doc covers how to get a build onto the watch, and what to actually check
once it's there.

## Sideloading

The developer key already signs every build, which is exactly what lets a
sideloaded app run without being published to the Connect IQ store.

1. **Build for the device.** In VS Code: `Monkey C: Build for Device`. Use the
   **debug** build for testing — better logging, and it produces the
   `.prg.debug.xml` symbol map that turns an on-device crash back into line
   numbers. `-r`/release is only for store submission. **Only the `.prg` goes on
   the watch**; the `.prg.debug.xml` stays in `bin/` on your computer.
2. **Plug the watch in over USB.** It mounts as a browsable device in Explorer.
3. **Copy the `.prg` into `GARMIN/APPS/`** on the watch.
4. **Eject properly, then unplug.** Yanking it mid-write can corrupt the app
   directory.
5. The app appears in the **activity list**, alongside Run / Walk / Bike.

## Debugging once it's off the simulator

`System.println` output is written to a log file on the device, under
`GARMIN/APPS/LOGS/`. **The exact filename is unverified** — check the directory
after a run rather than trusting this doc. This matters more than it sounds: once
the app is on the watch, that log is the only debugging window there is. There's
no console, no breakpoints, no simulator.

## What to verify on hardware

Core validated 2026-07-16. The remaining unchecked boxes are secondary and still
open.

- [x] **The app installs and appears.** Runs on the 4S, so `minApiLevel 3.3.0`
      fits the current firmware.
- [x] **GPS acquires outdoors and tracks** — distance and pace correct on a real
      run, and the quality dot transitions yellow→green on a good fix (confirms
      `gpsColor` against real `Position.Info` quality values).
- [ ] **GPS accuracy under trees / near buildings.** Not stress-tested yet; this
      is what turn cues will eventually depend on.
- [x] **Heart rate reads from the wrist sensor** — confirms HR flows from
      `Activity.Info` with no `Sensor` permission on real hardware.
- [x] **Distance and pace look sane while actually running.**
- [x] **The physical start/stop button** (`KEY_ENTER`) works mid-run.
- [x] **The Back guard** — Back while paused opens the save/discard screen
      instead of killing the run.
- [x] **The saved FIT reaches Garmin Connect** and shows as a running activity.
- [ ] **Battery drain** over a real run with GPS on continuously.

## Notes

- A sideloaded app is wiped by some firmware updates — if it vanishes from the
  activity list after an update, re-copy the `.prg`.
- The recorded activity lands in `GARMIN/ACTIVITY/` on the device and syncs from
  there.
