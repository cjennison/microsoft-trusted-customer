'use strict';

(function (root) {
  const version = 'proof-2';
  const consumerDomains = new Set([
    'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
    'yahoo.com', 'icloud.com', 'aol.com', 'proton.me', 'protonmail.com'
  ]);
  const labels = Object.freeze({
    review: 'MTC Proof - review required',
    incomplete: 'MTC Proof - qualification incomplete',
    unknown: 'MTC Proof - unrecognized sender'
  });

  function domain(value) {
    if (typeof value !== 'string' || !value || value.trim() !== value ||
        /[\s/:@?#\\%]/u.test(value) || value.endsWith('.')) {
      throw new Error('Unsupported or malformed domain.');
    }
    const normalized = new URL(`https://${value}`).hostname;
    if (normalized.length > 253 || !normalized.includes('.') ||
        normalized.split('.').some(part => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part)) ||
        /^[\d.]+$/.test(normalized)) {
      throw new Error('Unsupported or malformed domain.');
    }
    return normalized;
  }

  function address(value) {
    if (typeof value !== 'string') throw new Error('Structured email address is required.');
    const parts = value.split('@');
    if (parts.length !== 2 || parts[0].length > 64 ||
        !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(parts[0])) {
      throw new Error('Unsupported or malformed email local part.');
    }
    return `${parts[0]}@${domain(parts[1])}`;
  }

  function verificationAuthority(value) {
    if (value === undefined) return { mode: 'independent-review', registrars: null };
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        !['independent-review', 'single-registrar'].includes(value.mode) ||
        !Array.isArray(value.authorizedRegistrarIds)) {
      throw new Error('An explicit verification mode and authorized registrar list are required.');
    }
    const registrars = new Set();
    for (const id of value.authorizedRegistrarIds) {
      if (typeof id !== 'string' || !id.trim() || id.trim() !== id ||
          registrars.has(id.toLowerCase())) {
        throw new Error('Authorized registrar identifiers must be nonempty, canonical, and unique.');
      }
      registrars.add(id.toLowerCase());
    }
    return { mode: value.mode, registrars };
  }

  function activeRecord(record, now, authority) {
    if (!record || record.status !== 'approved' || record.independentVerification !== true ||
        typeof record.requesterId !== 'string' || !record.requesterId.trim() ||
        record.requesterId.trim() !== record.requesterId ||
        typeof record.reviewerId !== 'string' || !record.reviewerId.trim() ||
        record.reviewerId.trim() !== record.reviewerId ||
        (authority.mode === 'independent-review' &&
          record.requesterId.toLowerCase() === record.reviewerId.toLowerCase()) ||
        (authority.registrars !== null && !authority.registrars.has(record.reviewerId.toLowerCase())) ||
        typeof record.evidenceReference !== 'string' || !record.evidenceReference.trim() ||
        typeof record.verifiedOn !== 'string' || typeof record.expiresOn !== 'string') return false;
    const verified = Date.parse(record.verifiedOn);
    const expires = Date.parse(record.expiresOn);
    return Number.isFinite(verified) && Number.isFinite(expires) &&
      verified <= now && expires > now && expires > verified;
  }

  function active(record, now, authority) {
    return activeRecord(record, now, verificationAuthority(authority));
  }

  function oneEditApart(left, right) {
    if (left === right || Math.abs(left.length - right.length) > 1) return false;
    let i = 0;
    let j = 0;
    let changes = 0;
    while (i < left.length && j < right.length) {
      if (left[i] === right[j]) { i++; j++; continue; }
      if (++changes > 1) return false;
      if (left.length >= right.length) i++;
      if (right.length >= left.length) j++;
    }
    return changes + Number(i < left.length || j < right.length) === 1;
  }

  function linkHost(value) {
    if (typeof value !== 'string' || value.trim() !== value || /[\u0000-\u0020\\]/u.test(value)) {
      throw new Error('Unsupported link.');
    }
    let url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        (url.port && !['80', '443'].includes(url.port))) throw new Error('Unsupported link.');
    const host = domain(url.hostname);
    if (host.endsWith('.safelinks.protection.outlook.com')) {
      const originals = url.searchParams.getAll('url');
      if (originals.length !== 1) throw new Error('Safe Links original target is missing or ambiguous.');
      url = new URL(originals[0]);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
          (url.port && !['80', '443'].includes(url.port))) throw new Error('Unsupported original link.');
    }
    return { host: domain(url.hostname), https: url.protocol === 'https:' };
  }

  function validateScope(message, scope) {
    if (!message || typeof message !== 'object' || !scope || scope.authorizationConfirmed !== true ||
        typeof scope.mailboxId !== 'string' || !scope.mailboxId.trim() ||
        typeof scope.folderId !== 'string' || !scope.folderId.trim() ||
        scope.subjectPrefix !== '[MTC-PROOF]' || message.mailboxId !== scope.mailboxId ||
        message.folderId !== scope.folderId || typeof message.subject !== 'string' ||
        !(message.subject === scope.subjectPrefix || message.subject.startsWith(`${scope.subjectPrefix} `)) ||
        typeof message.stableMessageId !== 'string' || !message.stableMessageId.trim()) {
      throw new Error('Message is outside the explicitly approved proof folder/subject scope.');
    }
  }

  function validateRegistry(registry) {
    if (!registry || !Array.isArray(registry.parties) || !Array.isArray(registry.contacts) ||
        !Array.isArray(registry.domains) || !Array.isArray(registry.portals) ||
        typeof registry.version !== 'string' || !registry.version.trim()) {
      throw new Error('Complete versioned registry data is required.');
    }
    for (const party of registry.parties) {
      if (!party || typeof party.id !== 'string' || !party.id.trim()) {
        throw new Error('Registry party identifiers are required.');
      }
    }
    for (const [collection, field, normalize] of [
      [registry.contacts, 'email', address], [registry.domains, 'domain', domain],
      [registry.portals, 'hostname', domain]
    ]) {
      for (const record of collection) {
        if (!record || typeof record.partyId !== 'string' || !record.partyId.trim()) {
          throw new Error(`Registry ${field} requires a party identifier.`);
        }
        try { normalize(record[field]); } catch (error) {
          throw new Error(`Registry ${field} is unsupported or malformed.`);
        }
      }
    }
    for (const contact of registry.contacts) {
      if (typeof contact.id !== 'string' || !contact.id.trim() ||
          (contact.approvedReplyTo !== undefined && !Array.isArray(contact.approvedReplyTo))) {
        throw new Error('Registry contact identifiers and structured Reply-To lists are required.');
      }
      for (const reply of contact.approvedReplyTo ?? []) {
        try { address(reply); } catch (error) {
          throw new Error('Registry approved Reply-To address is unsupported or malformed.');
        }
      }
    }
  }

  function assess(message, registry, scope, synthetic, now) {
    validateScope(message, scope);
    if (!Number.isFinite(now)) throw new Error('An explicit valid assessment time is required.');
    validateRegistry(registry);
    const authority = verificationAuthority(registry.verificationAuthority);
    const approved = record => activeRecord(record, now, authority);
    if (message.links !== undefined && (!Array.isArray(message.links) ||
        message.links.some(link => !link || typeof link !== 'object' || Array.isArray(link)))) {
      throw new Error('Structured link evidence is required.');
    }
    const reasons = new Set();
    let review = false;
    let incomplete = false;
    let relationshipState = 'unrecognized';
    let authenticationState = 'incomplete';
    let matchedContactId = null;
    const fail = code => { reasons.add(code); incomplete = true; };
    const flag = code => { reasons.add(code); review = true; };
    let from;
    try { from = address(message.from); } catch (error) { fail('FROM_UNSUPPORTED'); }
    const fromDomain = from?.split('@')[1];

    // Positive authentication is deliberately fixture-only until the receiving boundary is proven.
    if (!synthetic) {
      fail('RECEIVING_BOUNDARY_NOT_VALIDATED');
    } else if (message.authentication?.dmarc === 'pass' && message.authentication?.alignedDomain) {
      let alignedDomain;
      try { alignedDomain = domain(message.authentication.alignedDomain); } catch (error) {
        fail('AUTHENTICATION_DOMAIN_UNSUPPORTED');
      }
      if (alignedDomain && alignedDomain === fromDomain) authenticationState = 'aligned-pass';
      else fail('AUTHENTICATION_INCOMPLETE');
    } else if (message.authentication?.dmarc === 'fail') {
      authenticationState = 'review-required';
      flag('AUTHENTICATION_FAILED');
    } else {
      fail('AUTHENTICATION_INCOMPLETE');
    }

    const partyActive = id => registry.parties.filter(party => party.id === id && approved(party)).length === 1;
    const approvedContacts = registry.contacts.filter(contact =>
      approved(contact) && partyActive(contact.partyId));
    const approvedDomains = registry.domains.filter(item =>
      approved(item) && partyActive(item.partyId) && !consumerDomains.has(domain(item.domain)));
    const exactContacts = registry.contacts.filter(contact => address(contact.email) === from);
    const contactMatches = approvedContacts.filter(contact => address(contact.email) === from);
    const domainMatches = approvedDomains.filter(item => domain(item.domain) === fromDomain);
    let partyId = null;
    if (exactContacts.some(contact => !approved(contact) || !partyActive(contact.partyId))) {
      flag('KNOWN_CONTACT_NOT_CURRENTLY_APPROVED');
    }
    if (contactMatches.length > 1 || domainMatches.length > 1 ||
        (contactMatches.length && domainMatches.some(item => item.partyId !== contactMatches[0].partyId))) {
      flag('REGISTRY_MATCH_AMBIGUOUS');
    } else if (contactMatches.length === 1 && !review) {
      relationshipState = 'contact-recognized';
      matchedContactId = contactMatches[0].id;
      partyId = contactMatches[0].partyId;
    } else if (domainMatches.length === 1 && !review) {
      relationshipState = 'domain-recognized';
      partyId = domainMatches[0].partyId;
    }

    if (fromDomain && approvedDomains.some(item => oneEditApart(fromDomain, domain(item.domain)))) {
      flag('SENDER_DOMAIN_LOOKALIKE');
    }
    if (message.sender) {
      try { if (address(message.sender) !== from) flag('SENDER_DIFFERS_FROM_FROM'); } catch (error) {
        fail('SENDER_UNSUPPORTED');
      }
    }
    if (!Array.isArray(message.replyTo)) fail('REPLY_TO_INSPECTION_INCOMPLETE');
    else for (const reply of message.replyTo) {
      let destination;
      try { destination = address(reply); } catch (error) { fail('REPLY_TO_UNSUPPORTED'); continue; }
      const permitted = contactMatches.length === 1
        ? [from, ...(contactMatches[0].approvedReplyTo ?? []).map(address)] : [from];
      if (!permitted.includes(destination)) flag('UNEXPECTED_REPLY_TO');
    }

    if (!message.inspection || message.inspection.bodyReadable !== true ||
        message.inspection.linksComplete !== true || message.inspection.attachmentsSupported !== true ||
        !Array.isArray(message.links)) fail('CONTENT_INSPECTION_INCOMPLETE');
    if (!message.inspection || message.inspection.paymentChangeChecked !== true) fail('PAYMENT_CHANGE_CHECK_INCOMPLETE');
    if (message.paymentChangeRequested === true) flag('INDEPENDENT_PAYMENT_VERIFICATION_REQUIRED');
    if (typeof message.paymentChangeRequested !== 'boolean') fail('PAYMENT_CHANGE_CHECK_INCOMPLETE');
    if (message.nativeRisk === 'review') flag('NATIVE_RISK_SIGNAL');
    if (!['review', 'no-signal'].includes(message.nativeRisk)) fail('NATIVE_RISK_EVIDENCE_INCOMPLETE');

    for (const link of message.links ?? []) {
      let target;
      try { target = linkHost(link.url); } catch (error) { fail('LINK_TARGET_UNRESOLVED'); continue; }
      const portals = registry.portals.filter(portal => approved(portal) && partyActive(portal.partyId));
      if (portals.some(portal => oneEditApart(target.host, domain(portal.hostname)))) flag('PORTAL_HOST_LOOKALIKE');
      if (['payment', 'login'].includes(link.purpose)) {
        if (!target.https) flag('SENSITIVE_LINK_NOT_HTTPS');
        if (!portals.some(portal => portal.partyId === partyId && domain(portal.hostname) === target.host)) {
          flag('SENSITIVE_PORTAL_NOT_APPROVED');
        }
      } else if (link.purpose !== 'ordinary') {
        fail('LINK_PURPOSE_UNRESOLVED');
      }
    }

    let presentation = labels.unknown;
    if (review) presentation = labels.review;
    else if (incomplete) presentation = labels.incomplete;
    else if (relationshipState === 'contact-recognized') presentation = 'Synthetic proof - recognized contact; payment not verified';
    else if (relationshipState === 'domain-recognized') presentation = 'Synthetic proof - recognized domain; contact unverified';
    return {
      policyVersion: version, registryVersion: registry.version,
      evidenceMode: synthetic ? 'synthetic-fixture' : 'captured-message-unvalidated',
      proofOnly: true, paymentVerified: false, canApplyPositiveLabel: false,
      relationshipState, authenticationState,
      riskState: review ? 'review-required' : incomplete ? 'incomplete' : 'no-signal-in-completed-fixture-checks',
      presentation, matchedContactId, reasonCodes: [...reasons].sort()
    };
  }

  function assessFixture(message, registry, scope, now) {
    if (!message || message.fixture !== true) throw new Error('Synthetic proof requires an explicitly marked fixture.');
    return assess(message, registry, scope, true, now);
  }

  function assessCapturedMessage(message, registry, scope, now) {
    return assess(message, registry, scope, false, now);
  }

  function nextCategories(existing, assessment) {
    if (!Array.isArray(existing) || existing.some(item => typeof item !== 'string')) {
      throw new Error('Existing categories must be retrieved before changing presentation.');
    }
    if (!assessment || assessment.proofOnly !== true || assessment.canApplyPositiveLabel !== false ||
        assessment.policyVersion !== version ||
        !['synthetic-fixture', 'captured-message-unvalidated'].includes(assessment.evidenceMode) ||
        !Object.values(labels).includes(assessment.presentation)) {
      throw new Error('Only non-positive proof categories can be applied.');
    }
    return [...new Set([...existing.filter(item => !Object.values(labels).includes(item)), assessment.presentation])];
  }

  const api = { version, labels, domain, address, active, linkHost, validateScope, assessFixture, assessCapturedMessage, nextCategories };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MtcProofPolicy = api;
})(globalThis);
