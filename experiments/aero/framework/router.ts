/// <reference types="vite/client" />
import type { ComponentType } from "react";

// A route module is any file under app/routes that default-exports a component.
export interface RouteModule {
  default: ComponentType<{ params: Record<string, string> }>;
}

// File-based route table, built at module-eval time from the routes glob.
// `import.meta.glob` is a Vite primitive — it must appear literally here so
// Vite can statically rewrite it for both the SSR and client graphs.
const modules = import.meta.glob<RouteModule>("/app/routes/**/*.{tsx,jsx}", {
  eager: true,
});

interface Segment {
  name: string;
  param: boolean;
}

interface CompiledRoute {
  pattern: string;
  segments: Segment[];
  mod: RouteModule;
  score: number;
}

// /app/routes/blog/[slug].tsx  ->  /blog/:slug
// /app/routes/index.tsx        ->  /
function fileToPattern(file: string): string {
  let p = file.replace(/^\/app\/routes/, "").replace(/\.(t|j)sx?$/, "");
  p = p.replace(/\/index$/, "");
  return p === "" ? "/" : p;
}

const routes: CompiledRoute[] = Object.entries(modules)
  .map(([file, mod]) => {
    const pattern = fileToPattern(file);
    const segments = pattern
      .split("/")
      .filter(Boolean)
      .map<Segment>((s) => {
        const m = s.match(/^\[(.+)\]$/);
        return m ? { name: m[1], param: true } : { name: s, param: false };
      });
    // Static segments outrank dynamic ones so /blog/new beats /blog/[slug].
    const score = segments.reduce((acc, s) => acc + (s.param ? 1 : 2), 0);
    return { pattern, segments, mod, score };
  })
  .sort((a, b) => b.score - a.score);

export interface RouteMatch {
  mod: RouteModule;
  params: Record<string, string>;
}

export function matchRoute(pathname: string): RouteMatch | null {
  const parts = pathname.split("/").filter(Boolean);
  for (const route of routes) {
    if (route.segments.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      const seg = route.segments[i];
      if (seg.param) params[seg.name] = decodeURIComponent(parts[i]);
      else if (seg.name !== parts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { mod: route.mod, params };
  }
  return null;
}

export function routeList(): string[] {
  return routes.map((r) => r.pattern);
}
