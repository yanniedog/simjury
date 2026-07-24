export function NarratorCue({ text }: { text: string }) {
  return (
    <aside className="narrator-cue" aria-label="Narrator" aria-live="polite">
      <p className="chrome-label">Narrator</p>
      <p>{text}</p>
    </aside>
  )
}
