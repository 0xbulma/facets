import {
  createContext,
  useContext,
  useEffect,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";
import { matchRoute } from "./router.ts";
import Root from "../app/root.tsx";

interface RouterContextValue {
  path: string;
  params: Record<string, string>;
  navigate: (to: string) => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);

export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error("useRouter must be used inside the Aero <App>");
  return ctx;
}

export function useParams(): Record<string, string> {
  return useRouter().params;
}

// Client-side navigation link. Falls back to a normal anchor for modified
// clicks (new tab, etc.) so it behaves like the platform.
export function Link({
  href,
  children,
  ...rest
}: { href: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { navigate } = useRouter();
  return (
    <a
      href={href}
      onClick={(e) => {
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        )
          return;
        e.preventDefault();
        navigate(href);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

function NotFound() {
  return (
    <div>
      <h1>404</h1>
      <p>This page could not be found.</p>
    </div>
  );
}

// The root React tree, shared verbatim by SSR and client hydration. `url` is
// the request path on the server and the live location on the client; both
// resolve to the same route for the initial render, so hydration matches.
export function App({ url }: { url: string }) {
  const [path, setPath] = useState(() => url.split("?")[0]);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = (to: string) => {
    window.history.pushState(null, "", to);
    setPath(to.split("?")[0]);
    window.scrollTo(0, 0);
  };

  const match = matchRoute(path);
  const Page = match?.mod.default ?? NotFound;
  const params = match?.params ?? {};

  return (
    <RouterContext.Provider value={{ path, params, navigate }}>
      <Root>
        <Page params={params} />
      </Root>
    </RouterContext.Provider>
  );
}
