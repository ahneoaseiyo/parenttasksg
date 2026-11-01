export class TaskApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "TaskApiError";
    this.status = status;
  }
}

export function createTaskApi({ baseUrl = "", getAccessToken, fetchImpl = fetch } = {}) {
  if (typeof getAccessToken !== "function") throw new TypeError("Missing authentication provider");
  const root = baseUrl.replace(/\/$/, "");

  async function request(path, method = "GET", body, signal) {
    const token = await getAccessToken();
    if (typeof token !== "string" || !token.trim()) throw new TaskApiError("Authentication required", 401);
    let response;
    try {
      response = await fetchImpl(root + path, {
        method,
        signal,
        credentials: "omit",
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      throw new TaskApiError("Network unavailable");
    }
    if (!response.ok) {
      const errors = { 401: "Authentication required", 403: "Access denied", 404: "Task not found" };
      throw new TaskApiError(errors[response.status] || "Request failed", response.status);
    }
    try { return await response.json(); }
    catch { throw new TaskApiError("Invalid server response"); }
  }

  return {
    listTasks: ({ signal } = {}) => request("/api/tasks", "GET", undefined, signal),
    updateTaskStatus: (id, status, { signal } = {}) => {
      if (typeof id !== "string" || !id || /[/?#]/.test(id)) throw new TypeError("Invalid task ID");
      if (status !== "Done" && status !== "Not done") throw new TypeError("Invalid task status");
      return request("/api/tasks/" + encodeURIComponent(id), "PATCH", { status }, signal);
    },
  };
}
