export default function About() {
  return (
    <section>
      <h1 style={{ fontSize: 28, letterSpacing: -0.5 }}>About Aero</h1>
      <p style={{ color: "#525252", lineHeight: 1.6 }}>
        Aero is a thin, opinionated framework that composes three best-in-class pieces:
      </p>
      <ul style={{ color: "#525252", lineHeight: 1.8 }}>
        <li>
          <strong>Vite</strong> — dev server (middleware mode) and production bundler.
        </li>
        <li>
          <strong>Hono</strong> — the HTTP layer, on Node or Bun, no rewrite.
        </li>
        <li>
          <strong>React 19</strong> — streaming SSR and client hydration.
        </li>
      </ul>
      <p style={{ color: "#525252", lineHeight: 1.6 }}>
        Routing is file-based: drop a component in <code>app/routes/</code> and it is a page.
      </p>
    </section>
  );
}
