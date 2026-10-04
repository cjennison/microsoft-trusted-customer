'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../src/qualification/proof-policy.js');

const now = Date.parse('2026-10-01T12:00:00Z');
const scope = {
  authorizationConfirmed: true,
  mailboxId: 'synthetic-mailbox',
  folderId: 'synthetic-folder',
  subjectPrefix: '[MTC-PROOF]'
};
const verification = {
  status: 'approved',
  independentVerification: true,
  requesterId: 'synthetic-requester',
  reviewerId: 'synthetic-independent-reviewer',
  evidenceReference: 'synthetic-evidence-only',
  verifiedOn: '2026-09-01T00:00:00Z',
  expiresOn: '2027-09-01T00:00:00Z'
};
const registry = {
  version: 'synthetic-1',
  parties: [{ ...verification, id: 'supplier' }],
  contacts: [{
    ...verification,
    id: 'contact',
    partyId: 'supplier',
    email: 'ap@vendor.example',
    approvedReplyTo: ['billing@vendor.example']
  }],
  domains: [{ ...verification, partyId: 'supplier', domain: 'vendor.example' }]
};
const message = {
  fixture: true,
  mailboxId: scope.mailboxId,
  folderId: scope.folderId,
  subject: '[MTC-PROOF] Synthetic ordinary message',
  stableMessageId: 'synthetic-message-1',
  from: 'ap@vendor.example',
  replyTo: [],
  authentication: { dmarc: 'pass', alignedDomain: 'vendor.example' }
};

function run(changes = {}, records = registry) {
  return policy.assessFixture(
    { ...structuredClone(message), ...changes },
    structuredClone(records),
    scope,
    now
  );
}

function singleRegistrarRegistry() {
  const records = structuredClone(registry);
  records.verificationAuthority = {
    mode: 'single-registrar',
    authorizedRegistrarIds: ['registrar-one', 'registrar-two']
  };
  for (const collection of ['parties', 'contacts', 'domains']) {
    for (const record of records[collection]) {
      record.requesterId = 'registrar-one';
      record.reviewerId = 'registrar-one';
    }
  }
  return records;
}

test('exact independently reviewed contact is known only as synthetic proof', () => {
  const result = run();
  assert.equal(result.relationshipState, 'contact-recognized');
  assert.equal(result.authenticationState, 'aligned-pass');
  assert.equal(result.presentation, policy.labels.known);
  assert.equal(result.evidenceMode, 'synthetic-fixture');
  assert.equal(result.canApplyPositiveLabel, false);
  assert.throws(() => policy.nextCategories([], result), /Not known/);
});

test('approved exact business domain is known without claiming an exact contact', () => {
  const result = run({ from: 'other@vendor.example' });
  assert.equal(result.relationshipState, 'domain-recognized');
  assert.equal(result.matchedContactId, null);
  assert.equal(result.presentation, policy.labels.known);
});

test('unknown addresses and unapproved subdomains remain not known', () => {
  for (const value of ['other@unknown.example', 'ap@other.vendor.example', 'ap@vendor.example.attacker.invalid']) {
    const senderDomain = value.split('@')[1];
    const result = run({
      from: value,
      authentication: { dmarc: 'pass', alignedDomain: senderDomain }
    });
    assert.equal(result.presentation, policy.labels.unknown);
    assert.equal(result.relationshipState, 'unrecognized');
  }
});

test('one-character sender lookalikes fail closed to not known', () => {
  const result = run({
    from: 'ap@vendorr.example',
    authentication: { dmarc: 'pass', alignedDomain: 'vendorr.example' }
  });
  assert.equal(result.presentation, policy.labels.unknown);
  assert.ok(result.reasonCodes.includes('SENDER_DOMAIN_LOOKALIKE'));
});

test('authentication failure, absence, or misalignment is not known', () => {
  for (const authentication of [
    { dmarc: 'fail' },
    undefined,
    { compauth: 'pass' },
    { dmarc: 'pass' },
    { dmarc: 'pass', alignedDomain: 'other.example' }
  ]) {
    assert.equal(run({ authentication }).presentation, policy.labels.unknown);
  }
});

test('approved reply destinations remain known and conflicting identities are not known', () => {
  assert.equal(run({ replyTo: ['billing@vendor.example'] }).presentation, policy.labels.known);
  assert.equal(run({ replyTo: ['billing@vendor.example.attacker.invalid'] }).presentation, policy.labels.unknown);
  assert.equal(run({ sender: 'other@vendor.example' }).presentation, policy.labels.unknown);
});

test('expired, revoked, or inadequately verified exact contacts are not known', () => {
  for (const change of [
    { status: 'revoked' },
    { expiresOn: '2026-10-01T12:00:00Z' },
    { reviewerId: verification.requesterId },
    { evidenceReference: '' }
  ]) {
    const records = structuredClone(registry);
    Object.assign(records.contacts[0], change);
    assert.equal(run({}, records).presentation, policy.labels.unknown);
  }
});

test('duplicate and cross-party matches are not known', () => {
  const duplicate = structuredClone(registry);
  duplicate.contacts.push({ ...duplicate.contacts[0], id: 'duplicate' });
  const duplicateResult = run({}, duplicate);
  assert.equal(duplicateResult.presentation, policy.labels.unknown);
  assert.ok(duplicateResult.reasonCodes.includes('REGISTRY_MATCH_AMBIGUOUS'));

  const crossParty = structuredClone(registry);
  crossParty.parties.push({ ...verification, id: 'another-party' });
  crossParty.domains[0].partyId = 'another-party';
  assert.equal(run({}, crossParty).presentation, policy.labels.unknown);
});

test('consumer providers require an approved exact address', () => {
  const records = structuredClone(registry);
  records.domains[0].domain = 'gmail.com';
  records.contacts[0].email = 'supplier@gmail.com';
  const authentication = { dmarc: 'pass', alignedDomain: 'gmail.com' };
  assert.equal(run({ from: 'supplier@gmail.com', authentication }, records).presentation, policy.labels.known);
  assert.equal(run({ from: 'other@gmail.com', authentication }, records).presentation, policy.labels.unknown);
});

test('captured mail cannot become known from arbitrary authentication header text', () => {
  for (const headers of [
    [],
    [{ name: 'Authentication-Results', value: 'dmarc=pass' }],
    [
      { name: 'Authentication-Results', value: 'dmarc=pass' },
      { name: 'Authentication-Results', value: 'dmarc=pass' }
    ]
  ]) {
    const result = policy.assessCapturedMessage(
      { ...message, internetMessageHeaders: headers },
      registry,
      scope,
      now
    );
    assert.equal(result.presentation, policy.labels.unknown);
    assert.equal(result.authenticationState, 'incomplete');
    assert.ok(result.reasonCodes.includes('RECEIVING_BOUNDARY_NOT_VALIDATED'));
  }
});

test('branding never makes an unknown address known', () => {
  const result = run({
    from: 'attacker@unknown.example',
    displayName: 'Vendor',
    authentication: { dmarc: 'pass', alignedDomain: 'unknown.example' }
  });
  assert.equal(result.relationshipState, 'unrecognized');
  assert.equal(result.presentation, policy.labels.unknown);
});

test('scope guard denies other mailbox, folder, subject, and missing stable ID', () => {
  for (const change of [
    { mailboxId: 'other' },
    { folderId: 'inbox' },
    { subject: 'Ordinary message' },
    { stableMessageId: '' }
  ]) {
    assert.throws(() => run(change), /outside/);
  }
  assert.throws(
    () => policy.assessFixture(message, registry, { ...scope, authorizationConfirmed: false }, now),
    /outside/
  );
});

test('IDNA and domain case normalize while local-part semantics are preserved', () => {
  assert.equal(policy.domain('BÜCHER.example'), 'xn--bcher-kva.example');
  assert.equal(policy.address('A.B+ap@VENDOR.EXAMPLE'), 'A.B+ap@vendor.example');
  assert.notEqual(policy.address('AP@vendor.example'), policy.address('ap@vendor.example'));
  for (const input of [
    'name <ap@vendor.example>',
    'a..b@vendor.example',
    'ap@vendor.example.',
    'ap@vendor.example/other'
  ]) {
    assert.throws(() => policy.address(input));
  }
});

test('category updates preserve unrelated categories and replace only binary proof labels', () => {
  const result = run({ authentication: undefined });
  assert.deepEqual(
    policy.nextCategories(['Personal', policy.labels.known, 'Copied badge'], result),
    ['Personal', 'Copied badge', policy.labels.unknown]
  );
  assert.deepEqual(policy.nextCategories([policy.labels.unknown], result), [policy.labels.unknown]);
  assert.throws(() => policy.nextCategories(undefined, result), /retrieved/);
});

test('policy is deterministic, immutable, and rejects missing registry data', () => {
  const before = JSON.stringify({ message, registry });
  assert.deepEqual(run(), run());
  assert.equal(JSON.stringify({ message, registry }), before);
  assert.throws(() => run({}, {}), /registry/);
  assert.throws(() => policy.assessFixture(message, registry, scope, NaN), /time/);
  assert.throws(() => run({ fixture: false }), /fixture/);
});

test('malformed message evidence is not known or explicitly rejected', () => {
  const invalidAuth = run({
    authentication: { dmarc: 'pass', alignedDomain: 'vendor.example/other' }
  });
  assert.equal(invalidAuth.presentation, policy.labels.unknown);
  assert.ok(invalidAuth.reasonCodes.includes('AUTHENTICATION_DOMAIN_UNSUPPORTED'));
  assert.equal(run({ sender: 'name <ap@vendor.example>' }).presentation, policy.labels.unknown);
  assert.throws(() => policy.assessCapturedMessage(null, registry, scope, now), /outside/);
  assert.throws(() => policy.assessFixture(null, registry, scope, now), /fixture/);
  assert.throws(() => run({ stableMessageId: {} }), /outside/);
});

test('malformed registry rows cannot be ignored or treated as known', () => {
  for (const mutate of [
    records => { records.version = {}; },
    records => { records.parties[0] = null; },
    records => { records.contacts[0].email = 'name <ap@vendor.example>'; },
    records => { records.contacts[0].approvedReplyTo = 'billing@vendor.example'; },
    records => { records.contacts[0].approvedReplyTo = ['bad-address']; },
    records => { records.domains[0].domain = 'vendor.example/path'; }
  ]) {
    const records = structuredClone(registry);
    mutate(records);
    assert.throws(() => run({}, records), /registry/i);
  }
});

test('reviewer case changes and whitespace cannot defeat independent identity checks', () => {
  for (const change of [
    { requesterId: 'IDENTITY', reviewerId: 'identity' },
    { requesterId: 'identity', reviewerId: 'identity ' },
    { evidenceReference: ' ' },
    { verifiedOn: undefined }
  ]) {
    assert.equal(policy.active({ ...verification, ...change }, now), false);
  }
});

test('single-registrar verification supports multiple authorized registrars', () => {
  const records = singleRegistrarRegistry();
  for (const registrar of records.verificationAuthority.authorizedRegistrarIds) {
    for (const collection of ['parties', 'contacts', 'domains']) {
      for (const record of records[collection]) {
        record.requesterId = registrar;
        record.reviewerId = registrar.toUpperCase();
      }
    }
    const result = run({}, records);
    assert.equal(result.presentation, policy.labels.known);
    assert.equal(result.canApplyPositiveLabel, false);
  }
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
    assert.equal(run({}, records).presentation, policy.labels.unknown);
  }
  const records = singleRegistrarRegistry();
  records.verificationAuthority.authorizedRegistrarIds = [];
  assert.equal(run({}, records).presentation, policy.labels.unknown);
});

test('single-registrar mode preserves exact consumer and domain boundaries', () => {
  const records = singleRegistrarRegistry();
  assert.equal(run({ from: 'other@vendor.example' }, records).presentation, policy.labels.known);
  records.domains[0].domain = 'gmail.com';
  records.contacts[0].email = 'supplier@gmail.com';
  const authentication = { dmarc: 'pass', alignedDomain: 'gmail.com' };
  assert.equal(run({ from: 'supplier@gmail.com', authentication }, records).presentation, policy.labels.known);
  assert.equal(run({ from: 'other@gmail.com', authentication }, records).presentation, policy.labels.unknown);
});

test('single-registrar choice cannot authorize a live known label', () => {
  const records = singleRegistrarRegistry();
  const captured = policy.assessCapturedMessage(message, records, scope, now);
  assert.equal(captured.presentation, policy.labels.unknown);
  assert.ok(captured.reasonCodes.includes('RECEIVING_BOUNDARY_NOT_VALIDATED'));
  assert.equal(captured.canApplyPositiveLabel, false);
  assert.throws(() => policy.nextCategories([], run({}, records)), /Not known/);
});

test('registrar authority applies to party and domain evidence', () => {
  const party = singleRegistrarRegistry();
  party.parties[0].reviewerId = 'not-authorized';
  assert.equal(run({}, party).presentation, policy.labels.unknown);

  const domainRecords = singleRegistrarRegistry();
  domainRecords.domains[0].reviewerId = 'not-authorized';
  assert.equal(run({ from: 'other@vendor.example' }, domainRecords).presentation, policy.labels.unknown);
});

test('message input cannot choose or mutate verification authority', () => {
  const records = singleRegistrarRegistry();
  const authority = records.verificationAuthority;
  delete records.verificationAuthority;
  assert.equal(run({ verificationAuthority: authority }, records).presentation, policy.labels.unknown);
  records.verificationAuthority = authority;
  const before = JSON.stringify(records);
  run({}, records);
  assert.equal(JSON.stringify(records), before);
});

test('malformed verification-authority settings throw rather than relax Known', () => {
  for (const authority of [
    null,
    [],
    'single-registrar',
    {},
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

test('category helper rejects incompatible assessment shapes', () => {
  const result = run({ authentication: undefined });
  assert.throws(() => policy.nextCategories([], { ...result, policyVersion: 'other' }), /Not known/);
  assert.throws(() => policy.nextCategories([], { ...result, evidenceMode: 'trusted-live' }), /Not known/);
  assert.throws(() => policy.nextCategories([], { ...result, canApplyPositiveLabel: true }), /Not known/);
});
