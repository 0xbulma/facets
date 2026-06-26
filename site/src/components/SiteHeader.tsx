import { Github } from 'lucide-react';
import type { Plugin } from '@/lib/types.ts';

type SiteHeaderProps = { plugin: Plugin };

export function SiteHeader({ plugin }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="#top" className="flex items-center gap-2 font-semibold tracking-tight text-white">
          <span className="inline-block size-3 rounded-sm bg-brand" aria-hidden="true" />
          {plugin.name}
        </a>
        <nav className="flex items-center gap-6 text-sm text-slate-300">
          <a className="hidden transition hover:text-white sm:inline" href="#skills">
            Skills
          </a>
          <a className="hidden transition hover:text-white sm:inline" href="#agents">
            Review agents
          </a>
          <a
            className="inline-flex items-center gap-1.5 transition hover:text-white"
            href={plugin.homepage}
            target="_blank"
            rel="noreferrer"
          >
            <Github size={16} /> GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
