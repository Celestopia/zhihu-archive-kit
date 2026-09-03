import { localServiceBaseUrl } from "../shared/local-service.js";

/**
 * Browser client for the local archive service.
 */
export async function listCollections() {
  const result = await requestJson("/api/collections");
  return result.collections;
}

export async function createCollection(name, description) {
  const result = await requestJson("/api/collections", {
    method: "POST",
    body: { name, description }
  });
  return result.collection;
}

export async function findSavedCollectionsForFolder(folderName) {
  const result = await requestJson(`/api/saved/${encodeURIComponent(folderName)}`);
  return result.collections;
}

export async function saveZipToCollection(zipBlob, collectionName) {
  let response;
  try {
    response = await fetch(`${localServiceBaseUrl()}/api/collections/${encodeURIComponent(collectionName)}/items`, {
      method: "POST",
      headers: { "content-type": "application/zip" },
      body: zipBlob
    });
  } catch {
    throw serviceUnavailableError();
  }
  return readResponse(response);
}

async function requestJson(path, options = {}) {
  let response;
  try {
    response = await fetch(`${localServiceBaseUrl()}${path}`, {
      method: options.method || "GET",
      headers: options.body ? { "content-type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch {
    throw serviceUnavailableError();
  }
  return readResponse(response);
}

function serviceUnavailableError() {
  return new Error("本地归档服务未运行，请先启动 Zhihu Archive Kit 本地浏览服务。");
}

async function readResponse(response) {
  const text = await response.text();
  const result = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(result.error || "本地归档服务请求失败。");
  }
  return result;
}
