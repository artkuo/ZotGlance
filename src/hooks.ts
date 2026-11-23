import { createZToolkit } from "./utils/ztoolkit";
import { registerDevBridge, unregisterDevBridge } from "./modules/devBridge";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  // Dev-only (no-op in production builds); user approved 2026-11-23.
  registerDevBridge();

  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();
  // M2: keyController
  ztoolkit.log("zotQL loaded");
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  // M2: keyController
}

function onShutdown(): void {
  unregisterDevBridge();
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
};
