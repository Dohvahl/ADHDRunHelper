import Toybox.Lang;

// Pure formatting helpers for the run data screen — no I/O, no globals, so they
// can be unit-tested in isolation (see tests/FormatTest.mc).
module Format {

    // Elapsed time.
    //   Under an hour: "M:SS"  — minutes NOT zero-padded, seconds always 2 digits.
    //   One hour or more: "H:MM:SS" — minutes zero-padded to 2.
    // Examples: 5 -> "0:05", 65 -> "1:05", 600 -> "10:00", 3661 -> "1:01:01".
    function duration(totalSeconds as Number?) as String {
		if (totalSeconds == null) {
			return "0:00";
		}

		var seconds = totalSeconds % 60;
		var minutes = (totalSeconds / 60) % 60;
		var hours = totalSeconds / 3600;
		
		if (hours > 0) {
			return Lang.format("$1$:$2$:$3$",
				[hours.format("%d"), minutes.format("%02d"), seconds.format("%02d")]);
		}
		return Lang.format("$1$:$2$", [minutes.format("%d"), seconds.format("%02d")]);
    }

    // Distance with a unit suffix, 2 decimal places.
    //   isMetric true  -> kilometres: 5000 -> "5.00 km"
    //   isMetric false -> miles:      5000 -> "3.11 mi"   (1 mile = 1609.344 m)
    function distance(meters as Float?, isMetric as Boolean) as String {
        // TODO: null (no distance yet) -> "0.00 km" / "0.00 mi"
		if (meters == null) {
			return isMetric ? "0.00 km" : "0.00 mi";
		}

        if (isMetric) {
			return Lang.format("$1$ km", [(meters / 1000.0).format("%.2f")]);
		} else {
			return Lang.format("$1$ mi", [(meters / 1609.344).format("%.2f")]);
		}
    }

    // Pace as minutes:seconds per unit, with a suffix.
    //   isMetric true  -> "M:SS /km", false -> "M:SS /mi".
    //   speed <= 0 (stopped) -> "--:--".
    // Example: pace(1000.0/300.0, true) -> "5:00 /km".
    function pace(metersPerSecond as Float?, isMetric as Boolean) as String {
		if (metersPerSecond == null || metersPerSecond <= 0) {
			return "--:--";
		}

		if (isMetric) {
			return duration((1000.0/metersPerSecond).toNumber()) + " /km";
		} else {
			return duration((1609.344/metersPerSecond).toNumber()) + " /mi";
		}
    }

    // Heart rate in bpm.
    //   null (sensor hasn't reported yet) -> "--"
    //   otherwise the raw reading, e.g. 142 -> "142"
    function heartRate(bpm as Number?) as String {
		return bpm == null ? "--" : bpm.format("%d");
    }
}
