import { useEffect, useState, type FormEvent } from 'react'
import type {
  LocalProfile,
  LocalProfileInput,
  LocalProfileIssue,
  LocalProfilePersistence,
} from '../state/localProfile'

export interface LocalProfilePanelProps {
  profile: LocalProfile
  persistence: LocalProfilePersistence
  issue: LocalProfileIssue
  onChange: (profile: LocalProfileInput) => void
  onReset: () => void
  onOpenDeveloperPreview: () => void
  showAdultFictionAcknowledgement?: boolean
}

export function LocalProfilePanel({
  profile,
  persistence,
  issue,
  onChange,
  onReset,
  onOpenDeveloperPreview,
  showAdultFictionAcknowledgement = true,
}: LocalProfilePanelProps) {
  const [label, setLabel] = useState(profile.jurorLabel)
  const [expanded, setExpanded] = useState(
    showAdultFictionAcknowledgement && !profile.adultFictionAcknowledged,
  )
  useEffect(() => setLabel(profile.jurorLabel), [profile.jurorLabel])
  useEffect(() => {
    if (showAdultFictionAcknowledgement && !profile.adultFictionAcknowledged) setExpanded(true)
  }, [profile.adultFictionAcknowledged, showAdultFictionAcknowledgement])

  const update = (patch: Partial<LocalProfileInput>) => onChange({
    jurorLabel: profile.jurorLabel,
    adultFictionAcknowledged: profile.adultFictionAcknowledged,
    developerMode: profile.developerMode,
    ...patch,
  })
  const saveLabel = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    update({ jurorLabel: label })
  }

  return (
    <details
      className="cw-local-profile"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>Local profile <span>{profile.jurorLabel}</span></summary>
      <div className="cw-local-profile__body">
        <p><strong>No account.</strong> These settings stay in this browser.</p>
        <form className="cw-local-profile__label" onSubmit={saveLabel}>
          <label htmlFor="cw-juror-label">Juror label</label>
          <div className="cw-local-profile__label-row">
            <input
              id="cw-juror-label"
              type="text"
              value={label}
              maxLength={32}
              autoComplete="off"
              onChange={(event) => setLabel(event.target.value)}
            />
            <button type="submit">Save</button>
          </div>
        </form>
        {showAdultFictionAcknowledgement ? (
          <label className="cw-local-profile__choice">
            <input
              type="checkbox"
              checked={profile.adultFictionAcknowledged}
              onChange={(event) => update({
                adultFictionAcknowledged: event.target.checked,
                // Temporary pre-release: checking the adult gate restores unlock default.
                developerMode: event.target.checked,
              })}
            />
            <span>
              <strong>I am 18 or older and understand this case is fictional.</strong>
              <small>The case deals directly with a non-graphic death and serious criminal allegations.</small>
            </span>
          </label>
        ) : null}
        <fieldset className="cw-local-profile__testing">
          <legend>Live testing</legend>
          <label className="cw-local-profile__choice">
            <input
              type="checkbox"
              checked={profile.developerMode}
              disabled={!profile.adultFictionAcknowledged}
              onChange={(event) => update({ developerMode: event.target.checked })}
            />
            <span>
              <strong>Developer mode</strong>
              <small>Temporarily on by default. Reveals controls for sessions that have not opened yet. This is not authentication.</small>
            </span>
          </label>
          {profile.adultFictionAcknowledged && profile.developerMode ? (
            <div className="cw-local-profile__warning">
              <p><strong>Spoiler warning:</strong> the preview can reveal every future session and verdict path.</p>
              <button type="button" onClick={onOpenDeveloperPreview}>Open all-session preview</button>
            </div>
          ) : null}
        </fieldset>
        {issue ? (
          <p className="cw-error" role="status">
            {issue === 'corrupt'
              ? 'Damaged local settings were ignored. Developer mode was reset to the temporary default (on).'
              : 'Local storage is unavailable. Settings last only in this tab.'}
          </p>
        ) : persistence === 'memory' ? (
          <p className="cw-error" role="status">Settings last only in this tab.</p>
        ) : null}
        <button type="button" onClick={onReset}>Reset local profile</button>
      </div>
    </details>
  )
}
