import Toybox.Lang;
import Toybox.WatchUi;

class RunRouterDelegate extends WatchUi.BehaviorDelegate {

    function initialize() {
        BehaviorDelegate.initialize();
    }

    function onMenu() as Boolean {
        WatchUi.pushView(new Rez.Menus.MainMenu(), new RunRouterMenuDelegate(), WatchUi.SLIDE_UP);
        return true;
    }

}
