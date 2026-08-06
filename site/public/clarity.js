(function () {
  'use strict';

  const PROJECT_ID = 'xy3peca8h4';
  const OPT_OUT_KEY = 'simjury:clarity-opt-out:v1';
  let clarityLoaded = false;

  function optedOut() {
    try {
      return window.localStorage.getItem(OPT_OUT_KEY) === '1';
    } catch {
      return false;
    }
  }

  function rememberOptOut(value) {
    try {
      if (value) window.localStorage.setItem(OPT_OUT_KEY, '1');
      else window.localStorage.removeItem(OPT_OUT_KEY);
    } catch {
      // Clarity can still honor the choice for this page when storage is blocked.
    }
  }

  function queueClarity() {
    window.clarity = window.clarity || function () {
      (window.clarity.q = window.clarity.q || []).push(arguments);
    };
  }

  function consent(analyticsStorage) {
    queueClarity();
    window.clarity('consentv2', {
      ad_Storage: 'denied',
      analytics_Storage: analyticsStorage,
    });
  }

  function startClarity() {
    if (clarityLoaded || optedOut()) return;
    clarityLoaded = true;
    consent('granted');
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.clarity.ms/tag/${PROJECT_ID}`;
    document.head.appendChild(script);
    if (navigator.webdriver) window.clarity('set', 'synthetic-qa', 'true');
  }

  function updateControls() {
    const disabled = optedOut();
    document.querySelectorAll('[data-clarity-status]').forEach((node) => {
      node.textContent = disabled
        ? 'Optional analytics is disabled in this browser.'
        : 'Optional analytics is enabled in this browser.';
    });
    document.querySelectorAll('[data-clarity-opt-out]').forEach((node) => {
      node.hidden = disabled;
    });
    document.querySelectorAll('[data-clarity-opt-in]').forEach((node) => {
      node.hidden = !disabled;
    });
  }

  function disableClarity() {
    rememberOptOut(true);
    if (window.clarity) {
      consent('denied');
      window.clarity('consent', false);
    }
    updateControls();
  }

  function enableClarity() {
    rememberOptOut(false);
    consent('granted');
    if (clarityLoaded) window.clarity('consent', true);
    startClarity();
    updateControls();
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-clarity-opt-out]').forEach((node) => {
      node.addEventListener('click', disableClarity);
    });
    document.querySelectorAll('[data-clarity-opt-in]').forEach((node) => {
      node.addEventListener('click', enableClarity);
    });
    updateControls();
  });

  if (!optedOut()) startClarity();
}());
