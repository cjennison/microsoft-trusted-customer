'use strict';

(function (root) {
  const registryPattern = /^https:\/\/[a-z0-9-]+\.crm[0-9]*\.dynamics\.com$/;

  function registryOrigin(search) {
    const value = new URLSearchParams(search ?? '').get('registry') ?? '';
    return registryPattern.test(value) ? value : null;
  }

  function senderTargets(address) {
    const normalized = (address ?? '').trim().toLowerCase();
    const at = normalized.lastIndexOf('@');
    if (at < 1 || at !== normalized.indexOf('@') || at === normalized.length - 1 ||
        /\s/.test(normalized) || normalized.length > 320) return null;
    return { address: normalized, domain: normalized.slice(at + 1) };
  }

  function registryLink(origin, type, target) {
    const url = new URL('/WebResources/mtc_/registrar/index.html', origin);
    url.searchParams.set('type', type);
    url.searchParams.set('target', target);
    return url.href;
  }

  function render(document, origin, from) {
    const element = id => document.getElementById(id);
    const targets = senderTargets(from?.emailAddress);
    if (!origin || !targets) {
      element('message').textContent = 'This message has no single readable sender address, or the add-in is misconfigured. Open Sender Registry directly.';
      return false;
    }
    element('sender-name').textContent = from.displayName || '';
    element('sender-address').textContent = targets.address;
    element('domain-label').textContent = targets.domain;
    element('verify-address').href = registryLink(origin, 'contact', targets.address);
    element('verify-domain').href = registryLink(origin, 'domain', targets.domain);
    element('actions').hidden = false;
    return true;
  }

  const api = { registryOrigin, senderTargets, registryLink, render };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Office.onReady(() => render(root.document, registryOrigin(root.location.search),
      root.Office.context.mailbox.item?.from));
  }
})(globalThis);
