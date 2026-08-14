import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CourtSheet } from '../../../src/courtweek/ui/CourtSheet'
import '../../../src/courtweek/courtweek.css'

export function Fixture() {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  return <main className="cw-shell">
    <div className="cw-stage" aria-hidden={open || undefined} {...(open ? { inert: '' } : {})}>
      <button ref={trigger} type="button" onClick={() => setOpen(true)}>Open court sheet</button>
    </div>
    {open ? <CourtSheet
      title="Your working papers"
      kicker="Juror desk"
      returnFocusTo={trigger.current}
      onClose={() => setOpen(false)}
      footer={<><button type="button">Save changes</button><button type="button">Cancel</button></>}
    >
      {Array.from({ length: 18 }, (_, index) => <p key={index}>Reviewed court material {index + 1} remains available.</p>)}
      <button type="button">Inspect item</button>
    </CourtSheet> : null}
  </main>
}

createRoot(document.getElementById('root')!).render(<Fixture />)
