import { useId, useMemo, useState } from 'react';
import { selectBranding } from '../../core/card/branding';
import { type DetailsRow, credentialDetails } from '../../core/card/details';
import {
  ANDROID_DETAILS_TEXT,
  CREDENTIAL_STATUSES,
  type CredentialStatus,
  IOS_DETAILS_TEXT,
  androidAppLanguage,
  androidStatusText,
  iosAppLanguage,
  iosStatusText,
} from '../../core/card/detailsChrome';
import { type DetailsDifference, detailsDevice, detailsDifferences } from '../../core/card/detailsDifferences';
import { otherPlatform } from '../../core/card/differences';
import { CARD_PROFILES } from '../../core/card/profiles';
import { cardSummary } from '../../core/card/summary';
import { type FormattedValue, formatClaim } from '../../core/card/values';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { ANDROID_SCREEN_WIDTH, AndroidDetailsScreen } from '../components/AndroidDetailsScreen';
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

function describeValue(value: FormattedValue): string {
  const text = t.detailsPreview.differences;
  switch (value.kind) {
    case 'text':
      return `"${value.text}"`;
    case 'image':
      return text.image;
    case 'invalidImage':
      return text.rejected;
    case 'placeholder':
      return value.type;
  }
}

function describeDifference(difference: DetailsDifference, platform: string): string {
  const text = t.detailsPreview.differences;
  switch (difference.kind) {
    case 'order':
      return text.order(platform);
    case 'orderUndefined':
      return text.orderUndefined(platform);
    case 'unmapped':
      return text.unmapped(platform, difference.first);
    case 'label':
      return text.label(platform, difference.label, difference.other);
    case 'value':
      return text.value(platform, difference.label, describeValue(difference.value));
    case 'sensitive':
      return text.sensitive(platform, difference.label, difference.shown);
    case 'row':
      return difference.shown ? text.rowShown(platform, difference.label) : text.rowHidden(platform, difference.label);
    case 'group':
      return difference.shown ? text.groupShown(platform, difference.title) : text.groupHidden(platform, difference.title);
    case 'title':
      return text.title(platform, difference.title, difference.other);
  }
}

/**
 * The wallet's credential details screen for the platform picked in the preview's header, as a device set to the
 * editing language would show it, with the card status picker above and, underneath, the notes on it and where the
 * other platform would differ. It sizes itself from the width it is given, so it renders wherever the preview lives.
 */
export function DetailsPreview() {
  const project = useStore((state) => state.project)!;
  const platform = useStore((state) => state.cardPlatform);
  const lang = useStore((state) => state.editLang);
  const theme = useStore((state) => state.brandingTheme);
  const [status, setStatus] = useState<CredentialStatus>('valid');
  // The preview can show in more than one pane at once, so the picker's id is generated.
  const statusId = useId();
  const { ref, scale } = useFitScale(platform === 'ios' ? IOS_SCREEN_WIDTH : ANDROID_SCREEN_WIDTH);

  const profile = CARD_PROFILES[platform];
  const { languages, valueOptions } = detailsDevice(platform, [lang]);
  const details = useMemo(() => credentialDetails(project, { languages: detailsDevice(platform, [lang]).languages, platform }), [project, lang, platform]);
  const differences = useMemo(() => detailsDifferences(project, platform, { deviceLanguages: [lang] }), [project, platform, lang]);
  const { branding } = selectBranding(project, lang, theme);
  const background = profile.parseBackground(branding.primaryBackgroundColor) ?? profile.fallbackBackground;
  const name = project.meta[lang]?.name ?? '';
  const rows = details.sections.flatMap((section) => section.rows);
  const invalidImage = someClaim(rows, (claim) => formatClaim(claim, valueOptions).kind === 'invalidImage');
  const platformName = t.cardPreview.platforms[platform];
  const otherName = t.cardPreview.platforms[otherPlatform(platform)];
  const card = {
    label: `${platformName} ${t.cardPreview.drawn.card}`,
    layout: profile.layout.detail,
    background,
    ink: profile.textInk(background),
    name: name || profile.missingName,
    summary: cardSummary(project, lang, branding, platform),
    logo: branding.logo,
  };
  const screenProps = { label: `${platformName} ${t.detailsPreview.screen}`, theme, title: name, card, details, valueOptions, issuer: { logo: branding.logo }, scale };

  let screen;
  if (platform === 'ios') {
    const text = IOS_DETAILS_TEXT[iosAppLanguage(languages)];
    screen = <IosDetailsScreen {...screenProps} text={text} status={{ value: status, text: iosStatusText(status, text, tomorrow(), valueOptions.locale) }} />;
  } else {
    const text = ANDROID_DETAILS_TEXT[androidAppLanguage(valueOptions.locale)];
    screen = (
      <AndroidDetailsScreen {...screenProps} text={text} status={{ value: status, text: androidStatusText(status, text, tomorrow(), valueOptions.locale) }} />
    );
  }

  return (
    <div className="details-preview">
      <div className="details-preview__status">
        <label htmlFor={statusId}>{t.detailsPreview.status}</label>
        <select
          id={statusId}
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
      <div ref={ref} className={`details-preview__stage details-preview__stage--${platform} details-preview__stage--${theme}`}>
        {screen}
      </div>
      {details.noSample && <p className="note">{t.cardPreview.noSample}</p>}
      {details.orderUndefined && <p className="note">{t.detailsPreview.orderUndefined}</p>}
      {invalidImage && <p className="note">{t.detailsPreview.invalidImageNote}</p>}
      <p className="note">{t.detailsPreview.issuer}</p>
      {differences.length > 0 && (
        <ul className="card-preview__differences" aria-label={t.detailsPreview.differencesLabel(otherName)}>
          {differences.map((difference, index) => (
            <li key={index}>{describeDifference(difference, otherName)}</li>
          ))}
        </ul>
      )}
      <p className="field__hint">{t.detailsPreview.caption(platformName)}</p>
    </div>
  );
}
