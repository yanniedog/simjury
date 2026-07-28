// Enables the CSS entrance transitions once the document is parsed.
// External (not inline) so the CSP can use script-src 'self' with no 'unsafe-inline'.
document.documentElement.classList.add('ready');

const FICTION_DISCLOSURE_KEY = 'simjury:fiction-disclosure:v2';
const disclosure = document.getElementById('fiction-disclosure');
const disclosureAccept = document.getElementById('fiction-disclosure-accept');

function fictionDisclosureSeen() {
  try {
    return window.localStorage.getItem(FICTION_DISCLOSURE_KEY) === '1';
  } catch {
    // Storage can be blocked. Showing the gate is the safe default.
    return false;
  }
}

function dismissFictionDisclosure() {
  try {
    window.localStorage.setItem(FICTION_DISCLOSURE_KEY, '1');
  } catch {
    // The visitor can continue for this load even when storage cannot persist.
  }
  document.documentElement.classList.remove('entry-gate-open');
  if (typeof disclosure?.close === 'function') disclosure.close();
  else disclosure?.removeAttribute('open');
}

if (disclosure && disclosureAccept) {
  if (fictionDisclosureSeen()) {
    if (typeof disclosure.close === 'function') disclosure.close();
    else disclosure.removeAttribute('open');
  } else {
    document.documentElement.classList.add('entry-gate-open');
    if (typeof disclosure.showModal === 'function') {
      // The checked-in open attribute prevents a pre-script flash of un-gated content.
      disclosure.removeAttribute('open');
      disclosure.showModal();
    }
    disclosure.addEventListener('cancel', (event) => event.preventDefault());
    disclosure.addEventListener('keydown', (event) => {
      // There is one intentional action in the gate; keep fallback-dialog focus there.
      if (event.key === 'Tab') {
        event.preventDefault();
        disclosureAccept.focus();
      }
    });
    disclosureAccept.addEventListener('click', dismissFictionDisclosure);
    disclosureAccept.focus();
  }
}
