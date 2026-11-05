// Hash routing keeps the app a static site. The new assistant is the default screen; the earlier
// school-parent prototype stays reachable at #/school-demo.
export function resolveRoute(hash = "") {
  const name = String(hash).replace(/^#\/?/, "").split(/[?#]/)[0].toLowerCase();
  return name === "school-demo" ? "school-demo" : "assistant";
}
