export const LOCAL_SERVICE_HOST = "127.0.0.1";
export const LOCAL_SERVICE_PORT = 17892;

export function localServiceBaseUrl() {
  return `http://${LOCAL_SERVICE_HOST}:${LOCAL_SERVICE_PORT}`;
}
