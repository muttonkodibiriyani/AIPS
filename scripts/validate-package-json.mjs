import fs from "node:fs";
import path from "node:path";

/** CI helper: fail if any package.json is invalid strict JSON. */
function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name === "node_modules" || ent.name === ".git" || ent.name === ".turbo" || ent.name === ".next") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name === "package.json") {
      try {
        JSON.parse(fs.readFileSync(p, "utf8"));
      } catch (e) {
        console.error("Invalid JSON:", p, String(e.message));
        process.exitCode = 1;
      }
    }
  }
}

walk(process.cwd());
