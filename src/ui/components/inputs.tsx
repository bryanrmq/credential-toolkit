import { useRef, useState } from 'react';
import type { ClaimsPath } from '../../core/model';
import { formatPath, parsePath } from '../../core/paths';
import { t } from '../../strings';

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  mono = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      id={id}
      className={mono ? 'input input--mono' : 'input'}
      value={value}
      placeholder={placeholder}
      spellCheck={!mono}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** Text input that commits on blur or Enter (Escape reverts), for edits that ripple through the project. */
export function CommitInput({ id, value, onCommit, mono = false }: { id: string; value: string; onCommit: (value: string) => void; mono?: boolean }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(value);
  }
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  return (
    <input
      id={id}
      className={mono ? 'input input--mono' : 'input'}
      value={text}
      spellCheck={!mono}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') setText(value);
      }}
    />
  );
}

/** Edits a claims path as text; keeps invalid text local and only commits valid paths. */
export function PathInput({ id, value, onChange }: { id: string; value: ClaimsPath; onChange: (path: ClaimsPath) => void }) {
  const external = JSON.stringify(value);
  const [text, setText] = useState(() => formatPath(value));
  const [seen, setSeen] = useState(external);
  // When the path changes elsewhere (e.g. a rename), show it — unless it is what the user just typed.
  if (seen !== external) {
    setSeen(external);
    if (JSON.stringify(parsePath(text)) !== external) setText(formatPath(value));
  }
  const parsed = parsePath(text);
  return (
    <>
      <input
        id={id}
        className="input input--mono"
        value={text}
        aria-invalid={parsed === null}
        spellCheck={false}
        onChange={(event) => {
          setText(event.target.value);
          const next = parsePath(event.target.value);
          if (next) onChange(next);
        }}
      />
      {parsed === null && <p className="field__issue field__issue--error">{t.inspector.sourceInvalid}</p>}
    </>
  );
}

const OPEN_EXPRESSION = /\{\{([^{}]*)$/;

/** Text input with `{{` autocomplete for attribute paths. */
export function TemplateInput({
  id,
  value,
  onChange,
  paths,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  paths: string[];
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const suggestions = query === null ? [] : paths.filter((path) => path.toLowerCase().includes(query.toLowerCase())).slice(0, 12);

  const refreshQuery = (text: string, caret: number) => {
    const match = OPEN_EXPRESSION.exec(text.slice(0, caret));
    setQuery(match ? match[1] : null);
    setActive(0);
  };

  const insert = (path: string) => {
    const input = inputRef.current;
    if (!input) return;
    const caret = input.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(OPEN_EXPRESSION, `{{${path}}}`);
    const after = value.slice(caret).replace(/^[^{}]*\}\}/, '');
    onChange(before + after);
    setQuery(null);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(before.length, before.length);
    });
  };

  return (
    <div className="template-input">
      <input
        ref={inputRef}
        id={id}
        className="input"
        value={value}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-controls={`${id}-suggestions`}
        aria-autocomplete="list"
        onChange={(event) => {
          onChange(event.target.value);
          refreshQuery(event.target.value, event.target.selectionStart ?? event.target.value.length);
        }}
        onBlur={() => setTimeout(() => setQuery(null), 120)}
        onKeyDown={(event) => {
          if (!suggestions.length) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((index) => (index + 1) % suggestions.length);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) => (index - 1 + suggestions.length) % suggestions.length);
          } else if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            insert(suggestions[active]);
          } else if (event.key === 'Escape') {
            setQuery(null);
          }
        }}
      />
      {suggestions.length > 0 && (
        <ul className="suggestions" id={`${id}-suggestions`} role="listbox">
          {suggestions.map((path, index) => (
            <li
              key={path}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                insert(path);
              }}
            >
              {path}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
