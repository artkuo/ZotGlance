import { BasicTool, UITool, unregister } from "zotero-plugin-toolkit";
import { config } from "../../package.json";

export { createZToolkit };

/** Only the toolkit parts ZotGlance uses: logging and cleanup on unload. */
class ZToolkit extends BasicTool {
  UI: UITool;

  constructor() {
    super();
    this.UI = new UITool(this);
  }

  unregisterAll() {
    unregister(this);
  }
}

function createZToolkit() {
  const ztoolkit = new ZToolkit();
  ztoolkit.basicOptions.log.prefix = `[${config.addonName}]`;
  ztoolkit.basicOptions.log.disableConsole = __env__ === "production";
  ztoolkit.basicOptions.api.pluginID = config.addonID;
  ztoolkit.UI.basicOptions.ui.enableElementJSONLog = __env__ === "development";
  ztoolkit.UI.basicOptions.ui.enableElementDOMLog = __env__ === "development";
  return ztoolkit;
}
