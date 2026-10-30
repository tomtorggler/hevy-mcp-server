import pkg from "../package.json";

/** Single source of truth for the server version (read from package.json). */
export const VERSION: string = pkg.version;
