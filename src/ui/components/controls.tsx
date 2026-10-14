import { DotsThreeIcon, WarningCircleIcon, WarningIcon } from '@phosphor-icons/react';
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef, useState } from 'react';
import { useFieldIssues } from '../issues';
import { withKeys } from './keys';

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
      {hint && <p className="field__hint">{typeof hint === 'string' ? withKeys(hint) : hint}</p>}
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
  className = '',
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode }>;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={`segmented ${className}`.trim()} role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface MenuItem {
  label: string;
  onSelect: () => void;
  className?: string;
}

/** A "⋯" button with a small list of actions. Closes on selection, outside click or Escape. */
export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <Button size="icon" variant="ghost" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <DotsThreeIcon size={18} />
      </Button>
      {open && (
        <div className="menu__list" role="menu" aria-label={label}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`menu__item ${item.className ?? ''}`.trim()}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
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
