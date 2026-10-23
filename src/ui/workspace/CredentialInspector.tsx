import type { Branding } from '../../core/model';
import { templatePaths } from '../../core/templates';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Button, Field, Tabs } from '../components/controls';
import { TemplateInput, TextInput } from '../components/inputs';
import { ColorInput, LogoInput } from '../components/media';
import { fieldId } from '../issues';
import { InspectorHeader } from './InspectorHeader';
import { LanguageRows } from './LanguageRows';
import { metaRow, primaryFieldRow } from './translationRows';

export function CredentialInspector() {
  const project = useStore((state) => state.project)!;
  const lang = useStore((state) => state.editLang);
  const theme = useStore((state) => state.brandingTheme);
  const { update, setBrandingTheme } = useStore.getState();
  const meta = project.meta[lang] ?? { name: '', description: '' };
  const pair = project.branding[lang] ?? { light: {} };
  const branding = theme === 'dark' ? pair.dark : pair.light;
  const paths = templatePaths(project.root);
  const id = (field: 'name' | 'description' | 'logo' | 'primaryBackgroundColor' | 'primaryField' | 'secondaryField') =>
    fieldId({ kind: 'credential', field, lang, theme: field === 'name' || field === 'description' ? undefined : theme });

  // The dark primary field is only listed for the languages that have a dark branding.
  const primaryLangs = theme === 'dark' ? project.languages.filter((other) => project.branding[other]?.dark) : undefined;
  const setBranding = (field: keyof Branding, value: string | undefined) =>
    update((draft) => {
      const current = draft.branding[lang] ?? { light: {} };
      const target = theme === 'dark' ? (current.dark ?? {}) : current.light;
      if (value === undefined || value === '') delete target[field];
      else target[field] = value;
      draft.branding[lang] = theme === 'dark' ? { ...current, dark: target } : { ...current, light: target };
    });
  const passthrough = project.root.passthrough.map((overlay) => String(overlay.type));

  return (
    <>
      <InspectorHeader kind={t.inspector.credentialEyebrow} lang={lang} title={meta.name || t.workspace.untitled} />
      <Field id={id('name')} label={t.inspector.name} hint={t.inspector.nameHint}>
        <LanguageRows id={id('name')} label={t.inspector.name} row={metaRow('name', t.translations.name)} input={(props) => <TextInput {...props} />} />
      </Field>
      <Field id={id('description')} label={t.inspector.description} hint={t.inspector.descriptionHint}>
        <LanguageRows
          id={id('description')}
          label={t.inspector.description}
          row={metaRow('description', t.translations.description)}
          input={(props) => <TextInput {...props} />}
        />
      </Field>

      <div className="section">
        <div className="section__title">{t.inspector.branding}</div>
        <Tabs
          label={t.inspector.branding}
          value={theme}
          onChange={setBrandingTheme}
          options={[
            { value: 'light', label: t.inspector.light },
            { value: 'dark', label: t.inspector.dark },
          ]}
        />
        <div style={{ paddingTop: 20 }}>
          {!branding ? (
            <>
              <p className="note">{t.inspector.darkHint}</p>
              <Button onClick={() => update((draft) => void (draft.branding[lang] = { ...(draft.branding[lang] ?? { light: {} }), dark: {} }))}>
                {t.inspector.addDark}
              </Button>
            </>
          ) : (
            <>
              {theme === 'dark' && <p className="note">{t.inspector.darkHint}</p>}
              <Field id={id('logo')} label={t.inspector.logo} hint={t.inspector.logoHint}>
                <LogoInput id={id('logo')} value={branding.logo} onChange={(value) => setBranding('logo', value)} />
              </Field>
              <Field id={id('primaryBackgroundColor')} label={t.inspector.background} hint={t.inspector.backgroundHint}>
                <ColorInput
                  id={id('primaryBackgroundColor')}
                  value={branding.primaryBackgroundColor}
                  onChange={(value) => setBranding('primaryBackgroundColor', value)}
                />
              </Field>
              <Field id={id('primaryField')} label={t.inspector.primaryField} hint={t.inspector.primaryFieldHint}>
                <LanguageRows
                  id={id('primaryField')}
                  label={t.inspector.primaryField}
                  row={primaryFieldRow(theme)}
                  langs={primaryLangs}
                  input={(props) => <TemplateInput {...props} paths={paths} />}
                />
              </Field>
              <Field id={id('secondaryField')} label={t.inspector.secondaryField} hint={t.inspector.secondaryFieldHint}>
                <TemplateInput
                  id={id('secondaryField')}
                  value={branding.secondaryField ?? ''}
                  paths={paths}
                  onChange={(value) => setBranding('secondaryField', value)}
                />
              </Field>
              {theme === 'dark' && (
                <Button
                  variant="danger"
                  onClick={() =>
                    update((draft) => {
                      delete draft.branding[lang].dark;
                    })
                  }
                >
                  {t.inspector.removeDark}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {passthrough.length > 0 && <p className="note">{t.inspector.passthrough(passthrough.join(', '))}</p>}
    </>
  );
}
