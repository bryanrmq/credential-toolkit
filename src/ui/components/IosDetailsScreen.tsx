import { CaretRightIcon, DotsThreeIcon, XIcon } from '@phosphor-icons/react';
import type { CSSProperties, ReactNode } from 'react';
import type { CredentialDetails, DetailsClaim, DetailsGroup } from '../../core/card/details';
import { type CredentialStatus, IOS_STATUS_STYLE, type IosDetailsText } from '../../core/card/detailsChrome';
import { type FormattedValue, type ValueOptions, formatClaim } from '../../core/card/values';
import type { Ink } from '../../core/card/profiles';
import { t } from '../../strings';
import { CardLogo } from './cardParts';
import { CredentialCard, type CredentialCardProps } from './CredentialCard';

/** The width of the phone screen the wallet is drawn on, in points: the 361 pt card plus its 16 pt margins. */
export const IOS_SCREEN_WIDTH = 393;

export interface IosDetailsScreenProps {
  /** Accessible name of the screen, e.g. "iOS details screen". */
  label: string;
  /** The app's appearance: light or dark mode. */
  theme: 'light' | 'dark';
  /** The navigation bar title, the credential's name; empty draws none. */
  title: string;
  /** The large card at the top, without its badges. */
  card: Omit<CredentialCardProps, 'scale' | 'badges'>;
  status: { value: CredentialStatus; text: string };
  details: CredentialDetails;
  /** The wallet's own texts in the app language. */
  text: IosDetailsText;
  valueOptions: ValueOptions;
  /** The "Issued by" row. The wallet reads it from the issuer metadata; a missing name draws a placeholder. */
  issuer: { name?: string; logo?: string };
  /** CSS zoom factor that fits the screen into the available width. */
  scale?: number;
}

/**
 * The iOS wallet's credential details screen (`CredentialDetailView`, portrait): navigation bar, the large card with
 * its status badge, the claim sections (`ClaimClusterList`, `ChildClusterView`, `ClaimCell`) and "Issued by". Sizes and
 * colours are the wallet's, in points; the wallet's ABC Diatype fonts are replaced by the app's.
 *
 * Every claim row and group carries `data-node-id` (the attribute or group link it comes from) and `data-path` (its
 * claims path), so other views can point at it.
 */
export function IosDetailsScreen({ label, theme, title, card, status, details, text, valueOptions, issuer, scale = 1 }: IosDetailsScreenProps) {
  const context: RowContext = { text, valueOptions };
  return (
    <div className={`ios-details ios-details--${theme}`} role="region" aria-label={label} style={{ zoom: scale } as CSSProperties}>
      <div className="ios-details__bar" aria-hidden="true">
        <DotsThreeIcon size={22} weight="bold" />
        <span className="ios-details__title">{title}</span>
        <XIcon size={20} />
      </div>
      <div className="ios-details__content">
        <div className="ios-details__card">
          <CredentialCard {...card} badges={<StatusBadge status={status} ink={card.ink} />} />
        </div>
        {details.sections.map((section, index) => (
          <Section key={index} title={section.title} nodeId={section.nodeId}>
            <SectionRows section={section} context={context} />
          </Section>
        ))}
        <Section title={text.issuedBy}>
          <div className="ios-details__issuer">
            <CardLogo logo={issuer.logo} ink={theme === 'dark' ? 'white' : 'black'} className="ios-details__issuer-logo" />
            {issuer.name ? (
              <span>{issuer.name}</span>
            ) : (
              <span className="ios-details__placeholder">{t.detailsPreview.issuerPlaceholder}</span>
            )}
          </div>
          <div className="ios-details__divider" />
          <div className="ios-claim ios-claim--trailing">
            <div className="ios-claim__text">
              <span className="ios-claim__key">{text.issuanceType}</span>
              <span className="ios-claim__value">{text.standard}</span>
            </div>
            <CaretRightIcon size={14} aria-hidden="true" />
          </div>
        </Section>
      </div>
    </div>
  );
}

/** The status icons from the wallet's assets (`Status*.imageset`, template images), drawn in the badge's text colour. */
const INVALID_ICON =
  'M7 14.8333C6.19306 14.8333 5.43472 14.6826 4.725 14.3812C4.01528 14.0701 3.39792 13.6521 2.87292 13.1271C2.34792 12.6021 1.92986 11.9847 1.61875 11.275C1.31736 10.5653 1.16667 9.80694 1.16667 9C1.16667 8.19306 1.31736 7.43472 1.61875 6.725C1.92986 6.01528 2.34792 5.39792 2.87292 4.87292C3.39792 4.34792 4.01528 3.93472 4.725 3.63333C5.43472 3.32222 6.19306 3.16667 7 3.16667C7.80694 3.16667 8.56528 3.32222 9.275 3.63333C9.98472 3.93472 10.6021 4.34792 11.1271 4.87292C11.6521 5.39792 12.0653 6.01528 12.3667 6.725C12.6778 7.43472 12.8333 8.19306 12.8333 9C12.8333 9.80694 12.6778 10.5653 12.3667 11.275C12.0653 11.9847 11.6521 12.6021 11.1271 13.1271C10.6021 13.6521 9.98472 14.0701 9.275 14.3812C8.56528 14.6826 7.80694 14.8333 7 14.8333ZM7 13.6667C7.525 13.6667 8.03056 13.584 8.51667 13.4187C9.00278 13.2437 9.45 12.9958 9.85833 12.675L3.325 6.14167C3.00417 6.55 2.75625 6.99722 2.58125 7.48333C2.41597 7.96944 2.33333 8.475 2.33333 9C2.33333 10.3028 2.78542 11.4062 3.68958 12.3104C4.59375 13.2146 5.69722 13.6667 7 13.6667ZM10.675 11.8583C10.9958 11.45 11.2389 11.0028 11.4042 10.5167C11.5792 10.0306 11.6667 9.525 11.6667 9C11.6667 7.69722 11.2146 6.59375 10.3104 5.68958C9.40625 4.78542 8.30278 4.33333 7 4.33333C6.475 4.33333 5.96944 4.42083 5.48333 4.59583C4.99722 4.76111 4.55 5.00417 4.14167 5.325L10.675 11.8583Z';

const STATUS_ICON: Record<CredentialStatus, string> = {
  valid:
    'M5.57083 12.5L2.24583 9.175L3.07708 8.34375L5.57083 10.8375L10.9229 5.48542L11.7542 6.31667L5.57083 12.5Z',
  invalid: INVALID_ICON,
  revoked: INVALID_ICON,
  suspended:
    'M7 9V2.58333H8.16667V9H7ZM4.66667 9V3.16667H5.83333V9H4.66667ZM7.29167 15.4167C5.91111 15.4167 4.73958 14.9354 3.77708 13.9729C2.81458 13.0104 2.33333 11.8389 2.33333 10.4583V4.33333H3.5V10.4583C3.5 11.5181 3.86458 12.4174 4.59375 13.1562C5.33264 13.8854 6.23194 14.25 7.29167 14.25C8.35139 14.25 9.24583 13.8854 9.975 13.1562C10.7139 12.4174 11.0833 11.5181 11.0833 10.4583V8.41667C10.9181 8.41667 10.7771 8.475 10.6604 8.59167C10.5535 8.69861 10.5 8.83472 10.5 9V11.3333H8.75C8.42917 11.3333 8.15208 11.45 7.91875 11.6833C7.69514 11.9069 7.58333 12.1792 7.58333 12.5V13.0833H6.41667V12.5C6.41667 11.8583 6.64514 11.309 7.10208 10.8521C7.55903 10.3951 8.10833 10.1667 8.75 10.1667H9.33333V8.50417V3.75H10.5V7.35208C10.5972 7.32292 10.6896 7.29861 10.7771 7.27917C10.8743 7.25972 10.9764 7.25 11.0833 7.25H12.25V10.4583C12.25 11.8389 11.7688 13.0104 10.8063 13.9729C9.84375 14.9354 8.67222 15.4167 7.29167 15.4167Z',
  notYetValid:
    'M3.25 7.85425C2.87083 7.85425 2.55035 7.72334 2.28854 7.46154C2.02674 7.19973 1.89583 6.87925 1.89583 6.50008C1.89583 6.12091 2.02674 5.80043 2.28854 5.53862C2.55035 5.27682 2.87083 5.14591 3.25 5.14591C3.62917 5.14591 3.94965 5.27682 4.21146 5.53862C4.47326 5.80043 4.60417 6.12091 4.60417 6.50008C4.60417 6.87925 4.47326 7.19973 4.21146 7.46154C3.94965 7.72334 3.62917 7.85425 3.25 7.85425ZM0 10.8334V1.08341H1.625V8.11219e-05H2.70833V1.08341H7.04167V8.11219e-05H8.125V1.08341H9.75V10.8334H0ZM1.08333 9.75008H8.66667V4.33341H1.08333V9.75008ZM1.08333 3.25008H8.66667V2.16675H1.08333V3.25008ZM1.08333 3.25008V2.16675V3.25008Z',
  unknown:
    'M0.583333 14.25L7 3.16667L13.4167 14.25H0.583333ZM2.59583 13.0833H11.4042L7 5.5L2.59583 13.0833ZM7 12.5C7.16528 12.5 7.30139 12.4465 7.40833 12.3396C7.525 12.2229 7.58333 12.0819 7.58333 11.9167C7.58333 11.7514 7.525 11.6153 7.40833 11.5083C7.30139 11.3917 7.16528 11.3333 7 11.3333C6.83472 11.3333 6.69375 11.3917 6.57708 11.5083C6.47014 11.6153 6.41667 11.7514 6.41667 11.9167C6.41667 12.0819 6.47014 12.2229 6.57708 12.3396C6.69375 12.4465 6.83472 12.5 7 12.5ZM6.41667 10.75H7.58333V7.83333H6.41667V10.75Z',
};

/**
 * The status badge on the card (`CredentialStatusBadge`, filled). The card's content takes the colour scheme its
 * text suggests, so a card with white text gets the dark-mode badge colours.
 */
function StatusBadge({ status, ink }: { status: IosDetailsScreenProps['status']; ink: Ink }) {
  return (
    <span className={`ios-badge ios-badge--${IOS_STATUS_STYLE[status.value]} ios-badge--on-${ink}`} data-status={status.value}>
      <svg viewBox="0 0 14 18" width="14" height="18" aria-hidden="true">
        <path
          d={STATUS_ICON[status.value]}
          fill="currentColor"
          transform={status.value === 'notYetValid' ? 'translate(2.125 3.5833)' : undefined}
        />
      </svg>
      {status.text}
    </span>
  );
}

/** `SectionView`: an optional title above a white card with rounded corners. */
function Section({ title, nodeId, children }: { title?: string; nodeId?: string; children: ReactNode }) {
  return (
    <section className="ios-section" aria-label={title} data-node-id={nodeId}>
      {title && <h3 className="ios-section__title">{title}</h3>}
      <div className="ios-section__body">{children}</div>
    </section>
  );
}

interface RowContext {
  text: IosDetailsText;
  valueOptions: ValueOptions;
}

/** `ClaimClusterList.sectionView`: each item is inset by 24 pt and gets the default stack spacing. */
function SectionRows({ section, context }: { section: DetailsGroup; context: RowContext }) {
  const { rows } = section;
  return rows.map((row, index) => (
    <div key={index} className="ios-section__item">
      {row.kind === 'claim' ? (
        <ClaimRow
          claim={row}
          context={context}
          showKey={!section.valuesOnly}
          divider={index < rows.length - 1}
          afterGroup={index > 0 && rows[index - 1].kind === 'group'}
        />
      ) : (
        <>
          {row.title && (
            <h4 className="ios-group__title ios-group__title--level1" data-node-id={row.nodeId}>
              {row.title}
            </h4>
          )}
          <ChildGroup
            group={row}
            context={context}
            showLastDivider={index < rows.length - 1}
            // Quirk copied: the extra space depends on the group's own title here, on its parent's in ChildClusterView.
            spaced={index > 0 && !row.title ? 32 : 0}
          />
        </>
      )}
    </div>
  ));
}

/** `ChildClusterView`: a group's rows in the same card, without indentation. */
function ChildGroup({ group, context, showLastDivider, spaced }: { group: DetailsGroup; context: RowContext; showLastDivider: boolean; spaced: number }) {
  const { rows } = group;
  return (
    <div className="ios-group" data-node-id={group.nodeId} data-path={JSON.stringify(group.path)} style={spaced ? { paddingTop: spaced } : undefined}>
      {rows.map((row, index) =>
        row.kind === 'claim' ? (
          <ClaimRow
            key={index}
            claim={row}
            context={context}
            showKey={!group.valuesOnly}
            divider={index < rows.length - 1 || showLastDivider}
            afterGroup={index > 0 && rows[index - 1].kind === 'group'}
          />
        ) : (
          <div key={index}>
            {row.title && (
              <h5 className="ios-group__title ios-group__title--nested" data-node-id={row.nodeId}>
                {row.title}
              </h5>
            )}
            <ChildGroup group={row} context={context} showLastDivider={index < rows.length - 1 || showLastDivider} spaced={index > 0 && !group.title ? 24 : 0} />
          </div>
        ),
      )}
    </div>
  );
}

/** What VoiceOver reads for a row (`CredentialClaimViewModel.accessibilityValueLabel`). */
function accessibleName(claim: DetailsClaim, value: FormattedValue, text: IosDetailsText): string {
  let shown: string;
  if (value.kind === 'text') shown = value.text === '' || value.text === '–' ? text.empty : value.text;
  else if (value.kind === 'placeholder') shown = value.type;
  else shown = t.detailsPreview.image;
  return [claim.label, shown, ...(claim.sensitive ? [text.sensitiveAlt] : [])].join(', ');
}

/** `ClaimCell`: the label above the value or image, the "Sensitive" pill on the right, then a divider. */
function ClaimRow({
  claim,
  context,
  showKey,
  divider,
  afterGroup,
}: {
  claim: DetailsClaim;
  context: RowContext;
  showKey: boolean;
  divider: boolean;
  afterGroup: boolean;
}) {
  const value = formatClaim(claim, context.valueOptions);
  let content: ReactNode;
  switch (value.kind) {
    case 'text':
      content = <span className="ios-claim__value">{value.text}</span>;
      break;
    case 'image':
      content = (
        <span className="ios-claim__image">
          <img src={value.src} alt="" />
        </span>
      );
      break;
    case 'invalidImage':
      content = <span className="ios-claim__value ios-details__placeholder">{t.detailsPreview.invalidImage}</span>;
      break;
    case 'placeholder':
      content = <span className="ios-claim__value ios-details__placeholder">{value.type}</span>;
      break;
  }
  return (
    <div
      className="ios-claim-row"
      role="group"
      aria-label={accessibleName(claim, value, context.text)}
      data-node-id={claim.attributeId}
      data-path={JSON.stringify(claim.path)}
      data-value={value.kind}
      style={afterGroup ? { paddingTop: 16 } : undefined}
    >
      <div className={`ios-claim${value.kind === 'image' ? ' ios-claim--image' : ''}`}>
        <div className="ios-claim__text">
          {showKey && <span className="ios-claim__key">{claim.label}</span>}
          {content}
        </div>
        {claim.sensitive && <span className="ios-badge ios-badge--sensitive">{context.text.sensitive}</span>}
      </div>
      {divider && <div className="ios-details__divider" />}
    </div>
  );
}
