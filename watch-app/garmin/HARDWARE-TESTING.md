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

1. **Build for the device.** In VS Code: `Monkey C: Build for Device`. From a
   terminal it's `monkeyc` with `-d vivoactive4s -r` (release). Either drops a
   `.prg` in `bin/`.
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

The simulator cannot answer any of these:

- [ ] **The app installs and appears at all.** `manifest.xml` sets
      `minApiLevel 3.3.0`. If the watch's firmware is older than that, the app
      silently won't show up in the activity list. Check this first — it's the
      one that invalidates everything else.
- [ ] **GPS acquires outdoors**, and in a tolerable time. Watch what the READY
      state does while waiting, and whether the quality dot behaves sensibly.
- [ ] **GPS accuracy under trees / near buildings.** The simulator's coordinates
      were flawless; real ones aren't. This is what turn cues will eventually
      depend on.
- [ ] **Heart rate reads from the wrist sensor.** We saw `74` from simulated
      data, never from an arm. This is the one that confirms HR really does flow
      from `Activity.Info` with no `Sensor` permission.
- [ ] **Distance and pace look sane while actually running** — not just while a
      simulator increments a counter.
- [ ] **The physical start/stop button** (`KEY_ENTER`) works mid-run, with sweaty
      hands and in motion.
- [ ] **The Back guard** doesn't kill a live run by accident.
- [ ] **The saved FIT reaches Garmin Connect** and shows as a running activity.
      Saving to a local temp folder in the simulator is NOT the same thing, and
      this is the whole point of recording a FIT at all.
- [ ] **Battery drain** over a real run with GPS on continuously.

## Notes

- A sideloaded app is wiped by some firmware updates — if it vanishes from the
  activity list after an update, re-copy the `.prg`.
- The recorded activity lands in `GARMIN/ACTIVITY/` on the device and syncs from
  there.
