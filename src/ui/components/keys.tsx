import { Fragment, type ReactNode } from 'react';

const KEY = /\[\[(.+?)\]\]/g;

/** Renders `[[Enter]]`-style markers in a copy string as <kbd> keys. */
export function withKeys(text: string): ReactNode {
  if (!text.includes('[[')) return text;
  const parts = text.split(KEY);
  return parts.map((part, index) => (index % 2 === 1 ? <kbd key={index}>{part}</kbd> : <Fragment key={index}>{part}</Fragment>));
}
