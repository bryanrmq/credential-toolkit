import { describe, expect, it } from 'vitest';
import type { Issue } from '../core/validate';
import { groupIssues } from './issues';

const issue = (severity: Issue['severity'], code: string, summary: string, lang?: string): Issue => ({
  severity,
  code,
  message: lang ? `${summary} (${lang})` : summary,
  summary,
  target: lang ? { kind: 'credential', field: 'name', lang } : { kind: 'hosting' },
});

describe('groupIssues', () => {
  it('merges the same issue across languages and lists errors first', () => {
    const groups = groupIssues([
      issue('warning', 'name-missing', 'The credential name is missing.', 'de-CH'),
      issue('warning', 'hosting-url-missing', 'Enter the URL.'),
      issue('warning', 'name-missing', 'The credential name is missing.', 'fr-CH'),
      issue('error', 'color-format', 'Bad colour.', 'de-CH'),
    ]);
    expect(groups.map((group) => [group.severity, group.summary, group.langs])).toEqual([
      ['error', 'Bad colour.', ['de-CH']],
      ['warning', 'The credential name is missing.', ['de-CH', 'fr-CH']],
      ['warning', 'Enter the URL.', []],
    ]);
    expect(groups[1].issues).toHaveLength(2);
  });
});
