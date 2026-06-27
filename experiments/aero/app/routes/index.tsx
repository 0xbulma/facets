import { useState } from "react";

export default function Index() {
  // A client counter: if SSR markup hydrates correctly, this button works
  // without a full reload — the proof that hydration is wired up.
  const [count, setCount] = useState(0);
  return (
    <section>
      <h1 style={{ fontSize: 32, letterSpacing: -1 }}>Server-rendered, instantly interactive.</h1>
      <p style={{ color: "#525252", lineHeight: 1.6 }}>
        This page was streamed from a Hono server using React 19 SSR, then hydrated in the
        browser. Dev is powered by Vite in middleware mode — instant startup, fast HMR.
      </p>
      <button
        type="button"
        onClick={() => setCount((c) => c + 1)}
        style={{
          marginTop: 16,
          padding: "8px 16px",
          borderRadius: 8,
          border: "1px solid #e5e5e5",
          background: "#fafafa",
          cursor: "pointer",
          fontSize: 14,
        }}
      >
        Clicked {count} {count === 1 ? "time" : "times"}
      </button>
    </section>
  );
}
