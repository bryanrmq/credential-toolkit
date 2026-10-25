import { useEffect, useRef } from 'react';
import { ISSUER_METADATA_FILE_NAME, filePlaceholders } from '../../core/export/issuerMetadata';
import { VCT_FILE_NAME } from '../../core/export/outputs';
import { defaultIdentifiers, issuerIdentifiers, issuerOf } from '../../core/issuer';
import { ensureIssuer } from '../../core/model';
import type { CredentialField } from '../../core/validate';
import { type MetadataTab, useStore } from '../../state/store';
import type { ExportState } from '../../state/useExport';
import { t } from '../../strings';
import { Field, Segmented, Tabs } from '../components/controls';
import { TextInput } from '../components/inputs';
import { LogoInput } from '../components/media';
import { fieldId, focusField } from '../issues';
import type { MetadataPane } from '../lib/paneLayout';
import { useWideWindow } from '../lib/wideWindow';
import { DetailsPreview } from './DetailsPreview';
import { InspectorHeader } from './InspectorHeader';
import { LanguageRows } from './LanguageRows';
import { MetadataFile } from './MetadataFile';
import { issuerNameRow } from './translationRows';

type OptionalSetting = 'logo' | 'url' | 'configurationId' | 'typeKey';

/** The "Issued by" row of the iOS and Android details screens. */
const ISSUED_BY = '.ios-details__issuer, .android-section--issuer';

/**
 * Scrolls the preview column to the "Issued by" row, which both wallets draw near the end of the details screen,
 * when the page opens, when the platform changes and when the Preview tab or pane comes back. Only the column's body
 * scrolls.
 */
function useIssuedByInView(platform: string, tab: MetadataTab, pane: MetadataPane) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      // A second frame: the screen is scaled to the column's width after the first one.
      frame = requestAnimationFrame(() => {
        const column = ref.current;
        const row = column?.querySelector(ISSUED_BY);
        if (!column || !row) {
          column?.scrollTo?.({ top: 0 });
          return;
        }
        column.scrollTop += row.getBoundingClientRect().top - column.getBoundingClientRect().top - column.clientHeight / 3;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [platform, tab, pane]);
  return ref;
}

/**
 * The Metadata page, the top bar's second file next to the OCA: the issuer name and logo the wallets show as
 * "Issued by", the Issuer URL and the identifiers of the swiyu generic issuer's files. All of it goes into the
 * Issuer Metadata and the Type Metadata, never into the OCA bundle. Beside the form, the wallet's details screen
 * shows the "Issued by" row, and its tabs show the two files: `vct.json` and `issuer_metadata.json`, built from the
 * whole project (`exportState`), each with its download and the placeholders left to replace.
 * It is built like the OCA's panes: the form as the Edit pane, the column as the Output pane with its tabs in the
 * header. A narrow window shows one `pane` at a time, chosen by the workspace's pane tabs (Form, Preview, Files,
 * Issues); there the two files are a segmented control under Files, and `onPane` brings the form back.
 *
 * Both wallets only draw an issuer logo given as a data URL: iOS v1.19.0 (42e746c) reads `display.logo.uri` with
 * `dataURLData` (`CredentialGenerator.swift`, `createIssuerDisplays`), and Android v1.19.0 (c29a6f3) decodes only
 * the `data` scheme and skips `https` (`GetImageDataFromUriImpl.kt`). So the logo is stored as a PNG or JPEG data URL.
 */
export function MetadataView({
  exportState,
  pane = 'form',
  onPane,
}: {
  exportState: ExportState;
  pane?: MetadataPane;
  onPane?: (pane: MetadataPane) => void;
}) {
  const project = useStore((state) => state.project)!;
  const lang = useStore((state) => state.editLang);
  const platform = useStore((state) => state.cardPlatform);
  const tab = useStore((state) => state.metadataTab);
  const { update, setCardPlatform, setMetadataTab } = useStore.getState();
  const previewRef = useIssuedByInView(platform, tab, pane);
  const tabs: Array<{ value: MetadataTab; label: string }> = [
    { value: 'preview', label: t.metadata.preview },
    { value: 'vct', label: t.metadata.typeMetadata },
    { value: 'issuerMetadata', label: t.metadata.issuerMetadata },
  ];
  const issuer = issuerOf(project);
  const defaults = defaultIdentifiers(project.meta[project.languages[0]]?.name ?? '');
  const { typeKey } = issuerIdentifiers(project);
  const id = (field: CredentialField) => fieldId({ kind: 'credential', field, lang: field === 'issuerName' ? lang : undefined });
  const wide = useWideWindow();
  const focusIssuerUrl = () => {
    onPane?.('form');
    focusField(id('issuerUrl'));
  };

  // Clearing a setting removes it, so an empty identifier falls back to the default from the credential name.
  const set = (field: OptionalSetting, value: string | undefined) =>
    update((draft) => {
      const settings = ensureIssuer(draft);
      if (value === undefined || value === '') delete settings[field];
      else settings[field] = value;
    });

  return (
    <div className="metadata" data-pane={pane} data-tour="metadata">
      <section className="pane metadata__form" aria-label={t.metadata.title}>
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
      <section
        className="pane metadata__preview"
        aria-label={tabs.find((option) => option.value === tab)!.label}
        data-placement="below"
        data-tab={tab}
      >
        {/* The Output pane's header. On a narrow window the pane tabs name the Preview, and under Files a switch picks
            the file. */}
        {wide ? (
          <div className="output__header metadata__preview-header">
            <Tabs label={t.metadata.files} value={tab} onChange={setMetadataTab} options={tabs} />
          </div>
        ) : (
          tab !== 'preview' && (
            <div className="output__header">
              <Segmented label={t.metadata.file} value={tab} onChange={setMetadataTab} options={tabs.slice(1)} />
            </div>
          )
        )}
        <div ref={previewRef} className="metadata__preview-body">
          {tab === 'preview' ? (
            <>
              <div className="metadata__preview-controls">
                <p className="field__hint">{t.metadata.previewNote}</p>
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
              <div className="output-preview" data-view="details" data-platform={platform}>
                <DetailsPreview />
              </div>
            </>
          ) : (
            <MetadataFiles exportState={exportState} file={tab === 'vct' ? VCT_FILE_NAME : ISSUER_METADATA_FILE_NAME} onIssuerUrl={focusIssuerUrl} />
          )}
        </div>
      </section>
    </div>
  );
}

/** The `vct.json` or `issuer_metadata.json` tab: the file once the project is built, with the placeholders left in it. */
function MetadataFiles({ exportState, file, onIssuerUrl }: { exportState: ExportState; file: string; onIssuerUrl: () => void }) {
  if (exportState.status === 'working') return <p className="field__hint">{t.output.working}</p>;
  if (exportState.status === 'failed') return <p className="error-text">{t.output.failed(exportState.error)}</p>;
  const text = file === VCT_FILE_NAME ? exportState.vct.text : exportState.issuerMetadata.json;
  const placeholders = filePlaceholders(exportState).find((entry) => entry.file === file)!.placeholders;
  // One per file, so a "Copied" does not carry over to the other tab.
  return <MetadataFile key={file} fileName={file} text={text} placeholders={placeholders} onIssuerUrl={onIssuerUrl} />;
}
