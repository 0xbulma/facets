import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils.ts';

type InstallBlockProps = { command: string; className?: string };

export function InstallBlock({ command, className }: InstallBlockProps) {
  const [copied, setCopied] = useState(false);
  const lines = command.split('\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className={cn(
        'group relative rounded-xl border border-slate-700/60 bg-slate-900/80 p-4 font-mono text-sm',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => void copy()}
        aria-label="Copy install commands"
        className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 transition hover:border-brand hover:text-white"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <div className="space-y-1 pr-20">
        {lines.map((line) => (
          <div key={line} className="whitespace-pre-wrap break-all text-slate-200">
            <span className="select-none text-brand">$ </span>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
