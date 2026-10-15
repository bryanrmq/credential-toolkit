import { describe, expect, it } from 'vitest';
import { emptyProject } from '../model';
import { selectBranding } from './branding';

describe('selectBranding', () => {
  const light = { primaryBackgroundColor: '#FFFFFF' };
  const dark = { primaryBackgroundColor: '#000000' };

  it('shows the light branding on the light tab', () => {
    const project = emptyProject(['de-CH']);
    project.branding['de-CH'] = { light, dark };
    expect(selectBranding(project, 'de-CH', 'light')).toEqual({ branding: light, lightShownForDark: false });
  });

  it('shows the dark branding on the dark tab', () => {
    const project = emptyProject(['de-CH']);
    project.branding['de-CH'] = { light, dark };
    expect(selectBranding(project, 'de-CH', 'dark')).toEqual({ branding: dark, lightShownForDark: false });
  });

  it('shows the light branding in dark mode when there is no dark variant, as both wallets do', () => {
    const project = emptyProject(['de-CH']);
    project.branding['de-CH'] = { light };
    expect(selectBranding(project, 'de-CH', 'dark')).toEqual({ branding: light, lightShownForDark: true });
  });

  it('does not mix in light values when the dark variant leaves a field empty', () => {
    const project = emptyProject(['de-CH']);
    project.branding['de-CH'] = { light, dark: {} };
    expect(selectBranding(project, 'de-CH', 'dark')).toEqual({ branding: {}, lightShownForDark: false });
  });

  it('shows empty branding for a language without any', () => {
    const project = emptyProject(['de-CH']);
    expect(selectBranding(project, 'fr-CH', 'dark')).toEqual({ branding: {}, lightShownForDark: false });
  });
});
