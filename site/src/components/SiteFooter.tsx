import type { Plugin } from '@/lib/types.ts';

type SiteFooterProps = { plugin: Plugin; generatedAt: string };

export function SiteFooter({ plugin, generatedAt }: SiteFooterProps) {
  const generated = generatedAt.slice(0, 10);
  return (
    <footer className="border-t border-slate-800/60 bg-slate-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold text-slate-300">{plugin.name}</span>
          <span>v{plugin.version}</span>
          <span aria-hidden="true">·</span>
          <span>{plugin.license}</span>
          <span aria-hidden="true">·</span>
          <span>by {plugin.author}</span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href={plugin.homepage}
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-slate-200"
          >
            GitHub
          </a>
          <span className="text-slate-600">generated {generated}</span>
        </div>
      </div>
    </footer>
  );
}
