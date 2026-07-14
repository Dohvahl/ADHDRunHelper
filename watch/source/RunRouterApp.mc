import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;
import Toybox.Position;
import Toybox.ActivityRecording;
import Toybox.Activity;

// Step 3 (yours): own the GPS + FIT-recording lifecycle.
//
// The View (Step 4) reads live metrics straight from Activity.getActivityInfo(),
// so this class doesn't have to expose those. What it DOES own:
//   - turning GPS on/off
//   - creating / starting / stopping / saving the recording session
//   - answering "are we currently recording?" for the UI and input delegate
class RunRouterApp extends Application.AppBase {

    // Null until a run is started. Kept around after stop() so it can be saved.
    private var _session as ActivityRecording.Session?;

    function initialize() {
        AppBase.initialize();
        _session = null;
    }

    function onStart(state as Dictionary?) as Void {
        // TODO: turn GPS on so fixes start flowing and Activity.Info populates.
        //   Position.enableLocationEvents(Position.LOCATION_CONTINUOUS, method(:onPosition));
        // (Requires the Positioning permission — already in the manifest.)
    }

    function onStop(state as Dictionary?) as Void {
        // TODO: turn GPS back off to save battery when the app exits.
        //   Position.enableLocationEvents(Position.LOCATION_DISABLE, method(:onPosition));
    }

    // GPS fix callback. For the base recorder you can leave this essentially
    // empty — simply enabling events is what powers GPS, and the View reads
    // accuracy via Activity.Info.currentLocationAccuracy. Store the fix here
    // later if/when you need it directly.
    function onPosition(info as Position.Info) as Void {
        // TODO (optional for now)
    }

    // --- Run control (called by the input delegate in Step 5) ---

    // Start recording if not already. Create the session once, sport = running.
    //   _session = ActivityRecording.createSession({ :name => "Run", :sport => Activity.SPORT_RUNNING });
    //   _session.start();
    // Note: sport enum is Activity.SPORT_RUNNING in current SDKs; if the compiler
    // objects, the older spelling is ActivityRecording.SPORT_RUNNING.
    function startRun() as Void {
        // TODO
    }

    // Stop (pause) recording but keep the session so it can still be saved.
    //   _session.stop();
    function stopRun() as Void {
        // TODO
    }

    // Persist the recorded activity as a FIT (shows up in Garmin Connect / the
    // sim's FIT output).  _session.save();  then clear _session.
    function saveRun() as Void {
        // TODO
    }

    // Used by the UI/input to know which controls to show.
    //   return _session != null && _session.isRecording();
    function isRecording() as Boolean {
        return false; // TODO
    }

    function getInitialView() as [Views] or [Views, InputDelegates] {
        return [ new RunRouterView(), new RunRouterDelegate() ];
    }

}

function getApp() as RunRouterApp {
    return Application.getApp() as RunRouterApp;
}
