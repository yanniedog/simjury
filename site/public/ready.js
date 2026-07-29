// Enables the CSS entrance transitions once the document is parsed.
// External (not inline) so the CSP can use script-src 'self' with no 'unsafe-inline'.
document.documentElement.classList.add('ready');

const FICTION_DISCLOSURE_KEY = 'simjury:fiction-disclosure:v2';
const disclosure = document.getElementById('fiction-disclosure');
const disclosureAccept = document.getElementById('fiction-disclosure-accept');
const disclosureLeave = document.getElementById('fiction-disclosure-leave');

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
    const focusables = [disclosureAccept, disclosureLeave].filter(Boolean);
    disclosure.addEventListener('cancel', (event) => event.preventDefault());
    disclosure.addEventListener('keydown', (event) => {
      // Keep Tab cycling inside the gate's two intentional actions.
      if (event.key !== 'Tab' || focusables.length === 0) return;
      event.preventDefault();
      const active = document.activeElement;
      const index = focusables.indexOf(active);
      const next = event.shiftKey
        ? (index <= 0 ? focusables.length - 1 : index - 1)
        : (index >= focusables.length - 1 || index < 0 ? 0 : index + 1);
      focusables[next].focus();
    });
    disclosureAccept.addEventListener('click', dismissFictionDisclosure);
    disclosureAccept.focus();
  }
}
