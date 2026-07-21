import { describe, expect, it } from 'vitest';
import {
  deriveLead,
  deriveNotes,
  extractSections,
  extractTrigger,
  firstSentence,
  parseFrontmatter,
} from './derive.ts';

const PR_REVIEW_LOCAL =
  'Pre-PR local code review. Reviews local branch changes using parallel specialized agents and outputs findings in the terminal. Optionally applies fixes with --fix, or loops review until no critical/high/medium findings remain. Use when user says /facets:pr-review-local, "review my changes", "review before PR", or "review and fix until clean".';

const INJECT_WALLET =
  'Connect a test wallet so an agent can screenshot the authenticated dApp UI. Use when user says /facets:inject-wallet, "screenshot my dApp", or "connect a wallet to test". Optional Anvil fork; mock-connector fallback for SIWE-heavy apps.';

describe('parseFrontmatter', () => {
  it('reads top-level single-line scalars and returns the body', () => {
    const raw = '---\nname: web3\nversion: 1.1.0\nkind: conditional\n---\n\n# Web3\n\nBody text.';
    const { data, body } = parseFrontmatter(raw);
    expect(data.name).toBe('web3');
    expect(data.version).toBe('1.1.0');
    expect(data.kind).toBe('conditional');
    expect(body.trim()).toBe('# Web3\n\nBody text.'.trim());
  });

  it('captures block scalars (folded) and skips list fields', () => {
    const raw = [
      '---',
      'name: web3',
      'trigger: HAS_WEB3',
      'applies: |',
      '  first line of the block',
      '  second line of the block',
      'out-of-scope:',
      '  - some excluded thing',
      'focus: Contract interactions and chain-id validation.',
      '---',
      'body',
    ].join('\n');
    const { data } = parseFrontmatter(raw);
    expect(data.trigger).toBe('HAS_WEB3');
    expect(data.focus).toBe('Contract interactions and chain-id validation.');
    expect(data.applies).toBe('first line of the block second line of the block');
    expect(data['out-of-scope']).toBeUndefined();
  });

  it('folds a `focus: |` block scalar into a single line', () => {
    const raw =
      '---\nfocus: |\n  Memory leaks, N+1 patterns,\n  and expensive hot paths.\n---\nbody';
    expect(parseFrontmatter(raw).data.focus).toBe(
      'Memory leaks, N+1 patterns, and expensive hot paths.',
    );
  });

  it('returns empty data when there is no frontmatter', () => {
    expect(parseFrontmatter('# just a doc').data).toEqual({});
  });

  it('strips surrounding quotes from values', () => {
    expect(parseFrontmatter('---\nname: "quoted"\n---\n').data.name).toBe('quoted');
  });
});

describe('deriveLead', () => {
  it('takes everything before the trigger clause', () => {
    expect(deriveLead(PR_REVIEW_LOCAL)).toMatch(/findings remain\.$/);
    expect(deriveLead(PR_REVIEW_LOCAL)).not.toMatch(/Use when/);
  });

  it('returns the whole description when no trigger clause exists', () => {
    expect(deriveLead('A standalone sentence.')).toBe('A standalone sentence.');
  });
});

describe('firstSentence', () => {
  it('extracts the leading sentence', () => {
    expect(firstSentence(deriveLead(PR_REVIEW_LOCAL))).toBe('Pre-PR local code review.');
  });
});

describe('extractTrigger', () => {
  it('pulls the slash command and every quoted phrase', () => {
    const { slashCommand, phrases } = extractTrigger('pr-review-local', PR_REVIEW_LOCAL);
    expect(slashCommand).toBe('/facets:pr-review-local');
    expect(phrases).toEqual([
      'review my changes',
      'review before PR',
      'review and fix until clean',
    ]);
  });

  it('normalizes curly quotes', () => {
    const desc = 'Do a thing. Use when user says “log an idea”.';
    expect(extractTrigger('feedback', desc).phrases).toEqual(['log an idea']);
  });

  it('derives the slash command from the skill id, ignoring sibling mentions in the lead', () => {
    const desc =
      'Capture an idea; /facets:implement-feedback can action it. Use when user says /facets:feedback, "log it".';
    const { slashCommand, phrases } = extractTrigger('feedback', desc);
    expect(slashCommand).toBe('/facets:feedback');
    expect(phrases).toEqual(['log it']);
  });
});

describe('deriveNotes', () => {
  it('captures trailing notes after the last phrase', () => {
    expect(deriveNotes(INJECT_WALLET)).toBe(
      'Optional Anvil fork; mock-connector fallback for SIWE-heavy apps.',
    );
  });

  it('returns null when only punctuation trails the phrases', () => {
    expect(deriveNotes(PR_REVIEW_LOCAL)).toBeNull();
  });

  it('returns null when there are no quoted phrases', () => {
    expect(deriveNotes('A plain description.')).toBeNull();
  });
});

describe('extractSections', () => {
  it('collects H2 headings only and ignores fenced content', () => {
    const body = '# Title\n\n## Usage\n\n```\n## not a heading\n```\n\n## Steps\n\n### sub';
    expect(extractSections(body)).toEqual(['Usage', 'Steps']);
  });
});
