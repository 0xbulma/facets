import { X } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import type { Skill } from '@/lib/types.ts';

type SkillDetailProps = { skill: Skill | null; onClose: () => void };

export function SkillDetail({ skill, onClose }: SkillDetailProps) {
  useEffect(() => {
    if (!skill) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [skill, onClose]);

  if (!skill) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 size-full cursor-default bg-slate-950/80 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${skill.name} details`}
        className="relative z-10 max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-mono text-lg font-semibold text-white">{skill.name}</h3>
            <span className="text-xs text-slate-500">v{skill.version}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md border border-slate-700 p-1.5 text-slate-400 transition hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-slate-300">{skill.lead}</p>
        {skill.notes ? (
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{skill.notes}</p>
        ) : null}

        <Section title="Invocation">
          <code className="block text-sm text-brand">{skill.trigger.slashCommand}</code>
          {skill.trigger.phrases.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {skill.trigger.phrases.map((phrase) => (
                <span
                  key={phrase}
                  className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300"
                >
                  “{phrase}”
                </span>
              ))}
            </div>
          ) : null}
        </Section>

        {skill.sections.length > 0 ? (
          <Section title="What's inside">
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-400">
              {skill.sections.map((section) => (
                <li key={section} className="truncate">
                  {section}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-5 border-t border-slate-800 pt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      <div className="mt-2">{children}</div>
    </div>
  );
}
