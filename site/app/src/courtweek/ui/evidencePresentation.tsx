import type { ExhibitPresentation } from '../model/schema'

type PresentationOf<K extends ExhibitPresentation['kind']> = Extract<ExhibitPresentation, { kind: K }>

function fields(items: Array<{ label: string; value: string }>) {
  return <dl>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
}

function route(presentation: PresentationOf<'route'>) {
  return (
    <div className="cw-exhibit cw-exhibit--route"><svg viewBox="0 0 800 500" role="img" aria-label={presentation.alt}>
      <path className="cw-route__shore" d="M40 88 C180 44 204 167 319 137 C406 114 447 40 571 61 L757 44 L757 474 L40 474 Z" />
      <path className="cw-route__line" d="M176 187 C303 226 402 294 624 351" />
      <circle className="cw-route__station" cx="176" cy="187" r="12" /><circle className="cw-route__beacon" cx="624" cy="351" r="14" />
      <text x="86" y="156">{presentation.origin}</text><text x="645" y="356">{presentation.destination}</text>
      <text className="cw-route__distance" x="342" y="270">{presentation.distance}</text>
      <text className="cw-route__disclaimer" x="400" y="455" textAnchor="middle">{presentation.disclaimer}</text>
    </svg></div>
  )
}

function audit(presentation: PresentationOf<'audit'>) {
  return (
    <div className="cw-exhibit cw-exhibit--system">
      <header><span>{presentation.heading}</span><span>{presentation.subheading}</span></header>
      <table><caption>{presentation.caption}</caption><thead><tr><th scope="col">System time</th><th scope="col">Recorded action</th></tr></thead>
        <tbody>{presentation.fields.map((item) => <tr key={item.label}><td>{item.label}</td><td>{item.value}</td></tr>)}</tbody>
      </table><p>{presentation.footer}</p>
    </div>
  )
}

function strip(presentation: PresentationOf<'strip'>) {
  return <div className="cw-exhibit cw-exhibit--strip"><p className="cw-strip__machine">{presentation.heading}</p>{fields(presentation.fields)}<p className="cw-strip__hand">{presentation.notation}</p><p className="cw-strip__limit">{presentation.footer}</p></div>
}

function ready(presentation: PresentationOf<'ready'>) {
  return (
    <div className="cw-exhibit cw-exhibit--ready"><header><span>{presentation.heading}</span><span>{presentation.subheading}</span></header>
      <section><p>{presentation.craft}</p><strong>{presentation.status}</strong><span>{presentation.statusMeaning}</span><b>{presentation.warningMarker}</b></section>
      <p>{presentation.footer}</p>
    </div>
  )
}

function warning(presentation: PresentationOf<'warning'>) {
  return <div className="cw-exhibit cw-exhibit--warning"><header>{presentation.heading}</header>{fields(presentation.fields)}<p>{presentation.footer}</p></div>
}

function survival(presentation: PresentationOf<'survival'>) {
  return (
    <div className="cw-exhibit cw-exhibit--survival"><header>{presentation.heading}</header><div className="cw-survival__tracks">
      {presentation.comparisons.map((item) => <section key={item.label}><span>{item.label}</span><strong>{item.value}</strong></section>)}
      </div><p>{presentation.footer}</p>
    </div>
  )
}

export function renderExhibitPresentation(presentation: ExhibitPresentation) {
  switch (presentation.kind) {
    case 'route': return route(presentation)
    case 'audit': return audit(presentation)
    case 'strip': return strip(presentation)
    case 'ready': return ready(presentation)
    case 'warning': return warning(presentation)
    case 'survival': return survival(presentation)
  }
}
