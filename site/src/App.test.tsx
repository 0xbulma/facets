import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '@/App.tsx';
import { manifest } from '@/data/manifest.ts';

describe('App', () => {
  it('shows the install command', () => {
    render(<App />);
    expect(screen.getAllByText(/plugin marketplace add/).length).toBeGreaterThan(0);
  });

  it('renders every skill by name', () => {
    render(<App />);
    for (const skill of manifest.skills) {
      expect(screen.getAllByText(skill.name).length).toBeGreaterThan(0);
    }
  });

  it('splits the review agents into 6 baseline and 11 conditional', () => {
    render(<App />);
    expect(manifest.agents.filter((a) => a.kind === 'baseline')).toHaveLength(6);
    expect(manifest.agents.filter((a) => a.kind === 'conditional')).toHaveLength(11);
  });
});
