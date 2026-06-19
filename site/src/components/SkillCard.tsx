import type { Skill } from '@/lib/types.ts';

type SkillCardProps = { skill: Skill; onSelect: () => void };

export function SkillCard({ skill, onSelect }: SkillCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex h-full flex-col rounded-xl border border-slate-800 bg-slate-900/40 p-5 text-left transition hover:border-brand/60 hover:bg-slate-900"
    >
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-mono text-sm font-semibold text-white">{skill.name}</h4>
        <span className="shrink-0 rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
          v{skill.version}
        </span>
      </div>
      <p className="mt-2 grow text-sm leading-relaxed text-slate-400">{skill.tagline}</p>
      <code className="mt-4 truncate text-xs text-brand">{skill.trigger.slashCommand}</code>
    </button>
  );
}
