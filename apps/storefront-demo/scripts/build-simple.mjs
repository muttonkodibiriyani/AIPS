import { mkdirSync, copyFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));
const appRoot = join(root, "..");
const out = join(appRoot, "dist");
if (!existsSync(out)) mkdirSync(out, { recursive: true });
copyFileSync(join(appRoot, "public", "index.html"), join(out, "index.html"));
copyFileSync(join(appRoot, "public", "config.js"), join(out, "config.js"));
console.log("Built storefront-demo to dist/");
