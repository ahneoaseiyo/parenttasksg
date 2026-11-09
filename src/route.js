// Hash routing keeps the app a static site. The assistant is the default screen; the earlier
// school-parent prototype stays reachable at #/school-demo.
export function resolveRoute(hash = "") {
  const name = String(hash).replace(/^#\/?/, "").split(/[?#]/)[0].toLowerCase();
  return name === "school-demo" ? "school-demo" : "assistant";
}

// The four sections of the assistant. Each has its own hash so the browser's back button works.
export const VIEWS = [
  { id: "extract", hash: "#/", label: "Extract & Review" },
  { id: "tasks", hash: "#/tasks", label: "My Tasks" },
  { id: "history", hash: "#/history", label: "Local History" },
  { id: "settings", hash: "#/settings", label: "Settings" },
];

export function resolveView(hash = "") {
  const name = String(hash).replace(/^#\/?/, "").split(/[?#]/)[0].toLowerCase();
  return VIEWS.find((v) => v.id === name && v.id !== "extract")?.id ?? "extract";
}

export function hashForView(id) {
  return (VIEWS.find((v) => v.id === id) ?? VIEWS[0]).hash;
}
