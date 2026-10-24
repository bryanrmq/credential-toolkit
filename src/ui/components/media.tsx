import { UploadSimpleIcon } from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import { imageInfo } from '../../core/image';
import { LANGUAGE_NAMES, isValidLanguageTag } from '../../core/langs';
import type { LangTag } from '../../core/model';
import { t } from '../../strings';
import { LOGO_MAX_SIZE, downscaleLogo, isAcceptedImage, readAsDataUrl } from '../lib/logo';
import { Button } from './controls';

export function LogoInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value?: string;
  onChange: (value: string | undefined) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const info = value ? imageInfo(value) : null;
  const tooLarge = !!info?.width && !!info.height && Math.max(info.width, info.height) > LOGO_MAX_SIZE;
  return (
    <div>
      <div className="logo-input">
        <div className="row row--wrap">
          <Button id={id} size="small" onClick={() => fileRef.current?.click()}>
            <UploadSimpleIcon /> {t.inspector.uploadLogo}
          </Button>
          {tooLarge && value && (
            <Button size="small" onClick={async () => onChange(await downscaleLogo(value))}>
              {t.inspector.downscale}
            </Button>
          )}
          {value && (
            <Button size="small" variant="ghost" onClick={() => onChange(undefined)}>
              {t.inspector.removeLogo}
            </Button>
          )}
          {info?.width && <span className="field__hint">{`${info.width}×${info.height}`}</span>}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          if (!isAcceptedImage(file)) {
            setError(t.inspector.logoError);
            return;
          }
          setError(null);
          onChange(await readAsDataUrl(file));
        }}
      />
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function ColorInput({ id, value, onChange }: { id: string; value?: string; onChange: (value: string | undefined) => void }) {
  return (
    <div className="color-input">
      <input
        type="color"
        aria-label="Pick colour"
        value={value && HEX.test(value) ? value : '#ffffff'}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
      />
      <input
        id={id}
        className="input input--mono"
        value={value ?? ''}
        placeholder="#FFFFFF"
        onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
      />
    </div>
  );
}

/** Checkbox list of the default languages plus a field for another tag. */
export function LanguagePicker({ value, onChange }: { value: LangTag[]; onChange: (value: LangTag[]) => void }) {
  const [custom, setCustom] = useState('');
  const toggle = (lang: LangTag, checked: boolean) =>
    onChange(checked ? [...value, lang] : value.filter((existing) => existing !== lang));
  const extra = value.filter((lang) => !(lang in LANGUAGE_NAMES));
  const customValid = isValidLanguageTag(custom) && !value.includes(custom);
  return (
    <div>
      <div className="checkbox-list">
        {[...Object.keys(LANGUAGE_NAMES), ...extra].map((lang) => (
          <label key={lang}>
            <input type="checkbox" checked={value.includes(lang)} onChange={(event) => toggle(lang, event.target.checked)} />
            {LANGUAGE_NAMES[lang] ?? lang} <span className="mono">{lang}</span>
          </label>
        ))}
      </div>
      <div className="row checkbox-list__custom">
        <input
          className="input input--mono"
          aria-label={t.languagesDialog.custom}
          placeholder={t.languagesDialog.custom}
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
        />
        <Button
          size="small"
          disabled={!customValid}
          onClick={() => {
            onChange([...value, custom]);
            setCustom('');
          }}
        >
          {t.languagesDialog.add}
        </Button>
      </div>
      {custom !== '' && !isValidLanguageTag(custom) && <p className="error-text">{t.languagesDialog.invalid}</p>}
    </div>
  );
}
