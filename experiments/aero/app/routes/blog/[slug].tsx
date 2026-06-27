// Dynamic route: app/routes/blog/[slug].tsx -> /blog/:slug
// The matched segment arrives as params.slug.
export default function BlogPost({ params }: { params: Record<string, string> }) {
  return (
    <article>
      <p style={{ color: "#a3a3a3", fontSize: 13, textTransform: "uppercase", letterSpacing: 1 }}>
        Blog
      </p>
      <h1 style={{ fontSize: 28, letterSpacing: -0.5 }}>{params.slug.replace(/-/g, " ")}</h1>
      <p style={{ color: "#525252", lineHeight: 1.6 }}>
        This post was matched by the dynamic route <code>blog/[slug]</code>. The slug is{" "}
        <code>{params.slug}</code> — pulled from the URL and rendered on the server.
      </p>
    </article>
  );
}
