import type { Branding, LangTag, Project } from '../model.ts';

/**
 * The branding the wallets show for a language in light or dark mode. In dark mode without a dark variant
 * both wallets fall back to the light one; a dark variant is used as is, without filling gaps from light.
 */
export function selectBranding(
  project: Project,
  lang: LangTag,
  theme: 'light' | 'dark',
): { branding: Branding; lightShownForDark: boolean } {
  const pair = project.branding[lang];
  if (!pair) return { branding: {}, lightShownForDark: false };
  if (theme === 'dark' && pair.dark) return { branding: pair.dark, lightShownForDark: false };
  return { branding: pair.light, lightShownForDark: theme === 'dark' };
}
