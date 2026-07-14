import Toybox.Activity;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Position;
import Toybox.System;
import Toybox.Timer;
import Toybox.WatchUi;

// The live run data screen.
//
// Pulls everything from Activity.getActivityInfo() on each draw. 
// The GPS callback in the App does NOT push data here. Every field can be 
// null until its sensor reports, which is why the Format helpers are null-tolerant.
//
// All positions are fractions of the screen size, never fixed pixels: the
// manifest targets both vivoactive4 (260px) and vivoactive4s (218px).
//
// NOTE: the outer ring of the screen is intentionally left empty — that's where
// the turn cues will flash later.
class RunRouterView extends WatchUi.View {

    // Drives the once-per-second redraw. Nothing pushes updates to us, so the
    // screen would otherwise render once and freeze.
    private var _timer as Timer.Timer?;

    function initialize() {
        View.initialize();
        _timer = null;
    }

    function onLayout(dc as Dc) as Void {
    }

    function onShow() as Void {
        _timer = new Timer.Timer();
        _timer.start(method(:onTick), 1000, true);
    }

    // Ask the system to redraw; onUpdate() then re-reads Activity.Info.
    function onTick() as Void {
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Dc) as Void {
        var info = Activity.getActivityInfo();

        // Unpack once, tolerating both a null Info and null fields.
        var timerSec = null; // Number
        var meters = null; // Float
        var speed = null; // Float
        var hr = null; // Number
        var gpsQuality = null; // Number

        if (info != null) {
            if (info.timerTime != null) {
                timerSec = (info.timerTime as Number) / 1000;   // timerTime is milliseconds
            }
            meters = info.elapsedDistance;
            speed = info.currentSpeed;
            hr = info.currentHeartRate;
            gpsQuality = info.currentLocationAccuracy;
        }

        var isMetric = (System.getDeviceSettings().distanceUnits == System.UNIT_METRIC);

        var w = dc.getWidth();
        var h = dc.getHeight();
        var cx = w / 2;

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();

        drawStatusRow(dc, cx, (h * 0.15).toNumber(), gpsQuality);

        // Hero metric: elapsed time. NUMBER font is digits + colon only, which
        // is all duration() ever produces.
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, (h * 0.36).toNumber(), Graphics.FONT_NUMBER_MEDIUM,
            Format.duration(timerSec),
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        // Distance carries its own unit suffix, so it needs a text font.
        dc.drawText(cx, (h * 0.57).toNumber(), Graphics.FONT_MEDIUM,
            Format.distance(meters, isMetric),
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        // Two-column footer: label above value, mimicking the native data pages.
        var leftX = cx - (w * 0.21).toNumber();
        var rightX = cx + (w * 0.21).toNumber();
        var labelY = (h * 0.72).toNumber();
        var valueY = (h * 0.81).toNumber();

        drawLabelledValue(dc, leftX, labelY, valueY, "PACE", Format.pace(speed, isMetric));
        drawLabelledValue(dc, rightX, labelY, valueY, "HR", Format.heartRate(hr));
    }

    function onHide() as Void {
        if (_timer != null) {
            _timer.stop();
            _timer = null;
        }
    }

    // A GPS-quality dot next to the recording state, centred as one group.
    private function drawStatusRow(dc as Dc, cx as Number, y as Number, gpsQuality as Number?) as Void {
        var recording = getApp().isRecording();
        var stateText = recording ? "REC" : "READY";
        var stateColor = recording ? Graphics.COLOR_RED : Graphics.COLOR_LT_GRAY;

        var dotRadius = 4;
        var gap = 6;
        var textWidth = dc.getTextWidthInPixels(stateText, Graphics.FONT_XTINY);
        var startX = cx - ((dotRadius * 2) + gap + textWidth) / 2;

        dc.setColor(gpsColor(gpsQuality), Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(startX + dotRadius, y, dotRadius);

        dc.setColor(stateColor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(startX + (dotRadius * 2) + gap, y, Graphics.FONT_XTINY, stateText,
            Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    private function drawLabelledValue(dc as Dc, x as Number, labelY as Number,
            valueY as Number, label as String, value as String) as Void {
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, labelY, Graphics.FONT_XTINY, label,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, valueY, Graphics.FONT_SMALL, value,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    // Green = trust it, yellow = marginal, red = don't.
    private function gpsColor(quality as Number?) as Graphics.ColorType {
        if (quality == null) {
            return Graphics.COLOR_RED;
        }
        if (quality == Position.QUALITY_GOOD || quality == Position.QUALITY_USABLE) {
            return Graphics.COLOR_GREEN;
        }
        if (quality == Position.QUALITY_POOR || quality == Position.QUALITY_LAST_KNOWN) {
            return Graphics.COLOR_YELLOW;
        }
        return Graphics.COLOR_RED;
    }

}
