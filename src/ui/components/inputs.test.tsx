// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ClaimsPath } from '../../core/model';
import { PathInput, TemplateInput } from './inputs';

describe('PathInput', () => {
  it('commits valid paths and flags invalid text', () => {
    const onChange = vi.fn<(path: ClaimsPath) => void>();
    render(<PathInput id="p" value={['a']} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'pets[].name' } });
    expect(onChange).toHaveBeenLastCalledWith(['pets', null, 'name']);
    fireEvent.change(input, { target: { value: 'pets..name' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Not a valid path.')).toBeInTheDocument();
  });
});

describe('TemplateInput', () => {
  function Harness() {
    const [value, setValue] = useState('Hello ');
    return <TemplateInput id="t" value={value} onChange={setValue} paths={['firstname', 'pets.name']} />;
  }

  it('suggests attribute paths after {{ and inserts the chosen one', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.keyboard('{End}{{{{pe');
    expect(screen.getByRole('option', { name: 'pets.name' })).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(input).toHaveValue('Hello {{pets.name}}');
  });
});
