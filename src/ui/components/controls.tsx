import { WarningCircleIcon, WarningIcon } from '@phosphor-icons/react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useFieldIssues } from '../issues';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'normal' | 'small' | 'icon';
};

export function Button({ variant = 'secondary', size = 'normal', className = '', type = 'button', ...rest }: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, size !== 'normal' ? `btn--${size}` : '', className].filter(Boolean).join(' ');
  return <button type={type} className={classes} {...rest} />;
}

export function Badge({ tone, children }: { tone: 'red' | 'yellow' | 'blue' | 'green' | 'gray'; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

interface FieldProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}

/** Label, input, hint and the validation issues that point at this input. */
export function Field({ id, label, hint, children }: FieldProps) {
  const issues = useFieldIssues(id);
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && <p className="field__hint">{hint}</p>}
      {issues.map((issue, index) => (
        <p key={index} className={`field__issue field__issue--${issue.severity}`}>
          {issue.severity === 'error' ? <WarningCircleIcon size={14} /> : <WarningIcon size={14} />}
          {issue.summary}
        </p>
      ))}
    </div>
  );
}

export function Toggle({ id, checked, onChange, label }: { id?: string; checked: boolean; onChange: (checked: boolean) => void; label: ReactNode }) {
  return (
    <label className="toggle">
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          className="tabs__tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Dialog({ title, intro, children, onClose }: { title: string; intro?: ReactNode; children: ReactNode; onClose: () => void }) {
  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(event) => event.key === 'Escape' && onClose()}>
        <h2 className="dialog__title">{title}</h2>
        {intro && <p className="dialog__intro">{intro}</p>}
        {children}
      </div>
    </div>
  );
}
