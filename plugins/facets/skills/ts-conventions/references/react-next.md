### React / Next.js

- **Server Components by default; `'use client'` only at the leaves** that genuinely need interactivity or browser APIs. Push client boundaries as far down the tree as possible to keep bundles small.
- **Fetch data in Server Components**; perform mutations through Server Actions or route handlers. Don't fetch in `useEffect` for data you can load on the server.
- Validate every request/response and Server Action input with zod at the boundary — never trust client-supplied data.
- Colocate a component with its test and styles (`button.tsx`, `button.test.tsx`, `button.module.css`); one component per file, named to match the file.
- Lists need stable `key`s (not array index). Memoize only with a measured reason. Prefer derived state over duplicated state; lift state no higher than necessary.
- Keep `useEffect` for true synchronization with external systems, not for deriving values.
- **Go deeper (optional, if installed):** the `vercel-react-best-practices`, `next-best-practices`, and `vercel-composition-patterns` skills for React/Next patterns; `web-design-guidelines` and `tailwind-design-system` for UI & styling. Treat these as optional rubric — ignore any that aren't present.
