import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

// Step 5 (yours): map the buttons to the run controls.
//
// BehaviorDelegate hands you semantic callbacks instead of raw key codes:
//   onSelect() - the action/start button (and a screen tap on the 4S)
//   onBack()   - the back button
//
// Return true to CONSUME the event; return false to let the system handle it.
// For onBack(), "the system handles it" means EXIT THE APP — which is exactly
// what must not happen with an unsaved run in progress.
class RunRouterDelegate extends WatchUi.BehaviorDelegate {

    function initialize() {
        BehaviorDelegate.initialize();
    }

	function onKey(keyEvent as WatchUi.KeyEvent) as Boolean {
		System.println("Key event: " + keyEvent.getKey());
		if (keyEvent.getKey() == WatchUi.KEY_ENTER) {
			return onSelect();
		} else if (keyEvent.getKey() == WatchUi.KEY_ESC) {
			return onBack();
		}
		return false;
	}

    // Toggle: start/resume when not recording, stop (pause) when recording.
    // Call WatchUi.requestUpdate() after, so the REC indicator flips at once
    // rather than waiting for the next 1-second tick.
    function onSelect() as Boolean {
		System.println("onSelect() called");
		var app = getApp() as RunRouterApp;
		if (app.isRecording()) {
			app.stopRun();
		} else {
			app.startRun();
		}
        
		WatchUi.requestUpdate();
        return true;
    }

    // Guard the run.
    //   - If there's an unsaved session: put up a confirmation and consume the
    //     event so we DON'T exit.
    //         WatchUi.pushView(new WatchUi.Confirmation("Save run?"),
    //                          new SaveConfirmationDelegate(),
    //                          WatchUi.SLIDE_UP);
    //         return true;
    //   - If there's no session at all: return false and let the app exit.
    function onBack() as Boolean {
		System.println("onBack() called");
        var app = getApp() as RunRouterApp;
		if (app.isRecording()) {
			// This will be the "Lap" button on a real watch, but we don't implement laps yet.
			// Instead, just stop the run (pause) and let the user decide whether to save or discard.
			app.stopRun();
			WatchUi.requestUpdate();
			return true;
		}

        if (!app.hasSession()) {
			return false; // no session, let the system exit
		}

		WatchUi.pushView(new WatchUi.Confirmation("Save run?"),
						 new SaveConfirmationDelegate(),
						 WatchUi.SLIDE_UP);
        return true;
    }

}

// The yes/no answer to "Save run?".
class SaveConfirmationDelegate extends WatchUi.ConfirmationDelegate {

    function initialize() {
        ConfirmationDelegate.initialize();
    }

    // response is WatchUi.CONFIRM_YES or WatchUi.CONFIRM_NO.
    //   YES -> getApp().saveRun(), then System.exit()
    //   NO  -> getApp().discardRun(), then System.exit()
    function onResponse(response as WatchUi.Confirm) as Boolean {
        var app = getApp() as RunRouterApp;
		if (response == WatchUi.CONFIRM_YES) {
			app.saveRun();
		} else {
			app.discardRun();
		}
		return System.exit();
    }
}
