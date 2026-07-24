export function NarratorCue({ text }: { text: string }) {
  return (
    <aside className="narrator-cue" aria-label="Narrator">
      <p className="chrome-label">Narrator</p>
      <p>{text}</p>
    </aside>
  )
}
