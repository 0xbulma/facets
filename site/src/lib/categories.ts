import type { CategoryId } from '@/lib/types.ts';

export const CATEGORY_ORDER: readonly CategoryId[] = [
  'pr-flow',
  'authoring',
  'dapp',
  'conventions',
  'feedback',
];

export const CATEGORY_LABEL: Readonly<Record<CategoryId, string>> = {
  'pr-flow': 'PR flow',
  authoring: 'Authoring & docs',
  dapp: 'dApp testing',
  conventions: 'Conventions',
  feedback: 'Self-improvement',
};

export const CATEGORY_BLURB: Readonly<Record<CategoryId, string>> = {
  'pr-flow': 'Switch, review, fix, and open PRs — the core loop.',
  authoring: 'Scaffold and ship the TIB → TIP → PR paper trail.',
  dapp: 'Screenshot wallet-gated dApps under review.',
  conventions: 'Seed coding conventions and install the review rubric.',
  feedback: 'Capture and implement improvements to facets itself.',
};
