import { createZToolkit } from "./utils/ztoolkit";
import { registerDevBridge, unregisterDevBridge } from "./modules/devBridge";
import { KeyController } from "./modules/keyController";
import { clearPref } from "./utils/prefs";

/** One controller per main window. */
const controllers = new Map<Window, KeyController>();

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: addon.data.config.addonName,
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
  });

  // Dev-only (no-op in production builds); user approved 2026-11-23.
  registerDevBridge();

  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();
  controllers.get(win)?.detach();
  const controller = new KeyController(win);
  controller.attach();
  controllers.set(win, controller);
  ztoolkit.log("zotQL loaded");
}

async function onMainWindowUnload(win: Window): Promise<void> {
  controllers.get(win)?.detach();
  controllers.delete(win);
}

function onShutdown(): void {
  for (const controller of controllers.values()) controller.detach();
  controllers.clear();
  unregisterDevBridge();
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

/** Events from the settings pane (addon/content/preferences.xhtml). */
function onPrefsEvent(type: string, data?: { window: Window }): void {
  if (type === "load" && data) {
    // Grey out the fixed-column checkboxes unless "these columns" is chosen.
    const doc = data.window.document;
    const group = doc.getElementById("zotql-columns") as any;
    const sync = () => {
      const fixed = group?.value === "fixed";
      for (const box of doc.querySelectorAll<any>(".zotql-col")) {
        box.disabled = !fixed;
      }
    };
    group?.addEventListener("command", () => data.window.setTimeout(sync));
    group?.addEventListener("syncfrompreference", sync);
    sync();
  } else if (type === "resetCardSize") {
    clearPref("cardWidth");
    clearPref("cardHeight");
  }
}

/** For debugging (dev bridge): the controller of a main window. */
function getController(win: Window): KeyController | undefined {
  return controllers.get(win);
}

export default {
  onStartup,
  getController,
  onPrefsEvent,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
};
