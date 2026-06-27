import type { ReactNode } from "react";
import { Link } from "../framework/runtime.tsx";

// The app shell. Wraps every route. Rendered identically on server + client.
export default function Root({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        maxWidth: 720,
        margin: "0 auto",
        padding: "2rem 1.25rem",
        color: "#0a0a0a",
      }}
    >
      <header style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: "2rem" }}>
        <strong style={{ fontSize: 18, letterSpacing: -0.5 }}>▲ aero</strong>
        <nav style={{ display: "flex", gap: 16, fontSize: 14 }}>
          <Link href="/" style={{ color: "#0a0a0a" }}>
            Home
          </Link>
          <Link href="/about" style={{ color: "#0a0a0a" }}>
            About
          </Link>
          <Link href="/blog/hello-world" style={{ color: "#0a0a0a" }}>
            Blog
          </Link>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
