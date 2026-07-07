import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { EditApiError, handleEditApiRequest } from "./edit-api.mjs";
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
  const url = new URL(request.url || "/", `http://${request.headers.host || DEFAULT_HOST}`);
  if (url.pathname.startsWith("/api/")) {
    await serveApiRequest({ request, response, root, url });
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    response.end("Method Not Allowed");
    return;
  }

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

async function serveApiRequest({ request, response, root, url }) {
  try {
    const segments = apiSegments(url.pathname);
    const body = request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await readJsonBody(request);
    const result = await handleEditApiRequest({
      root,
      method: request.method,
      segments,
      body
    });

    if (result.mutated) {
      await renderOutputIndex(root);
    }

    writeJson(response, result.status, result.body);
  } catch (error) {
    if (error instanceof EditApiError) {
      writeJson(response, error.status, { error: error.message });
      return;
    }
    throw error;
  }
}

function apiSegments(pathname) {
  return pathname
    .replace(/^\/api\/?/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) {
      throw new EditApiError(413, "Request body is too large.");
    }
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new EditApiError(400, "Request body must be valid JSON.");
  }
}

function writeJson(response, status, body) {
  const json = `${JSON.stringify(body)}\n`;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(json)
  });
  response.end(json);
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
