import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { renderOutputIndex } from "./index-page.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 17892;

/**
 * Render the navigation page and serve the output directory over localhost.
 */
export async function startRenderServer({ rootPath = "output", port = DEFAULT_PORT } = {}) {
  const root = path.resolve(rootPath);
  await renderOutputIndex(root);

  const server = http.createServer((request, response) => {
    serveRequest({ request, response, root }).catch((error) => {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error.message);
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, DEFAULT_HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  return {
    root,
    server,
    url: `http://${DEFAULT_HOST}:${address.port}/`
  };
}

export function stopRenderServer(handle) {
  return new Promise((resolve, reject) => {
    handle.server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function serveRequest({ request, response, root }) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    response.end("Method Not Allowed");
    return;
  }

  const url = new URL(request.url || "/", `http://${request.headers.host || DEFAULT_HOST}`);
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === "/" ? INDEX_FILE : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(root, relativePath);

  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not Found");
      return;
    }
    throw error;
  }

  if (!stat.isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not Found");
    return;
  }

  response.writeHead(200, {
    "content-type": contentType(filePath),
    "content-length": stat.size
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  response.end(await fs.readFile(filePath));
}

function contentType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".md":
      return "text/markdown; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".mp4":
      return "video/mp4";
    default:
      return "application/octet-stream";
  }
}

const INDEX_FILE = "index.html";
