import { CheckIcon, CopyIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { t } from '../../strings';
import { Button } from '../components/controls';
import { copyText } from '../lib/download';

/** Copies `text`; says "Copied" for a moment after. `iconOnly` makes it an icon button named `label`. */
export function CopyButton({ text, label, iconOnly = false }: { text: string; label: string; iconOnly?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (iconOnly) {
    return (
      <Button
        size="icon"
        variant="ghost"
        aria-label={copied ? t.output.copied : label}
        title={copied ? t.output.copied : label}
        onClick={async () => {
          if (await copyText(text)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    );
  }
  return (
    <Button
      size="small"
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
    >
      <CopyIcon /> {copied ? t.output.copied : label}
    </Button>
  );
}
