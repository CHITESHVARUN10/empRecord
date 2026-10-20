import { Check, HardDrive, Lock } from 'lucide-react';
import { BrandMark } from '../../components/BrandMark';

export const FORM_SECTIONS = [
  { id: 'personal', number: '01', label: 'Personal details' },
  { id: 'identity', number: '02', label: 'Identity documents' },
  { id: 'address', number: '03', label: 'Address and contact' },
  { id: 'emergency', number: '04', label: 'Emergency contact' },
] as const;

export type FormSectionId = (typeof FORM_SECTIONS)[number]['id'];

type DraftState = 'idle' | 'saving' | 'saved' | 'saved-text' | 'error';

type SectionRailProps = {
  activeSection: string;
  completed: Record<FormSectionId, boolean>;
  draftState: DraftState;
  draftSavedAt?: number;
  onNavigate: (id: FormSectionId) => void;
  showNavigation?: boolean;
  showDraftNote?: boolean;
};

function draftLabel(state: DraftState, savedAt?: number): string {
  if (state === 'saving') return 'Saving draft on this device';
  if (state === 'saved') {
    return savedAt
      ? `Draft saved at ${new Date(savedAt).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
        })}`
      : 'Draft saved on this device';
  }
  if (state === 'saved-text') {
    return 'Draft text saved. Reattach documents after reload.';
  }
  if (state === 'error') return 'Draft could not be saved';
  return 'Your progress saves on this device';
}

export function SectionRail({
  activeSection,
  completed,
  draftState,
  draftSavedAt,
  onNavigate,
  showNavigation = true,
  showDraftNote = true,
}: SectionRailProps) {
  return (
    <aside className="public-rail">
      <div className="public-rail__brand">
        <BrandMark />
        <div className="public-rail__brand-copy">
          <span className="eyebrow">Blaupunkt</span>
          <h1>Employee master record</h1>
          <p>
            One complete record for every member of the team. Fields marked with
            an asterisk are required.
          </p>
        </div>
      </div>

      {showNavigation ? (
        <nav className="section-nav" aria-label="Form sections">
          <span className="section-nav__label">Sections</span>
          <ol>
            {FORM_SECTIONS.map((section) => {
              const isActive = activeSection === section.id;
              const isComplete = completed[section.id];
              return (
                <li key={section.id}>
                  <a
                    href={`#section-${section.id}`}
                    className="section-nav__link"
                    data-active={isActive}
                    onClick={(event) => {
                      event.preventDefault();
                      onNavigate(section.id);
                    }}
                  >
                    <span className="section-nav__number">
                      {section.number}
                    </span>
                    <span className="section-nav__text">{section.label}</span>
                    <span
                      className="section-nav__state"
                      data-complete={isComplete}
                      aria-hidden="true"
                    >
                      {isComplete ? <Check size={12} /> : <span />}
                    </span>
                    <span className="sr-only">
                      {isComplete ? 'Complete' : 'Incomplete'}
                    </span>
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}

      {showDraftNote ? (
        <div className="rail-note" data-state={draftState}>
          <HardDrive size={15} aria-hidden="true" />
          <span>{draftLabel(draftState, draftSavedAt)}</span>
        </div>
      ) : null}

      <div className="rail-note rail-note--quiet">
        <Lock size={15} aria-hidden="true" />
        <span>
          Your details are visible only to the Blaupunkt HR administrator.
        </span>
      </div>

      <a className="rail-admin-link" href="/admin/login">
        Administrator sign in
      </a>
    </aside>
  );
}
