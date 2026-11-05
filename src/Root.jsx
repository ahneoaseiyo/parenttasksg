import { Suspense, lazy, useEffect, useState } from "react";
import AssistantApp from "./assistant/AssistantApp.jsx";
import { resolveRoute } from "./route.js";

// The earlier school-parent prototype is loaded only when asked for, so the default page stays small.
const SchoolDemo = lazy(() => import("./App.jsx"));

export default function Root() {
  const [route, setRoute] = useState(() => resolveRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(resolveRoute(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  if (route === "school-demo") {
    return (
      <>
        <p className="mt-legacy-bar"><a href="#/">← Back to Message to Task</a> · School parent demo (earlier prototype, synthetic data)</p>
        <Suspense fallback={<p role="status" className="mt-legacy-bar">Loading…</p>}><SchoolDemo /></Suspense>
      </>
    );
  }
  return <AssistantApp />;
}
