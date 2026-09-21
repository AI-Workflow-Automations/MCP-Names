import { composeNamesService } from "./composition.js";
import { loadConfig } from "./config.js";

/** Gemeinsamer Start für stdio und HTTP. */
export const config = loadConfig();
export const composeService = () => composeNamesService(config);
