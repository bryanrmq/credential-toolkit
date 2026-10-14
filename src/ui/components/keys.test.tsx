// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { withKeys } from './keys';

describe('withKeys', () => {
  it('renders [[…]] markers as keyboard keys', () => {
    const { container } = render(<p>{withKeys('Press [[Enter]] to apply. Type [[{{]] to insert.')}</p>);
    expect([...container.querySelectorAll('kbd')].map((kbd) => kbd.textContent)).toEqual(['Enter', '{{']);
    expect(container.textContent).toBe('Press Enter to apply. Type {{ to insert.');
  });

  it('leaves plain text alone', () => {
    expect(withKeys('No keys here.')).toBe('No keys here.');
  });
});
