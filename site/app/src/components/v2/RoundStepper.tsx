import type { DeliberationState } from '../../engine/deliberation'

/** Where the room is in its three rounds, and whether hands have gone up. */
function roundIndex(phase: DeliberationState['phase']): number {
  if (phase === 'open_1') return 0
  if (phase === 'open_2') return 1
  if (phase === 'open_3' || phase === 'mid_vote') return 2
  return 3
}

export function RoundStepper({
  phase,
  done,
}: {
  phase: DeliberationState['phase']
  done: boolean
}) {
  const idx = done ? 4 : roundIndex(phase)
  const handsDone = done || phase === 'open_3' || phase === 'final_vote'
  const steps = [
    { key: 'r1', label: '1', title: 'First point', complete: idx > 0, current: idx === 0 },
    { key: 'r2', label: '2', title: 'Second point', complete: idx > 1, current: idx === 1 },
    {
      key: 'hands',
      label: '···',
      title: 'Private hands',
      complete: handsDone,
      current: false,
      soft: true,
    },
    { key: 'r3', label: '3', title: 'Final point', complete: idx > 2, current: idx === 2 },
    { key: 'you', label: 'You', title: 'Your position', complete: done, current: idx === 3 && !done },
  ]
  return (
    <ol className="round-stepper" aria-label="Deliberation progress">
      {steps.map((step) => (
        <li
          key={step.key}
          className={`round-step${step.complete ? ' complete' : ''}${step.current ? ' current' : ''}${step.soft ? ' soft' : ''}`}
          aria-current={step.current ? 'step' : undefined}
        >
          <span className="round-step-mark" aria-hidden="true">
            {step.complete && !step.soft ? '✓' : step.label}
          </span>
          <span className="sr-only">{step.title}</span>
        </li>
      ))}
    </ol>
  )
}

