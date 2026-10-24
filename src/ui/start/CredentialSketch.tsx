/**
 * A loose line drawing of a credential card (logo, name, summary, attributes) over one offset pastel
 * shape, for the start screen. Decorative only. Its ink, card and shape take their colours from
 * styles.css (`.start__sketch`), so they follow the theme.
 */
export function CredentialSketch() {
  const ink = { stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg className="start__sketch" viewBox="0 0 360 260" fill="none" aria-hidden="true">
      <rect className="start__sketch-shape" x="82" y="62" width="250" height="166" rx="18" />
      <path
        d="M60 40c62-2 142-1 212 1 7 0 11 4 11 11l1 138c0 7-4 11-11 11-74 2-150 1-212-1-7 0-11-4-11-11L49 51c0-7 4-11 11-11z"
        className="start__sketch-card"
        strokeWidth="1.6"
        {...ink}
      />
      <circle cx="84" cy="78" r="13" strokeWidth="1.6" {...ink} />
      <path d="M78 79c1-5 9-6 11-1s-3 7-6 6" strokeWidth="1.4" {...ink} />
      <path d="M108 72c32-1 62 0 94 1" strokeWidth="4" {...ink} />
      <path d="M108 86c22-1 44 0 66 1" strokeWidth="2" opacity="0.4" {...ink} />
      <path d="M72 124c44-1 96-1 156 0" strokeWidth="1.4" opacity="0.25" {...ink} />
      <path d="M72 140c22 0 42 0 60 1M150 140c24-1 46 0 70 1" strokeWidth="2" opacity="0.55" {...ink} />
      <path d="M72 160c18 0 38 0 54 1M150 160c30-1 58 0 86 1" strokeWidth="2" opacity="0.55" {...ink} />
      <path d="M72 180c20 0 36 0 50 1" strokeWidth="2" opacity="0.55" {...ink} />
      <rect x="196" y="172" width="64" height="18" rx="9" strokeWidth="1.4" {...ink} />
      <path d="M208 181c10 0 24 0 40 1" strokeWidth="1.6" opacity="0.6" {...ink} />
    </svg>
  );
}
