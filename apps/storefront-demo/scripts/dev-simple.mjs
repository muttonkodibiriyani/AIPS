import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));
const publicDir = join(root, "..", "public");
const port = Number(process.env.PORT || 5173);

createServer((req, res) => {
  const path = req.url === "/" ? "/index.html" : req.url;
  const file = join(publicDir, path.split("?")[0]);
  if (!existsSync(file)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const body = readFileSync(file);
  const type = file.endsWith(".js") ? "application/javascript" : "text/html";
  res.writeHead(200, { "Content-Type": type });
  res.end(body);
}).listen(port, () => console.log(`storefront-demo http://localhost:${port}`));
