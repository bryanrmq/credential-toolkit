import { DeviceMobileIcon } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { selectBranding } from '../../core/card/branding';
import { type DetailsRow, credentialDetails, iosLanguageCodes } from '../../core/card/details';
import { CREDENTIAL_STATUSES, type CredentialStatus, IOS_DETAILS_TEXT, iosAppLanguage, iosStatusText } from '../../core/card/detailsChrome';
import { CARD_PROFILES } from '../../core/card/profiles';
import { cardSummary } from '../../core/card/summary';
import { formatClaim, walletLocale } from '../../core/card/values';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { IOS_SCREEN_WIDTH, IosDetailsScreen } from '../components/IosDetailsScreen';
import { useFitScale } from '../components/useFitScale';

/** The day after today: when a "Not yet valid" credential becomes valid in the preview. */
function tomorrow(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date;
}

function someClaim(rows: DetailsRow[], test: (row: Extract<DetailsRow, { kind: 'claim' }>) => boolean): boolean {
  return rows.some((row) => (row.kind === 'claim' ? test(row) : someClaim(row.rows, test)));
}

/**
 * The wallet's credential details screen for the platform picked in the Output preview's header, as a device set to
 * the editing language would show it, with the notes on it underneath. Only iOS is drawn so far.
 */
export function DetailsPreview() {
  const platform = useStore((state) => state.cardPlatform);
  if (platform !== 'ios') {
    return (
      <p className="empty-state">
        <DeviceMobileIcon size={20} />
        <br />
        {t.output.previewEmpty(t.output.views.details, t.cardPreview.platforms[platform])}
      </p>
    );
  }
  return <IosDetailsPreview />;
}

function IosDetailsPreview() {
  const project = useStore((state) => state.project)!;
  const lang = useStore((state) => state.editLang);
  const theme = useStore((state) => state.brandingTheme);
  const [status, setStatus] = useState<CredentialStatus>('valid');
  const { ref, scale } = useFitScale(IOS_SCREEN_WIDTH);

  const profile = CARD_PROFILES.ios;
  const codes = iosLanguageCodes([lang]);
  const valueOptions = { locale: walletLocale([lang]) };
  const text = IOS_DETAILS_TEXT[iosAppLanguage(codes)];
  const details = useMemo(() => credentialDetails(project, { languages: iosLanguageCodes([lang]), platform: 'ios' }), [project, lang]);
  const { branding } = selectBranding(project, lang, theme);
  const background = profile.parseBackground(branding.primaryBackgroundColor) ?? profile.fallbackBackground;
  const name = project.meta[lang]?.name ?? '';
  const rows = details.sections.flatMap((section) => section.rows);
  const invalidImage = someClaim(rows, (claim) => formatClaim(claim, valueOptions).kind === 'invalidImage');

  return (
    <div className="details-preview">
      <div ref={ref} className={`details-preview__stage details-preview__stage--${theme}`}>
        <IosDetailsScreen
          label={`${t.cardPreview.platforms.ios} ${t.detailsPreview.screen}`}
          theme={theme}
          title={name}
          card={{
            label: `${t.cardPreview.platforms.ios} ${t.cardPreview.drawn.card}`,
            layout: profile.layout.detail,
            background,
            ink: profile.textInk(background),
            name: name || profile.missingName,
            summary: cardSummary(project, lang, branding, 'ios'),
            logo: branding.logo,
          }}
          status={{ value: status, text: iosStatusText(status, text, tomorrow(), valueOptions.locale) }}
          details={details}
          text={text}
          valueOptions={valueOptions}
          issuer={{ logo: branding.logo }}
          scale={scale}
        />
      </div>
      <div className="details-preview__status">
        <label htmlFor="details-preview-status">{t.detailsPreview.status}</label>
        <select
          id="details-preview-status"
          className="select select--compact"
          value={status}
          onChange={(event) => setStatus(event.target.value as CredentialStatus)}
        >
          {CREDENTIAL_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t.detailsPreview.statuses[value]}
            </option>
          ))}
        </select>
      </div>
      {details.noSample && <p className="note">{t.cardPreview.noSample}</p>}
      {details.orderUndefined && <p className="note">{t.detailsPreview.orderUndefined}</p>}
      {invalidImage && <p className="note">{t.detailsPreview.invalidImageNote}</p>}
      <p className="note">{t.detailsPreview.issuer}</p>
      <p className="field__hint">{t.detailsPreview.caption}</p>
    </div>
  );
}
