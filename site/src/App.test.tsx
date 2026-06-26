import { fireEvent, render, screen } from '@testing-library/react';
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

  it('gives every review agent a non-empty focus description', () => {
    for (const agent of manifest.agents) {
      expect(agent.focus.length).toBeGreaterThan(0);
    }
  });

  it('opens a skill modal and locks background scroll', () => {
    render(<App />);
    const [first] = manifest.skills;
    if (!first) throw new Error('expected at least one skill');
    const [card] = screen.getAllByText(first.name);
    if (!card) throw new Error('expected a skill card for the first skill');

    fireEvent.click(card);

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(document.body.style.overflow).toBe('hidden');
  });
});
