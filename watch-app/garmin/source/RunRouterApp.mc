import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;
import Toybox.Position;
import Toybox.ActivityRecording;
import Toybox.Activity;


// The View reads live metrics straight from Activity.getActivityInfo(),
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
        // turn GPS on so fixes start flowing and Activity.Info populates.
		Position.enableLocationEvents(Position.LOCATION_CONTINUOUS, method(:onPosition));
    }

    function onStop(state as Dictionary?) as Void {
        // turn GPS back off to save battery when the app exits.
        Position.enableLocationEvents(Position.LOCATION_DISABLE, method(:onPosition));
    }

    // GPS fix callback. For the base recorder you can leave this essentially
    // empty — simply enabling events is what powers GPS, and the View reads
    // accuracy via Activity.Info.currentLocationAccuracy. Store the fix here
    // later if/when you need it directly.
    function onPosition(info as Position.Info) as Void {
        // TODO (optional for now)
    }

    // --- Run control (called by the input delegate) ---

    // Start recording if not already. Create the session once, sport = running.
    function startRun() as Void {
        if (!(Toybox has :ActivityRecording)) {
			return;
		}

		if (_session == null) {
			_session = ActivityRecording.createSession({ 
				:name => "Run", 
				:sport => Activity.SPORT_RUNNING 
			});
		}
		if (!_session.isRecording()) {
			_session.start();
		}
    }

    // Stop (pause) recording but keep the session so it can still be saved.
    function stopRun() as Void {
        if (_session != null && _session.isRecording()) {
			_session.stop();
		}
    }

    // Persist the recorded activity as a FIT (shows up in Garmin Connect / the
    // sim's FIT output) then clear the session.
    function saveRun() as Void {
        if (_session != null) {
			_session.save();
			_session = null;
			System.println("Run saved!");
		}
    }

	// Discard the recorded activity and clear the session.
	function discardRun() as Void {
		if (_session != null) {
			_session.discard();
			_session = null;
			System.println("Run discarded!");
		}
	}

	// True if a session exists (recording or paused). False if no run has been
	// started or the last one was saved/discarded.
	function hasSession() as Boolean {
		return _session != null;
	}

    // Used by the UI/input to know which controls to show.
    function isRecording() as Boolean {
        return _session != null && _session.isRecording();
    }

    function getInitialView() as [Views] or [Views, InputDelegates] {
        return [ new RunRouterView(), new RunRouterDelegate() ];
    }

}

function getApp() as RunRouterApp {
    return Application.getApp() as RunRouterApp;
}
