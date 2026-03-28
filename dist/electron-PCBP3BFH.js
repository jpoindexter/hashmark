import {
  __commonJS,
  __require
} from "./chunk-MCKGQKYU.js";

// node_modules/electron/index.js
var require_electron = __commonJS({
  "node_modules/electron/index.js"(exports, module) {
    var fs = __require("fs");
    var path = __require("path");
    var pathFile = path.join(__dirname, "path.txt");
    function getElectronPath() {
      let executablePath;
      if (fs.existsSync(pathFile)) {
        executablePath = fs.readFileSync(pathFile, "utf-8");
      }
      if (process.env.ELECTRON_OVERRIDE_DIST_PATH) {
        return path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH, executablePath || "electron");
      }
      if (executablePath) {
        return path.join(__dirname, "dist", executablePath);
      } else {
        throw new Error("Electron failed to install correctly, please delete node_modules/electron and try installing again");
      }
    }
    module.exports = getElectronPath();
  }
});
export default require_electron();
