import { ArrowRight, Github } from 'lucide-react';
import { InstallBlock } from '@/components/InstallBlock.tsx';
import type { Plugin } from '@/lib/types.ts';

type HeroProps = { plugin: Plugin; skillCount: number; agentCount: number };

export function Hero({ plugin, skillCount, agentCount }: HeroProps) {
  return (
    <section
      id="top"
      className="relative overflow-hidden border-b border-slate-800/60 bg-gradient-to-b from-slate-900 to-slate-950"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand to-transparent"
      />
      <div className="mx-auto max-w-4xl px-6 py-24 text-center sm:py-32">
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1 text-xs font-medium text-slate-300">
          Claude Code plugin · v{plugin.version} · {plugin.license}
        </span>
        <h1 className="mt-6 text-balance text-4xl font-bold tracking-tight text-white sm:text-6xl">
          Self-review every <span className="text-brand">facet</span> of your PR — locally.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-slate-300">
          No cloud bill, no waiting on CI. A {agentCount}-agent review panel runs on your machine,
          posts inline GitHub comments, and applies the safe fixes.
        </p>
        <InstallBlock
          command={plugin.installCommand}
          className="mx-auto mt-10 max-w-xl text-left"
        />
        <div className="mt-6 flex items-center justify-center gap-5 text-sm">
          <a
            href="#skills"
            className="inline-flex items-center gap-1 font-medium text-brand transition hover:text-white"
          >
            Browse the {skillCount} skills <ArrowRight size={16} />
          </a>
          <a
            href={plugin.homepage}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-slate-400 transition hover:text-white"
          >
            <Github size={16} /> Source
          </a>
        </div>
      </div>
    </section>
  );
}
