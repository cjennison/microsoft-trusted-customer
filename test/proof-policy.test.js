'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../src/qualification/proof-policy.js');
const now = Date.parse('2026-10-01T12:00:00Z');
const scope = { authorizationConfirmed: true, mailboxId: 'synthetic-mailbox', folderId: 'synthetic-folder', subjectPrefix: '[MTC-PROOF]' };
const verification = {
  status: 'approved', independentVerification: true,
  requesterId: 'synthetic-requester', reviewerId: 'synthetic-independent-reviewer',
  evidenceReference: 'synthetic-evidence-only',
  verifiedOn: '2026-09-01T00:00:00Z', expiresOn: '2027-09-01T00:00:00Z'
};
const registry = {
  version: 'synthetic-1',
  parties: [{ ...verification, id: 'supplier' }],
  contacts: [{ ...verification, id: 'contact', partyId: 'supplier', email: 'ap@vendor.example', approvedReplyTo: ['billing@vendor.example'] }],
  domains: [{ ...verification, partyId: 'supplier', domain: 'vendor.example' }],
  portals: [{ ...verification, partyId: 'supplier', hostname: 'pay.vendor.example' }]
};
const message = {
  fixture: true, mailboxId: scope.mailboxId, folderId: scope.folderId,
  subject: '[MTC-PROOF] Synthetic ordinary message', stableMessageId: 'synthetic-message-1',
  from: 'ap@vendor.example', replyTo: [], authentication: { dmarc: 'pass', alignedDomain: 'vendor.example' },
  nativeRisk: 'no-signal', paymentChangeRequested: false, links: [],
  inspection: { bodyReadable: true, linksComplete: true, attachmentsSupported: true, paymentChangeChecked: true }
};

function run(changes = {}, records = registry) {
  return policy.assessFixture({ ...structuredClone(message), ...changes }, structuredClone(records), scope, now);
}

function singleRegistrarRegistry() {
  const records = structuredClone(registry);
  records.verificationAuthority = {
    mode: 'single-registrar',
    authorizedRegistrarIds: ['registrar-one', 'registrar-two']
  };
  for (const collection of ['parties', 'contacts', 'domains', 'portals']) {
    for (const record of records[collection]) {
      record.requesterId = 'registrar-one';
      record.reviewerId = 'registrar-one';
    }
  }
  return records;
}

test('exact independently reviewed fixture contact is recognized only as synthetic proof', () => {
  const result = run();
  assert.equal(result.relationshipState, 'contact-recognized');
  assert.match(result.presentation, /^Synthetic proof - recognized contact/);
  assert.equal(result.evidenceMode, 'synthetic-fixture');
  assert.equal(result.paymentVerified, false);
  assert.equal(result.canApplyPositiveLabel, false);
  assert.throws(() => policy.nextCategories([], result), /non-positive/);
});

test('new exact-domain contact grants no contact authority', () => {
  const result = run({ from: 'other@vendor.example' });
  assert.equal(result.relationshipState, 'domain-recognized');
  assert.equal(result.matchedContactId, null);
  assert.match(result.presentation, /contact unverified/);
});

test('substring and unapproved subdomain never match', () => {
  for (const name of ['vendor.example.attacker.invalid', 'other.vendor.example']) {
    const result = run({ from: `ap@${name}`, authentication: { dmarc: 'pass', alignedDomain: name } });
    assert.equal(result.relationshipState, 'unrecognized');
  }
});

test('one-character sender and portal lookalikes require review even with fixture authentication pass', () => {
  const sender = run({ from: 'ap@vendorr.example', authentication: { dmarc: 'pass', alignedDomain: 'vendorr.example' } });
  assert.equal(sender.presentation, policy.labels.review);
  assert.ok(sender.reasonCodes.includes('SENDER_DOMAIN_LOOKALIKE'));
  const portal = run({ links: [{ url: 'https://pay.vendorr.example/invoice', purpose: 'payment' }] });
  assert.equal(portal.relationshipState, 'contact-recognized');
  assert.equal(portal.presentation, policy.labels.review);
  assert.ok(portal.reasonCodes.includes('PORTAL_HOST_LOOKALIKE'));
});

test('authentication failure overrides recognition, missing alignment stays incomplete', () => {
  assert.equal(run({ authentication: { dmarc: 'fail' } }).presentation, policy.labels.review);
  for (const authentication of [undefined, { compauth: 'pass' }, { dmarc: 'pass' }, { dmarc: 'pass', alignedDomain: 'other.example' }]) {
    assert.equal(run({ authentication }).presentation, policy.labels.incomplete);
  }
});

test('approved reply destinations are exact and unapproved destinations require review', () => {
  assert.notEqual(run({ replyTo: ['billing@vendor.example'] }).presentation, policy.labels.review);
  assert.equal(run({ replyTo: ['billing@vendor.example.attacker.invalid'] }).presentation, policy.labels.review);
  assert.equal(run({ sender: 'other@vendor.example' }).presentation, policy.labels.review);
});

test('bank changes require independent verification even for recognized fixtures', () => {
  const result = run({ paymentChangeRequested: true });
  assert.equal(result.presentation, policy.labels.review);
  assert.ok(result.reasonCodes.includes('INDEPENDENT_PAYMENT_VERIFICATION_REQUIRED'));
  assert.equal(result.paymentVerified, false);
});

test('known expired/revoked contacts cannot fall back to positive domain recognition', () => {
  for (const change of [{ status: 'revoked' }, { expiresOn: '2026-10-01T12:00:00Z' }, { reviewerId: verification.requesterId }, { evidenceReference: '' }]) {
    const records = structuredClone(registry);
    Object.assign(records.contacts[0], change);
    assert.equal(run({}, records).presentation, policy.labels.review);
  }
});

test('duplicate and cross-party matches are operator-visible conflicts', () => {
  const records = structuredClone(registry);
  records.contacts.push({ ...records.contacts[0], id: 'duplicate' });
  const result = run({}, records);
  assert.equal(result.presentation, policy.labels.review);
  assert.ok(result.reasonCodes.includes('REGISTRY_MATCH_AMBIGUOUS'));
});

test('consumer provider domains never grant wholesale recognition', () => {
  const records = structuredClone(registry);
  records.domains[0].domain = 'gmail.com';
  records.contacts[0].email = 'supplier@gmail.com';
  const auth = { dmarc: 'pass', alignedDomain: 'gmail.com' };
  assert.equal(run({ from: 'supplier@gmail.com', authentication: auth }, records).relationshipState, 'contact-recognized');
  assert.equal(run({ from: 'other@gmail.com', authentication: auth }, records).relationshipState, 'unrecognized');
});

test('independent third-party portal approval is scoped to the matched party', () => {
  const records = structuredClone(registry);
  records.portals[0].hostname = 'invoice-provider.example';
  assert.notEqual(run({ links: [{ url: 'https://invoice-provider.example/invoice', purpose: 'payment' }] }, records).presentation,
    policy.labels.review);
  records.parties.push({ ...verification, id: 'another-supplier' });
  records.portals[0].partyId = 'another-supplier';
  assert.equal(run({ links: [{ url: 'https://invoice-provider.example/invoice', purpose: 'payment' }] }, records).presentation,
    policy.labels.review);
});

test('Safe Links targets are decoded without visiting them; ambiguity and unsafe schemes fail', () => {
  const original = 'https://pay.vendor.example/invoice';
  assert.equal(policy.linkHost(`https://nam.safelinks.protection.outlook.com/?url=${encodeURIComponent(original)}`).host,
    'pay.vendor.example');
  for (const url of [
    'https://nam.safelinks.protection.outlook.com/?url=https://one.example&url=https://two.example',
    'https://nam.safelinks.protection.outlook.com/?url=javascript:alert(1)',
    'https://user:secret@pay.vendor.example',
    'https://127.0.0.1/path', 'javascript:alert(1)', '/relative', 'https://pay.vendor.example:8080',
    'https://pay.vendor.example\\@attacker.invalid'
  ]) {
    assert.equal(run({ links: [{ url, purpose: 'payment' }] }).presentation, policy.labels.incomplete);
  }
});

test('HTTP sensitive links, unsupported content, QR/attachment limitations cannot be cleared', () => {
  assert.equal(run({ links: [{ url: 'http://pay.vendor.example/invoice', purpose: 'payment' }] }).presentation, policy.labels.review);
  for (const field of Object.keys(message.inspection)) {
    assert.equal(run({ inspection: { ...message.inspection, [field]: false } }).presentation, policy.labels.incomplete);
  }
  assert.equal(run({ nativeRisk: undefined }).presentation, policy.labels.incomplete);
});

test('captured mail never gets positive qualification from arbitrary or duplicate auth headers', () => {
  for (const headers of [[], [{ name: 'Authentication-Results', value: 'dmarc=pass' }],
    [{ name: 'Authentication-Results', value: 'dmarc=pass' }, { name: 'Authentication-Results', value: 'dmarc=pass' }]]) {
    const result = policy.assessCapturedMessage({ ...message, internetMessageHeaders: headers }, registry, scope, now);
    assert.equal(result.presentation, policy.labels.incomplete);
    assert.equal(result.authenticationState, 'incomplete');
    assert.ok(result.reasonCodes.includes('RECEIVING_BOUNDARY_NOT_VALIDATED'));
  }
});

test('branding does not grant recognition and copied positive categories are ignored', () => {
  const result = run({ from: 'attacker@unknown.example', displayName: 'Vendor', authentication: { dmarc: 'pass', alignedDomain: 'unknown.example' } });
  assert.equal(result.relationshipState, 'unrecognized');
  assert.equal(result.presentation, policy.labels.unknown);
});

test('scope guard denies other mailbox/folder/unmarked messages before assessment', () => {
  for (const change of [{ mailboxId: 'other' }, { folderId: 'inbox' }, { subject: 'Invoice' }, { stableMessageId: '' }]) {
    assert.throws(() => run(change), /outside/);
  }
  assert.throws(() => policy.assessFixture(message, registry, { ...scope, authorizationConfirmed: false }, now), /outside/);
});

test('IDNA and domain case normalize; local-part case and meaningful punctuation are preserved', () => {
  assert.equal(policy.domain('BÜCHER.example'), 'xn--bcher-kva.example');
  assert.equal(policy.address('A.B+ap@VENDOR.EXAMPLE'), 'A.B+ap@vendor.example');
  assert.notEqual(policy.address('AP@vendor.example'), policy.address('ap@vendor.example'));
  for (const input of ['name <ap@vendor.example>', 'a..b@vendor.example', 'ap@vendor.example.', 'ap@vendor.example/other']) {
    assert.throws(() => policy.address(input));
  }
});

test('category updates preserve unrelated categories and only replace the three owned proof labels', () => {
  const result = run({ authentication: undefined });
  assert.deepEqual(policy.nextCategories(['Personal', policy.labels.review, 'Copied safe badge'], result),
    ['Personal', 'Copied safe badge', policy.labels.incomplete]);
  assert.deepEqual(policy.nextCategories([policy.labels.incomplete], result), [policy.labels.incomplete]);
  assert.throws(() => policy.nextCategories(undefined, result), /retrieved/);
});

test('policy is deterministic and never mutates inputs; missing registry is an explicit error', () => {
  const before = JSON.stringify({ message, registry });
  assert.deepEqual(run(), run());
  assert.equal(JSON.stringify({ message, registry }), before);
  assert.throws(() => run({}, {}), /registry/);
  assert.throws(() => policy.assessFixture(message, registry, scope, NaN), /time/);
  assert.throws(() => run({ fixture: false }), /fixture/);
});

test('malformed message evidence is incomplete or an explicit input error, never a positive result', () => {
  const invalidAuth = run({ authentication: { dmarc: 'pass', alignedDomain: 'vendor.example/other' } });
  assert.equal(invalidAuth.presentation, policy.labels.incomplete);
  assert.ok(invalidAuth.reasonCodes.includes('AUTHENTICATION_DOMAIN_UNSUPPORTED'));
  assert.equal(run({ sender: 'name <ap@vendor.example>' }).presentation, policy.labels.incomplete);
  for (const links of [{ url: 'https://vendor.example' }, [null], [['https://vendor.example']]]) {
    assert.throws(() => run({ links }), /Structured link evidence/);
  }
  assert.throws(() => policy.assessCapturedMessage(null, registry, scope, now), /outside/);
  assert.throws(() => policy.assessFixture(null, registry, scope, now), /fixture/);
  assert.throws(() => run({ stableMessageId: {} }), /outside/);
  assert.throws(() => run({ subject: '[MTC-PROOF]not-an-approved-marker' }), /outside/);
});

test('malformed registry rows cannot be ignored or treated as successful matches', () => {
  for (const mutate of [
    records => { records.version = {}; },
    records => { records.parties[0] = null; },
    records => { records.contacts[0].email = 'name <ap@vendor.example>'; },
    records => { records.contacts[0].approvedReplyTo = 'billing@vendor.example'; },
    records => { records.contacts[0].approvedReplyTo = ['bad-address']; },
    records => { records.domains[0].domain = 'vendor.example/path'; },
    records => { records.portals[0].hostname = 'https://pay.vendor.example'; }
  ]) {
    const records = structuredClone(registry);
    mutate(records);
    assert.throws(() => run({}, records), /registry/i);
  }
});

test('reviewer case changes and whitespace cannot defeat independent-identity checks', () => {
  for (const change of [
    { requesterId: 'IDENTITY', reviewerId: 'identity' },
    { requesterId: 'identity', reviewerId: 'identity ' },
    { evidenceReference: ' ' },
    { verifiedOn: undefined }
  ]) {
    assert.equal(policy.active({ ...verification, ...change }, now), false);
  }
});

test('single-registrar verification is explicit and can support multiple authorized registrars', () => {
  const records = singleRegistrarRegistry();
  for (const registrar of records.verificationAuthority.authorizedRegistrarIds) {
    for (const collection of ['parties', 'contacts', 'domains', 'portals']) {
      for (const record of records[collection]) {
        record.requesterId = registrar;
        record.reviewerId = registrar.toUpperCase();
      }
    }
    const result = run({}, records);
    assert.equal(result.relationshipState, 'contact-recognized');
    assert.match(result.presentation, /^Synthetic proof/);
    assert.equal(result.canApplyPositiveLabel, false);
  }
  delete records.verificationAuthority;
  assert.equal(run({}, records).presentation, policy.labels.review);
  records.verificationAuthority = {
    mode: 'independent-review', authorizedRegistrarIds: ['registrar-one', 'registrar-two']
  };
  assert.equal(run({}, records).presentation, policy.labels.review);
});

test('single-registrar mode cannot bypass authorization, evidence, expiry, or revocation', () => {
  for (const change of [
    { reviewerId: 'not-authorized' },
    { independentVerification: false },
    { evidenceReference: '' },
    { status: 'revoked' },
    { expiresOn: '2026-10-01T12:00:00Z' }
  ]) {
    const records = singleRegistrarRegistry();
    Object.assign(records.contacts[0], change);
    assert.equal(run({}, records).presentation, policy.labels.review);
  }
  const records = singleRegistrarRegistry();
  records.verificationAuthority.authorizedRegistrarIds = [];
  assert.equal(run({}, records).presentation, policy.labels.review);
});

test('single-registrar choice preserves exact consumer-address and domain-only boundaries', () => {
  const records = singleRegistrarRegistry();
  assert.equal(run({ from: 'other@vendor.example' }, records).relationshipState, 'domain-recognized');
  records.domains[0].domain = 'gmail.com';
  records.contacts[0].email = 'supplier@gmail.com';
  const authentication = { dmarc: 'pass', alignedDomain: 'gmail.com' };
  assert.equal(run({ from: 'supplier@gmail.com', authentication }, records).relationshipState, 'contact-recognized');
  assert.equal(run({ from: 'other@gmail.com', authentication }, records).relationshipState, 'unrecognized');
});

test('single-registrar choice cannot authorize live positive labels or clear message risks', () => {
  const records = singleRegistrarRegistry();
  const captured = policy.assessCapturedMessage(message, records, scope, now);
  assert.equal(captured.presentation, policy.labels.incomplete);
  assert.ok(captured.reasonCodes.includes('RECEIVING_BOUNDARY_NOT_VALIDATED'));
  assert.equal(captured.canApplyPositiveLabel, false);
  assert.throws(() => policy.nextCategories([], run({}, records)), /non-positive/);
  assert.equal(run({ authentication: { dmarc: 'fail' } }, records).presentation, policy.labels.review);
  assert.equal(run({ paymentChangeRequested: true }, records).presentation, policy.labels.review);
});

test('registrar authority applies to party, domain, and portal evidence as well as contacts', () => {
  const party = singleRegistrarRegistry();
  party.parties[0].reviewerId = 'not-authorized';
  assert.equal(run({}, party).presentation, policy.labels.review);

  const domain = singleRegistrarRegistry();
  domain.domains[0].reviewerId = 'not-authorized';
  assert.equal(run({ from: 'other@vendor.example' }, domain).relationshipState, 'unrecognized');

  const portal = singleRegistrarRegistry();
  portal.portals[0].reviewerId = 'not-authorized';
  const result = run({ links: [{ url: 'https://pay.vendor.example/invoice', purpose: 'payment' }] }, portal);
  assert.equal(result.presentation, policy.labels.review);
  assert.ok(result.reasonCodes.includes('SENSITIVE_PORTAL_NOT_APPROVED'));
});

test('message input cannot choose verification authority or mutate its registrar configuration', () => {
  const records = singleRegistrarRegistry();
  const authority = records.verificationAuthority;
  delete records.verificationAuthority;
  assert.equal(run({ verificationAuthority: authority }, records).presentation, policy.labels.review);
  records.verificationAuthority = authority;
  const before = JSON.stringify(records);
  run({}, records);
  assert.equal(JSON.stringify(records), before);
});

test('malformed verification-authority settings throw rather than relax approval', () => {
  for (const authority of [
    null, [], 'single-registrar', {},
    { mode: 'other', authorizedRegistrarIds: [] },
    { mode: 'single-registrar', authorizedRegistrarIds: 'registrar-one' },
    { mode: 'single-registrar', authorizedRegistrarIds: [null] },
    { mode: 'single-registrar', authorizedRegistrarIds: [''] },
    { mode: 'single-registrar', authorizedRegistrarIds: ['registrar-one '] },
    { mode: 'single-registrar', authorizedRegistrarIds: ['registrar-one', 'REGISTRAR-ONE'] }
  ]) {
    const records = structuredClone(registry);
    records.verificationAuthority = authority;
    assert.throws(() => run({}, records), /verification|registrar/i);
    assert.throws(() => policy.active(verification, now, authority), /verification|registrar/i);
  }
});

test('categories reject incompatible assessment shapes without silently changing presentation', () => {
  const result = run({ authentication: undefined });
  assert.throws(() => policy.nextCategories([], { ...result, policyVersion: 'other' }), /non-positive/);
  assert.throws(() => policy.nextCategories([], { ...result, evidenceMode: 'trusted-live' }), /non-positive/);
  assert.throws(() => policy.nextCategories([], { ...result, canApplyPositiveLabel: true }), /non-positive/);
});
