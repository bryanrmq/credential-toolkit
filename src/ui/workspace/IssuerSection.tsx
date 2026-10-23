import { MinusIcon, PlusIcon } from '@phosphor-icons/react';
import { defaultIdentifiers, issuerIdentifiers, issuerOf } from '../../core/issuer';
import { ensureIssuer } from '../../core/model';
import type { CredentialField } from '../../core/validate';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Field } from '../components/controls';
import { TextInput } from '../components/inputs';
import { LogoInput } from '../components/media';
import { fieldId } from '../issues';
import { setIdentifiersOpen, useIdentifiersOpen } from '../lib/identifiersDisclosure';
import { LanguageRows } from './LanguageRows';
import { issuerNameRow } from './translationRows';

const IDENTIFIERS_ID = 'issuer-identifiers';

type OptionalSetting = 'logo' | 'url' | 'configurationId' | 'typeKey';

/**
 * The credential's Issuer section: the issuer name and logo the wallets show as "Issued by", the Issuer URL and the
 * identifiers of the swiyu generic issuer's files. All of it goes into the Issuer Metadata and the Type Metadata,
 * never into the OCA bundle.
 *
 * Both wallets only draw an issuer logo given as a data URL: iOS v1.19.0 (42e746c) reads `display.logo.uri` with
 * `dataURLData` (`CredentialGenerator.swift`, `createIssuerDisplays`), and Android v1.19.0 (c29a6f3) decodes only
 * the `data` scheme and skips `https` (`GetImageDataFromUriImpl.kt`). So the logo is stored as a PNG or JPEG data URL.
 */
export function IssuerSection() {
  const project = useStore((state) => state.project)!;
  const lang = useStore((state) => state.editLang);
  const update = useStore((state) => state.update);
  const open = useIdentifiersOpen((state) => state.open);
  const issuer = issuerOf(project);
  const defaults = defaultIdentifiers(project.meta[project.languages[0]]?.name ?? '');
  const { typeKey } = issuerIdentifiers(project);
  const id = (field: CredentialField) => fieldId({ kind: 'credential', field, lang: field === 'issuerName' ? lang : undefined });

  // Clearing a setting removes it, so an empty identifier falls back to the default from the credential name.
  const set = (field: OptionalSetting, value: string | undefined) =>
    update((draft) => {
      const settings = ensureIssuer(draft);
      if (value === undefined || value === '') delete settings[field];
      else settings[field] = value;
    });

  return (
    <div className="section">
      <div className="section__title">{t.issuerSection.title}</div>
      <p className="section__intro">{t.issuerSection.intro}</p>
      <Field id={id('issuerName')} label={t.issuerSection.name}>
        <LanguageRows id={id('issuerName')} label={t.issuerSection.name} row={issuerNameRow()} input={(props) => <TextInput {...props} />} />
      </Field>
      <Field id={id('issuerLogo')} label={t.issuerSection.logo} hint={t.issuerSection.logoHint}>
        <LogoInput id={id('issuerLogo')} value={issuer.logo} onChange={(value) => set('logo', value)} />
      </Field>
      <Field
        id={id('issuerUrl')}
        label={
          <>
            {t.issuerSection.url} <span className="field__optional">{t.issuerSection.optional}</span>
          </>
        }
        hint={t.issuerSection.urlHint}
      >
        <TextInput id={id('issuerUrl')} mono value={issuer.url ?? ''} placeholder="https://issuer.example.ch" onChange={(value) => set('url', value)} />
      </Field>

      <div className="disclosure">
        <button
          type="button"
          className="disclosure__toggle"
          aria-expanded={open}
          aria-controls={IDENTIFIERS_ID}
          onClick={() => setIdentifiersOpen(!open)}
        >
          {t.issuerSection.identifiers}
          {open ? <MinusIcon size={14} /> : <PlusIcon size={14} />}
        </button>
        {open && (
          <div id={IDENTIFIERS_ID} className="disclosure__body issuer-identifiers">
            <Field id={id('issuerConfigurationId')} label={t.issuerSection.configurationId} hint={t.issuerSection.configurationIdHint}>
              <TextInput
                id={id('issuerConfigurationId')}
                mono
                value={issuer.configurationId ?? ''}
                placeholder={defaults.configurationId}
                onChange={(value) => set('configurationId', value)}
              />
            </Field>
            <Field id={id('issuerTypeKey')} label={t.issuerSection.typeKey} hint={<code>{`…/oid4vci/vct/${typeKey}`}</code>}>
              <TextInput id={id('issuerTypeKey')} mono value={issuer.typeKey ?? ''} placeholder={defaults.typeKey} onChange={(value) => set('typeKey', value)} />
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}
