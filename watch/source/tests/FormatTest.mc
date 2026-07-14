import Toybox.Lang;
import Toybox.Test;

// Unit tests for the Format module. These are RED until the Format bodies are
// implemented (Step 2). `(:test)` functions are compiled only into test builds,
// so they add nothing to the shipped app.

(:test)
function testDuration(logger as Test.Logger) as Boolean {
    Test.assertEqualMessage(Format.duration(0),    "0:00",    "0 seconds");
    Test.assertEqualMessage(Format.duration(5),    "0:05",    "5 seconds");
    Test.assertEqualMessage(Format.duration(65),   "1:05",    "65 seconds");
    Test.assertEqualMessage(Format.duration(599),  "9:59",    "just under 10 min");
    Test.assertEqualMessage(Format.duration(600),  "10:00",   "10 min");
    Test.assertEqualMessage(Format.duration(3600), "1:00:00", "exactly 1 hour");
    Test.assertEqualMessage(Format.duration(3661), "1:01:01", "1h 1m 1s");
    return true;
}

(:test)
function testDistanceMetric(logger as Test.Logger) as Boolean {
    Test.assertEqualMessage(Format.distance(0.0,    true), "0.00 km", "zero");
    Test.assertEqualMessage(Format.distance(5000.0, true), "5.00 km", "5 km");
    Test.assertEqualMessage(Format.distance(1234.0, true), "1.23 km", "rounds to 2 dp");
    return true;
}

(:test)
function testDistanceStatute(logger as Test.Logger) as Boolean {
    Test.assertEqualMessage(Format.distance(1609.344, false), "1.00 mi", "exactly 1 mile");
    Test.assertEqualMessage(Format.distance(5000.0,   false), "3.11 mi", "5000 m in miles");
    return true;
}

(:test)
function testPace(logger as Test.Logger) as Boolean {
    Test.assertEqualMessage(Format.pace(0.0,              true),  "--:--",    "stopped");
    Test.assertEqualMessage(Format.pace(0.0,              false), "--:--",    "stopped");
    Test.assertEqualMessage(Format.pace(1000.0 / 300.0,   true),  "5:00 /km", "5:00 per km");
    Test.assertEqualMessage(Format.pace(1609.344 / 360.0, false), "6:00 /mi", "6:00 per mile");
    return true;
}

// --- Null tolerance ---------------------------------------------------------
// Every Activity.Info field is null until its sensor reports. These pin down
// what the data screen shows while we're still waiting for a fix / a reading.

(:test)
function testDurationNull(logger as Test.Logger) as Boolean {
    Test.assertEqualMessage(Format.duration(null), "0:00", "timer not started");
    return true;
}

(:test)
function testDistanceNull(logger as Test.Logger) as Boolean {
    Test.assertEqualMessage(Format.distance(null, true),  "0.00 km", "no distance yet, metric");
    Test.assertEqualMessage(Format.distance(null, false), "0.00 mi", "no distance yet, statute");
    return true;
}

(:test)
function testPaceNull(logger as Test.Logger) as Boolean {
    Test.assertEqualMessage(Format.pace(null, true),  "--:--", "no speed yet, metric");
    Test.assertEqualMessage(Format.pace(null, false), "--:--", "no speed yet, statute");
    return true;
}

(:test)
function testHeartRate(logger as Test.Logger) as Boolean {
    Test.assertEqualMessage(Format.heartRate(null), "--",  "sensor hasn't reported");
    Test.assertEqualMessage(Format.heartRate(142),  "142", "live reading");
    return true;
}
