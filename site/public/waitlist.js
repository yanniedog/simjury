/**
 * Waitlist signup on the landing page.
 *
 * Progressive enhancement over a real <form>: without JavaScript the form still
 * posts to /api/waitlist, so the feature does not depend on this file loading.
 * Inline handlers are impossible anyway — the CSP is script-src 'self'.
 */
(function () {
  'use strict'

  var form = document.getElementById('waitlist-form')
  if (!form) return

  var email = document.getElementById('waitlist-email')
  var consent = document.getElementById('waitlist-consent')
  var submit = document.getElementById('waitlist-submit')
  var status = document.getElementById('waitlist-status')

  function say(message, kind) {
    status.textContent = message
    status.dataset.kind = kind
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault()

    var address = (email.value || '').trim()
    if (!address || !email.checkValidity()) {
      say('Enter an email address we can reach you at.', 'error')
      email.focus()
      return
    }
    if (!consent.checked) {
      say('Please tick the box so we know you want these emails.', 'error')
      consent.focus()
      return
    }

    submit.disabled = true
    say('Adding you…', 'pending')

    fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: address, consent: true }),
    })
      .then(function (response) {
        return response.json().catch(function () {
          return { ok: response.ok }
        })
      })
      .then(function (result) {
        if (result && result.ok) {
          // The server does not say whether this address was already on the
          // list, so neither does the page.
          form.reset()
          say('You are on the list. We will write when there is something worth reading.', 'ok')
          return
        }
        submit.disabled = false
        say(
          result && result.error === 'INVALID_EMAIL'
            ? 'That address does not look right — check it and try again.'
            : 'That did not go through. Please try again in a moment.',
          'error',
        )
      })
      .catch(function () {
        submit.disabled = false
        say('That did not go through. Please try again in a moment.', 'error')
      })
  })
})()
