import { useEffect, useRef } from 'react';
import { defaultIdentifiers, issuerIdentifiers, issuerOf } from '../../core/issuer';
import { ensureIssuer } from '../../core/model';
import type { CredentialField } from '../../core/validate';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Field, Segmented } from '../components/controls';
import { TextInput } from '../components/inputs';
import { LogoInput } from '../components/media';
import { fieldId } from '../issues';
import { DetailsPreview } from './DetailsPreview';
import { InspectorHeader } from './InspectorHeader';
import { LanguageRows } from './LanguageRows';
import { issuerNameRow } from './translationRows';

type OptionalSetting = 'logo' | 'url' | 'configurationId' | 'typeKey';

/** The "Issued by" row of the iOS and Android details screens. */
const ISSUED_BY = '.ios-details__issuer, .android-section--issuer';

/**
 * Scrolls the preview column to the "Issued by" row, which both wallets draw near the end of the details screen,
 * when the page opens and when the platform changes. Only the column scrolls: where it does not scroll on its own
 * (a narrow window stacks it under the form), nothing moves.
 */
function useIssuedByInView(platform: string) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      // A second frame: the screen is scaled to the column's width after the first one.
      frame = requestAnimationFrame(() => {
        const column = ref.current;
        const row = column?.querySelector(ISSUED_BY);
        if (!column || !row) return;
        column.scrollTop += row.getBoundingClientRect().top - column.getBoundingClientRect().top - column.clientHeight / 3;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [platform]);
  return ref;
}

/**
 * The Metadata page, the top bar's second file next to the OCA: the issuer name and logo the wallets show as
 * "Issued by", the Issuer URL and the identifiers of the swiyu generic issuer's files. All of it goes into the
 * Issuer Metadata and the Type Metadata, never into the OCA bundle. Beside the form, the wallet's details screen
 * shows the "Issued by" row.
 *
 * Both wallets only draw an issuer logo given as a data URL: iOS v1.19.0 (42e746c) reads `display.logo.uri` with
 * `dataURLData` (`CredentialGenerator.swift`, `createIssuerDisplays`), and Android v1.19.0 (c29a6f3) decodes only
 * the `data` scheme and skips `https` (`GetImageDataFromUriImpl.kt`). So the logo is stored as a PNG or JPEG data URL.
 */
export function MetadataView() {
  const project = useStore((state) => state.project)!;
  const lang = useStore((state) => state.editLang);
  const platform = useStore((state) => state.cardPlatform);
  const { update, setCardPlatform } = useStore.getState();
  const previewRef = useIssuedByInView(platform);
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
    <div className="metadata">
      <section className="metadata__form" aria-label={t.metadata.title}>
        <div className="metadata__column">
          <InspectorHeader kind={t.metadata.title} lang={lang} title={project.meta[lang]?.name || t.workspace.untitled} />
          <p className="section__intro">{t.metadata.intro}</p>

          <div className="section">
            <div className="section__title">{t.metadata.issuer}</div>
            <p className="section__intro">{t.metadata.issuerIntro}</p>
            <Field id={id('issuerName')} label={t.metadata.name}>
              <LanguageRows id={id('issuerName')} label={t.metadata.name} row={issuerNameRow()} input={(props) => <TextInput {...props} />} />
            </Field>
            <Field id={id('issuerLogo')} label={t.metadata.logo} hint={t.metadata.logoHint}>
              <LogoInput id={id('issuerLogo')} value={issuer.logo} onChange={(value) => set('logo', value)} />
            </Field>
            <Field
              id={id('issuerUrl')}
              label={
                <>
                  {t.metadata.url} <span className="field__optional">{t.metadata.optional}</span>
                </>
              }
              hint={t.metadata.urlHint}
            >
              <TextInput id={id('issuerUrl')} mono value={issuer.url ?? ''} placeholder="https://issuer.example.ch" onChange={(value) => set('url', value)} />
            </Field>
          </div>

          <div className="section">
            <div className="section__title">{t.metadata.identifiers}</div>
            <p className="section__intro">{t.metadata.identifiersIntro}</p>
            <div className="issuer-identifiers">
              <Field id={id('issuerConfigurationId')} label={t.metadata.configurationId} hint={t.metadata.configurationIdHint}>
                <TextInput
                  id={id('issuerConfigurationId')}
                  mono
                  value={issuer.configurationId ?? ''}
                  placeholder={defaults.configurationId}
                  onChange={(value) => set('configurationId', value)}
                />
              </Field>
              <Field id={id('issuerTypeKey')} label={t.metadata.typeKey} hint={<code>{`…/oid4vci/vct/${typeKey}`}</code>}>
                <TextInput id={id('issuerTypeKey')} mono value={issuer.typeKey ?? ''} placeholder={defaults.typeKey} onChange={(value) => set('typeKey', value)} />
              </Field>
            </div>
          </div>
        </div>
      </section>

      {/* `data-placement="below"`: the preview does not scroll to the attribute selected in the OCA editor. */}
      <section ref={previewRef} className="metadata__preview" aria-label={t.metadata.preview} data-placement="below">
        <div className="metadata__preview-header">
          <span className="pane__title">{t.metadata.preview}</span>
          <Segmented
            label={t.output.previewPlatform}
            value={platform}
            onChange={setCardPlatform}
            options={[
              { value: 'ios', label: t.cardPreview.platforms.ios },
              { value: 'android', label: t.cardPreview.platforms.android },
            ]}
          />
        </div>
        <p className="field__hint">{t.metadata.previewNote}</p>
        <div className="output-preview" data-view="details" data-platform={platform}>
          <DetailsPreview />
        </div>
      </section>
    </div>
  );
}
