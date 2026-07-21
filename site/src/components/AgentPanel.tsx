import type { Agent } from '@/lib/types.ts';

type AgentPanelProps = { agents: readonly Agent[] };

export function AgentPanel({ agents }: AgentPanelProps) {
  const baseline = agents.filter((agent) => agent.kind === 'baseline');
  const conditional = agents.filter((agent) => agent.kind === 'conditional');

  return (
    <section id="agents" className="border-t border-slate-800/60 bg-slate-900/30">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <header className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight text-white">
            {agents.length} review agents
          </h2>
          <p className="mt-3 text-slate-400">
            Six always run. The rest fire only on what your diff touches — so a CSS-only PR never
            pays for a Web3 review.
          </p>
        </header>

        <AgentGroup
          title="Always run"
          subtitle={`${baseline.length} baseline reviewers`}
          agents={baseline}
        />
        <AgentGroup
          title="Fire on what your diff touches"
          subtitle={`${conditional.length} conditional reviewers`}
          agents={conditional}
        />
      </div>
    </section>
  );
}

type AgentGroupProps = { title: string; subtitle: string; agents: readonly Agent[] };

function AgentGroup({ title, subtitle, agents }: AgentGroupProps) {
  return (
    <div className="mt-12">
      <div className="flex flex-wrap items-baseline gap-3">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <span className="text-sm text-slate-500">{subtitle}</span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <article
            key={agent.id}
            className="rounded-lg border border-slate-800 bg-slate-950/40 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-mono text-sm font-semibold text-white">{agent.name}</h4>
              {agent.trigger ? (
                <code className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-brand">
                  {agent.trigger}
                </code>
              ) : null}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">{agent.focus}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
