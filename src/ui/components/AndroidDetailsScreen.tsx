import type { CSSProperties, ReactNode } from 'react';
import type { CredentialDetails, DetailsClaim, DetailsGroup, DetailsRow } from '../../core/card/details';
import { ANDROID_STATUS_STYLE, type AndroidDetailsText, type CredentialStatus } from '../../core/card/detailsChrome';
import { type FormattedValue, type ValueOptions, formatClaim } from '../../core/card/values';
import { t } from '../../strings';
import { CardLogo } from './cardParts';
import { CredentialCard, type CredentialCardProps } from './CredentialCard';
import { linkedProps, rowProps, useDetailsLink } from './detailsLink';
import { GroupTitle } from './GroupTitle';

/** The width of the phone screen the wallet is drawn on, in dp: the 380 dp card plus its 16 dp margins. */
export const ANDROID_SCREEN_WIDTH = 412;

export interface AndroidDetailsScreenProps {
  /** Accessible name of the screen, e.g. "Android details screen". */
  label: string;
  /** The app's appearance: light or dark mode. */
  theme: 'light' | 'dark';
  /** The top bar title, the credential's name; empty draws none. */
  title: string;
  /** The large card at the top, without its badges. */
  card: Omit<CredentialCardProps, 'scale' | 'badges'>;
  status: { value: CredentialStatus; text: string };
  details: CredentialDetails;
  /** The wallet's own texts in the app language. */
  text: AndroidDetailsText;
  valueOptions: ValueOptions;
  /** The "Issued by" row. The wallet reads it from the issuer metadata; a missing name draws a placeholder. */
  issuer: { name?: string; logo?: string };
  /** CSS zoom factor that fits the screen into the available width. */
  scale?: number;
}

/**
 * The Android wallet's credential details screen (`CredentialDetailScreen`, compact width): top bar, the large card
 * with its status badge, the claim clusters (`CredentialElements.kt`) and "Issued by". Sizes and colours are the
 * wallet's, in dp (`Sizes.kt`, `WalletColorScheme.kt`, `WalletTypography.kt`); its ABC Diatype fonts are replaced by
 * the app's.
 *
 * Every claim row and group carries `data-node-id` (the attribute or group link it comes from) and `data-path` (its
 * claims path), so other views can point at it. Inside a `DetailsLinkContext`, rows and group titles from a node pick
 * it, and the rows or groups of the selected node are marked `data-linked`.
 */
export function AndroidDetailsScreen({ label, theme, title, card, status, details, text, valueOptions, issuer, scale = 1 }: AndroidDetailsScreenProps) {
  const context: RowContext = { text, valueOptions };
  const link = useDetailsLink();
  return (
    <div className={`android-details android-details--${theme}`} role="region" aria-label={label} style={{ zoom: scale, '--details-zoom': scale } as CSSProperties}>
      <div className="android-details__bar" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="24" height="24">
          <path d={BACK_ICON} fill="currentColor" />
        </svg>
        <span className="android-details__title">{title}</span>
        <svg viewBox="0 0 960 960" width="24" height="24">
          <path d={MORE_ICON} fill="currentColor" />
        </svg>
      </div>
      <div className="android-details__content">
        <div className="android-details__card">
          <CredentialCard {...card} badges={<StatusBadge status={status} ink={card.ink} />} />
        </div>
        <div className="android-details__clusters">
          {details.sections.map((section, index) => (
            <section key={index} className="android-section" aria-label={section.title} data-node-id={section.nodeId} {...linkedProps(link, section.nodeId)}>
              <Headline title={section.title} depth={0} nodeId={section.nodeId} />
              <div className="android-section__card">
                <Items rows={section.rows} depth={1} showKey context={context} />
              </div>
            </section>
          ))}
          <section className="android-section android-section--issuer" aria-label={text.issuedBy}>
            <Headline title={text.issuedBy} depth={0} />
            <div className="android-section__card">
              <div className="android-item android-item--leading">
                <CardLogo logo={issuer.logo} ink={theme === 'dark' ? 'white' : 'black'} className="android-details__avatar" />
                {issuer.name ? (
                  <span className="android-item__headline">{issuer.name}</span>
                ) : (
                  <span className="android-item__headline android-details__placeholder">{t.detailsPreview.issuerPlaceholder}</span>
                )}
              </div>
              <div className="android-details__divider" />
              <div className="android-item android-item--trailing">
                <div className="android-item__text">
                  <span className="android-item__overline">{text.issuanceType}</span>
                  <span className="android-item__headline">{text.standard}</span>
                </div>
                <svg className="android-item__chevron" viewBox="0 0 12 14" width="21" height="24" aria-hidden="true">
                  <path d={CHEVRON_ICON} fill="currentColor" />
                </svg>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// Icons from the wallet's drawables (`wallet_ic_*.xml`), drawn in the current colour.
const BACK_ICON = 'M7.825,13L13.425,18.6L12,20L4,12L12,4L13.425,5.4L7.825,11H20V13H7.825Z';
const MORE_ICON =
  'M480,800q-33,0 -56.5,-23.5T400,720q0,-33 23.5,-56.5T480,640q33,0 56.5,23.5T560,720q0,33 -23.5,56.5T480,800ZM480,560q-33,0 -56.5,-23.5T400,480q0,-33 23.5,-56.5T480,400q33,0 56.5,23.5T560,480q0,33 -23.5,56.5T480,560ZM480,320q-33,0 -56.5,-23.5T400,240q0,-33 23.5,-56.5T480,160q33,0 56.5,23.5T560,240q0,33 -23.5,56.5T480,320Z';
const CHEVRON_ICON = 'M6.3,7.5L4,5.2L4.7,4.5L7.7,7.5L4.7,10.5L4,9.8L6.3,7.5Z';

const INVALID_ICON =
  'M7,15.333C6.193,15.333 5.435,15.183 4.725,14.881C4.015,14.57 3.398,14.152 2.873,13.627C2.348,13.102 1.93,12.485 1.619,11.775C1.317,11.065 1.167,10.307 1.167,9.5C1.167,8.693 1.317,7.935 1.619,7.225C1.93,6.515 2.348,5.898 2.873,5.373C3.398,4.848 4.015,4.435 4.725,4.133C5.435,3.822 6.193,3.667 7,3.667C7.807,3.667 8.565,3.822 9.275,4.133C9.985,4.435 10.602,4.848 11.127,5.373C11.652,5.898 12.065,6.515 12.367,7.225C12.678,7.935 12.833,8.693 12.833,9.5C12.833,10.307 12.678,11.065 12.367,11.775C12.065,12.485 11.652,13.102 11.127,13.627C10.602,14.152 9.985,14.57 9.275,14.881C8.565,15.183 7.807,15.333 7,15.333ZM7,14.167C7.525,14.167 8.031,14.084 8.517,13.919C9.003,13.744 9.45,13.496 9.858,13.175L3.325,6.642C3.004,7.05 2.756,7.497 2.581,7.983C2.416,8.469 2.333,8.975 2.333,9.5C2.333,10.803 2.785,11.906 3.69,12.81C4.594,13.715 5.697,14.167 7,14.167ZM10.675,12.358C10.996,11.95 11.239,11.503 11.404,11.017C11.579,10.531 11.667,10.025 11.667,9.5C11.667,8.197 11.215,7.094 10.31,6.19C9.406,5.285 8.303,4.833 7,4.833C6.475,4.833 5.969,4.921 5.483,5.096C4.997,5.261 4.55,5.504 4.142,5.825L10.675,12.358Z';

/** `CredentialDisplayStatus.getIcon`: each drawable's path and viewport. */
const STATUS_ICON: Record<CredentialStatus, { d: string; width: number; height: number }> = {
  valid: { d: 'M5.571,10.5L2.246,7.175L3.077,6.344L5.571,8.838L10.923,3.486L11.754,4.317L5.571,10.5Z', width: 14, height: 14 },
  invalid: { d: INVALID_ICON, width: 14, height: 19 },
  revoked: { d: INVALID_ICON, width: 14, height: 19 },
  suspended: {
    d: 'M7,9V2.583H8.167V9H7ZM4.667,9V3.167H5.833V9H4.667ZM7.292,15.417C5.911,15.417 4.74,14.935 3.777,13.973C2.815,13.01 2.333,11.839 2.333,10.458V4.333H3.5V10.458C3.5,11.518 3.865,12.417 4.594,13.156C5.333,13.885 6.232,14.25 7.292,14.25C8.351,14.25 9.246,13.885 9.975,13.156C10.714,12.417 11.083,11.518 11.083,10.458V8.417C10.918,8.417 10.777,8.475 10.66,8.592C10.554,8.699 10.5,8.835 10.5,9V11.333H8.75C8.429,11.333 8.152,11.45 7.919,11.683C7.695,11.907 7.583,12.179 7.583,12.5V13.083H6.417V12.5C6.417,11.858 6.645,11.309 7.102,10.852C7.559,10.395 8.108,10.167 8.75,10.167H9.333V8.504V3.75H10.5V7.352C10.597,7.323 10.69,7.299 10.777,7.279C10.874,7.26 10.976,7.25 11.083,7.25H12.25V10.458C12.25,11.839 11.769,13.01 10.806,13.973C9.844,14.935 8.672,15.417 7.292,15.417Z',
    width: 14,
    height: 18,
  },
  notYetValid: {
    d: 'M4.333,11.333H8.667V9.708C8.667,9.113 8.455,8.602 8.03,8.178C7.606,7.754 7.096,7.542 6.5,7.542C5.904,7.542 5.394,7.754 4.97,8.178C4.545,8.602 4.333,9.113 4.333,9.708V11.333ZM6.5,6.458C7.096,6.458 7.606,6.246 8.03,5.822C8.455,5.398 8.667,4.887 8.667,4.292V2.667H4.333V4.292C4.333,4.887 4.545,5.398 4.97,5.822C5.394,6.246 5.904,6.458 6.5,6.458ZM2.167,12.417V11.333H3.25V9.708C3.25,9.158 3.376,8.643 3.629,8.165C3.891,7.677 4.252,7.289 4.713,7C4.252,6.711 3.891,6.327 3.629,5.849C3.376,5.361 3.25,4.842 3.25,4.292V2.667H2.167V1.583H10.833V2.667H9.75V4.292C9.75,4.842 9.619,5.361 9.357,5.849C9.105,6.327 8.748,6.711 8.288,7C8.748,7.289 9.105,7.677 9.357,8.165C9.619,8.643 9.75,9.158 9.75,9.708V11.333H10.833V12.417H2.167Z',
    width: 13,
    height: 14,
  },
  unknown: {
    d: 'M0.542,11.875L6.5,1.583L12.458,11.875H0.542ZM2.41,10.792H10.59L6.5,3.75L2.41,10.792ZM6.5,10.25C6.653,10.25 6.78,10.2 6.879,10.101C6.988,9.993 7.042,9.862 7.042,9.708C7.042,9.555 6.988,9.428 6.879,9.329C6.78,9.221 6.653,9.167 6.5,9.167C6.347,9.167 6.216,9.221 6.107,9.329C6.008,9.428 5.958,9.555 5.958,9.708C5.958,9.862 6.008,9.993 6.107,10.101C6.216,10.2 6.347,10.25 6.5,10.25ZM5.958,8.625H7.042V5.917H5.958V8.625Z',
    width: 13,
    height: 14,
  },
};

/**
 * The status badge on the card (`CredentialStatusBadge`): valid and unknown are outlined in the card's text colour,
 * the others light red whatever the card colour.
 */
function StatusBadge({ status, ink }: { status: AndroidDetailsScreenProps['status']; ink: 'black' | 'white' }) {
  const icon = STATUS_ICON[status.value];
  return (
    <span className={`android-badge android-badge--${ANDROID_STATUS_STYLE[status.value]} android-badge--on-${ink}`} data-status={status.value}>
      <svg viewBox={`0 0 ${icon.width} ${icon.height}`} width={icon.width} height={icon.height} aria-hidden="true">
        <path d={icon.d} fill="currentColor" />
      </svg>
      {status.text}
    </span>
  );
}

/** `WalletTexts.ClusterHeadline`: a title by depth, or a spacer of the title's height when there is none. */
function Headline({ title, depth, nodeId }: { title?: string; depth: number; nodeId?: string }) {
  const level = depth === 0 ? 'section' : depth === 1 ? 'level1' : 'nested';
  if (!title?.trim()) return <div className={`android-headline-spacer android-headline-spacer--${level}`} aria-hidden="true" />;
  const Tag = depth === 0 ? 'h3' : depth === 1 ? 'h4' : 'h5';
  return (
    <Tag className={`android-headline android-headline--${level}`} data-node-id={nodeId}>
      <GroupTitle nodeId={nodeId}>{title}</GroupTitle>
    </Tag>
  );
}

interface RowContext {
  text: AndroidDetailsText;
  valueOptions: ValueOptions;
}

/**
 * `ClaimItem` for each row: a group draws its headline and then its rows one level deeper, with no divider after it;
 * a claim draws a divider unless it is the last row of its group. A section's rows always show their labels; a
 * group's rows hide them when it is a list of plain values.
 */
function Items({ rows, depth, showKey, context }: { rows: DetailsRow[]; depth: number; showKey: boolean; context: RowContext }) {
  return rows.map((row, index) =>
    row.kind === 'group' ? (
      <GroupItem key={index} group={row} depth={depth} context={context} />
    ) : (
      <ClaimRow key={index} claim={row} context={context} showKey={showKey} divider={index < rows.length - 1} />
    ),
  );
}

function GroupItem({ group, depth, context }: { group: DetailsGroup; depth: number; context: RowContext }) {
  const link = useDetailsLink();
  return (
    <div className="android-group" data-node-id={group.nodeId} data-path={JSON.stringify(group.path)} {...linkedProps(link, group.nodeId)}>
      <Headline title={group.title} depth={depth} nodeId={group.nodeId} />
      <Items rows={group.rows} depth={depth + 1} showKey={!group.valuesOnly} context={context} />
    </div>
  );
}

/** What TalkBack reads for a row: its texts, with the pill's content description. */
function accessibleName(claim: DetailsClaim, value: FormattedValue, text: AndroidDetailsText): string {
  let shown: string;
  if (value.kind === 'text') shown = value.text;
  else if (value.kind === 'placeholder') shown = value.type;
  else shown = t.detailsPreview.image;
  return [claim.label, shown, ...(claim.sensitive ? [text.sensitiveAlt] : [])].join(', ');
}

/** A Material list item: the label as overline, the value or image with the "Sensitive" pill on the right. */
function ClaimRow({ claim, context, showKey, divider }: { claim: DetailsClaim; context: RowContext; showKey: boolean; divider: boolean }) {
  const link = useDetailsLink();
  const value = formatClaim(claim, context.valueOptions);
  let content: ReactNode;
  switch (value.kind) {
    case 'text':
      content = <span className="android-claim__value">{value.text}</span>;
      break;
    case 'image':
      content = (
        <span className="android-claim__image">
          <img src={value.src} alt="" />
        </span>
      );
      break;
    case 'invalidImage':
      content = <span className="android-claim__value android-details__placeholder">{t.detailsPreview.invalidImage}</span>;
      break;
    case 'placeholder':
      content = <span className="android-claim__value android-details__placeholder">{value.type}</span>;
      break;
  }
  return (
    <div
      className="android-claim-row"
      {...rowProps(link, claim.attributeId)}
      aria-label={accessibleName(claim, value, context.text)}
      data-node-id={claim.attributeId}
      data-path={JSON.stringify(claim.path)}
      data-value={value.kind}
    >
      <div className={`android-item${showKey ? ' android-item--two-line' : ''}`}>
        {showKey && <span className="android-item__overline">{claim.label}</span>}
        <div className="android-claim__headline">
          {content}
          {claim.sensitive && <span className="android-badge android-badge--sensitive">{context.text.sensitive}</span>}
        </div>
      </div>
      {divider && <div className="android-details__divider" />}
    </div>
  );
}
