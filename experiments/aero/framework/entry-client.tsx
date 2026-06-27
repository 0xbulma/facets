import { hydrateRoot } from "react-dom/client";
import { App } from "./runtime.tsx";

// Client entry. Hydrates the server-rendered markup inside #root. The route is
// derived from the live URL so it matches what the server rendered.
const root = document.getElementById("root");
if (root) {
  hydrateRoot(root, <App url={window.location.pathname} />);
}
