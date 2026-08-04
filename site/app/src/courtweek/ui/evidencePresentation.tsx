import type { ReactNode } from 'react'

export type ReviewedExhibitId =
  | 'ex-route'
  | 'ex-audit-log'
  | 'ex-launch-strip'
  | 'ex-ready-display'
  | 'ex-warning'
  | 'ex-survival'

export interface ExhibitPresentation {
  id: ReviewedExhibitId
  label: string
  alt: string
  ambiguity: string
  rendering: ReactNode
}

function routeDiagram() {
  return (
    <div className="cw-exhibit cw-exhibit--route">
      <svg viewBox="0 0 800 500" role="img" aria-labelledby="route-title route-description">
        <title id="route-title">Harbour service route from North Station to beacon AR-71</title>
        <desc id="route-description">A simplified service chart shows an ordinary route of eleven nautical miles. It does not show weather, visibility, sea state or survival time.</desc>
        <path className="cw-route__shore" d="M40 88 C180 44 204 167 319 137 C406 114 447 40 571 61 L757 44 L757 474 L40 474 Z" />
        <path className="cw-route__line" d="M176 187 C303 226 402 294 624 351" />
        <circle className="cw-route__station" cx="176" cy="187" r="12" />
        <circle className="cw-route__beacon" cx="624" cy="351" r="14" />
        <text x="86" y="156">North Station</text>
        <text x="645" y="356">Beacon AR-71</text>
        <text className="cw-route__distance" x="342" y="270">ordinary route · 11 nautical miles</text>
        <text className="cw-route__disclaimer" x="400" y="455" textAnchor="middle">SERVICE DIAGRAM · CONDITIONS NOT REPRESENTED</text>
      </svg>
    </div>
  )
}

function auditLog() {
  return (
    <div className="cw-exhibit cw-exhibit--system">
      <header><span>INCIDENT AR-71</span><span>Authenticated controller session</span></header>
      <table>
        <caption>Recorded console actions</caption>
        <thead><tr><th scope="col">System time</th><th scope="col">Recorded action</th></tr></thead>
        <tbody>
          <tr><td>21:16:08</td><td>Incident accepted</td></tr>
          <tr><td>21:16:31</td><td>Priority 2 changed to Priority 3</td></tr>
          <tr><td>21:16:36</td><td>Priority change confirmed</td></tr>
          <tr><td>21:27:29</td><td>Kestrel released</td></tr>
        </tbody>
      </table>
      <p>Clock verified within two seconds. Actions are recorded; reasons and state of mind are not.</p>
    </div>
  )
}

function launchStrip() {
  return (
    <div className="cw-exhibit cw-exhibit--strip">
      <p className="cw-strip__machine">ASTER REACH COORDINATION · LAUNCH STRIP</p>
      <dl>
        <div><dt>Beacon</dt><dd>AR-71</dd></div>
        <div><dt>Craft</dt><dd>KESTREL</dd></div>
        <div><dt>Status</dt><dd>ACCEPTED</dd></div>
      </dl>
      <p className="cw-strip__hand">hold—readiness</p>
      <p className="cw-strip__limit">The handwritten notation has no recorded time and does not state why it was written.</p>
    </div>
  )
}

function readyDisplay() {
  return (
    <div className="cw-exhibit cw-exhibit--ready">
      <header><span>NORTH STATION</span><span>CRAFT STATUS</span></header>
      <section aria-label="Kestrel status tile">
        <p>KESTREL</p>
        <strong>READY</strong>
        <span>CREWED · LAUNCH-CAPABLE</span>
        <b aria-label="Separate warning detail available">!</b>
      </section>
      <p>READY does not mean free from maintenance warnings. Warning detail appeared on a separate page.</p>
    </div>
  )
}

function warningRecord() {
  return (
    <div className="cw-exhibit cw-exhibit--warning">
      <header>KESTREL · PRE-SHIFT ENGINEERING ENTRY</header>
      <dl>
        <div><dt>System</dt><dd>Steering pressure</dd></div>
        <div><dt>Observation</dt><dd>Intermittent fluctuation</dd></div>
        <div><dt>Instruction</dt><dd>Monitor on launch; abort for sustained pressure loss.</dd></div>
        <div><dt>Launch status</dt><dd>Permitted with monitoring</dd></div>
      </dl>
      <p>The entry records a genuine warning. It did not ground Kestrel or prescribe an eleven-minute diagnostic.</p>
    </div>
  )
}

function survivalWindow() {
  return (
    <div className="cw-exhibit cw-exhibit--survival">
      <header>COMPARATIVE SURVIVAL-WINDOW OPINION</header>
      <div className="cw-survival__tracks">
        <section>
          <span>Dispatch at 21:16</span>
          <strong>Probably inside a medically significant window</strong>
        </section>
        <section>
          <span>Dispatch at 21:27</span>
          <strong>Probably outside that window</strong>
        </section>
      </div>
      <p>Both comparisons depend on route, immersion-time and uninterrupted-travel assumptions. Earlier dispatch cannot be said to guarantee survival, and an exact time of death cannot be identified.</p>
    </div>
  )
}

export const REVIEWED_EXHIBIT_PRESENTATIONS: Readonly<Record<ReviewedExhibitId, ExhibitPresentation>> = {
  'ex-route': {
    id: 'ex-route',
    label: 'Harbour route diagram',
    alt: 'Simplified service chart showing North Station and beacon AR-71 joined by an ordinary route labelled eleven nautical miles; weather and survival conditions are not depicted.',
    ambiguity: 'The diagram establishes distance and route only, not conditions or outcome.',
    rendering: routeDiagram(),
  },
  'ex-audit-log': {
    id: 'ex-audit-log',
    label: 'Incident audit log',
    alt: 'Four authenticated console entries show acceptance at 21:16:08, a priority change and confirmation, and Kestrel release at 21:27:29.',
    ambiguity: 'The system records account actions and timing, not the operator’s reasons or state of mind.',
    rendering: auditLog(),
  },
  'ex-launch-strip': {
    id: 'ex-launch-strip',
    label: 'Yellow launch strip',
    alt: 'Yellow printed launch strip for AR-71 and Kestrel with the handwritten words hold—readiness; the handwriting has no recorded time or explanation.',
    ambiguity: 'The notation does not establish when it was written or what the writer meant.',
    rendering: launchStrip(),
  },
  'ex-ready-display': {
    id: 'ex-ready-display',
    label: 'Kestrel readiness display',
    alt: 'Kestrel’s main status tile reads READY, meaning crewed and launch-capable, with an indicator that separate warning detail was available.',
    ambiguity: 'READY did not certify freedom from warnings or decide whether dispatch was reasonable.',
    rendering: readyDisplay(),
  },
  'ex-warning': {
    id: 'ex-warning',
    label: 'Kestrel steering warning record',
    alt: 'Pre-shift engineering record notes intermittent steering-pressure fluctuation and directs monitoring on launch with abort only for sustained pressure loss.',
    ambiguity: 'The warning was genuine but did not prohibit launch or prescribe the duration of a hold.',
    rendering: warningRecord(),
  },
  'ex-survival': {
    id: 'ex-survival',
    label: 'Survival-window opinion',
    alt: 'A qualitative comparison says dispatch at 21:16 was probably inside a medically significant window and dispatch at 21:27 probably outside it, subject to stated assumptions.',
    ambiguity: 'The opinion gives probabilities, not an exact death time or a guarantee that earlier dispatch would have saved Ilan Saye.',
    rendering: survivalWindow(),
  },
}

export function isReviewedExhibitId(id: string): id is ReviewedExhibitId {
  return Object.prototype.hasOwnProperty.call(REVIEWED_EXHIBIT_PRESENTATIONS, id)
}

export function reviewedExhibitPresentation(id: ReviewedExhibitId): ExhibitPresentation {
  return REVIEWED_EXHIBIT_PRESENTATIONS[id]
}
