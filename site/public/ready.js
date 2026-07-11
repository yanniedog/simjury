// Enables the CSS entrance transitions once the document is parsed.
// External (not inline) so the CSP can use script-src 'self' with no 'unsafe-inline'.
document.documentElement.classList.add('ready');
