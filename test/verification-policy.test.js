'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../src/registry/verification-policy.js');

const now = Date.parse('2026-10-03T12:00:00.000Z');
const authority = {
  mode: 'single-registrar',
  principals: [
    { id: 'registrar-one', roles: ['registrar'] },
    { id: 'registrar-two', roles: ['registrar'] },
    { id: 'reviewer-one', roles: ['reviewer'] },
    { id: 'service-one', roles: ['service'] }
  ]
};
const command = {
  commandId: 'submit-one',
  partyId: 'party-one',
  target: { type: 'contact', value: 'ap@vendor.example' },
  evidenceReference: 'restricted-evidence-reference',
  verificationMethod: 'Established callback',
  expiresOn: '2027-10-03T12:00:00.000Z'
};

function context(actorId, changes = {}) {
  return {
    actorId,
    authority: structuredClone(authority),
    now,
    caseId: 'case-one',
    ...changes
  };
}

function pending(changes = {}, authorityChanges = {}) {
  return policy.submit({ ...structuredClone(command), ...changes },
    context('registrar-one', {
      authority: { ...structuredClone(authority), ...authorityChanges }
    })).caseRecord;
}

test('authorized registrar submits an exact contact and server stamps the requester', () => {
  const result = policy.submit(command, context('REGISTRAR-ONE'));
  assert.equal(result.caseRecord.status, 'pending');
  assert.equal(result.caseRecord.requestedBy, 'registrar-one');
  assert.equal(result.caseRecord.requestedOn, '2026-10-03T12:00:00.000Z');
  assert.deepEqual(result.caseRecord.target, { type: 'contact', value: 'ap@vendor.example' });
  assert.equal(result.registryRecord, null);
  assert.equal(result.auditEvent.actorId, 'registrar-one');
});

test('commands cannot forge requester, verifier, status, or timestamps', () => {
  for (const field of [
    'actorId', 'actualVerifierId', 'approvedBy', 'requestedBy', 'reviewerId',
    'status', 'verifiedOn', 'auditTrail'
  ]) {
    assert.throws(() => policy.submit({ ...command, [field]: 'forged' },
      context('registrar-one')), /server-stamped/);
  }
});

test('unauthorized and service identities cannot submit verification', () => {
  assert.throws(() => policy.submit(command, context('unknown')), /authorized registrar/);
  assert.throws(() => policy.submit(command, context('service-one')), /authorized registrar/);
  assert.throws(() => policy.submit(command, context('reviewer-one')), /authorized registrar/);
});

test('single-registrar mode permits an authorized requester to approve their case', () => {
  const result = policy.approve(pending(), { commandId: 'approve-one' },
    context('registrar-one'));
  assert.equal(result.caseRecord.status, 'approved');
  assert.equal(result.caseRecord.approvedBy, 'registrar-one');
  assert.equal(result.caseRecord.verifiedOn, '2026-10-03T12:00:00.000Z');
  assert.equal(result.registryRecord.verificationStatus, 'approved');
  assert.equal(result.registryRecord.independentVerification, true);
  assert.equal(result.registryRecord.reviewerId, 'registrar-one');
});

test('single-registrar mode supports multiple authorized registrars', () => {
  const result = policy.approve(pending(), { commandId: 'approve-two' },
    context('REGISTRAR-TWO'));
  assert.equal(result.caseRecord.approvedBy, 'registrar-two');
});

test('independent-review mode requires a distinct authorized reviewer', () => {
  const independent = pending({}, { mode: 'independent-review' });
  assert.throws(() => policy.approve(independent, { commandId: 'self-approve' },
    context('registrar-one', {
      authority: { ...structuredClone(authority), mode: 'independent-review' }
    })), /authorized reviewer|distinct reviewer/);
  const approved = policy.approve(independent, { commandId: 'independent-approve' },
    context('reviewer-one', {
      authority: { ...structuredClone(authority), mode: 'independent-review' }
    }));
  assert.equal(approved.caseRecord.approvedBy, 'reviewer-one');
});

test('approval fails closed for expired evidence and invalid transitions', () => {
  const expired = pending({ expiresOn: '2026-10-03T12:00:01.000Z' });
  assert.throws(() => policy.approve(expired, { commandId: 'late' },
    context('registrar-one', { now: now + 1000 })), /Expired/);
  const approved = policy.approve(pending(), { commandId: 'approve' },
    context('registrar-one')).caseRecord;
  assert.throws(() => policy.approve(approved, { commandId: 'approve-again' },
    context('registrar-one')), /Only pending/);
});

test('single-registrar rejection requires an authorized registrar and a reason', () => {
  assert.throws(() => policy.reject(pending(), { commandId: 'reject' },
    context('registrar-one')), /Rejection reason/);
  assert.throws(() => policy.reject(pending(), {
    commandId: 'reject', reason: 'Evidence could not be independently confirmed.'
  }, context('reviewer-one')), /authorized registrar/);
  const result = policy.reject(pending(), {
    commandId: 'reject', reason: 'Evidence could not be independently confirmed.'
  }, context('registrar-one'));
  assert.equal(result.caseRecord.status, 'rejected');
  assert.equal(result.registryRecord, null);
});

test('independent-review rejection requires an authorized reviewer', () => {
  const independent = pending({}, { mode: 'independent-review' });
  assert.throws(() => policy.reject(independent, {
    commandId: 'reject', reason: 'Evidence could not be independently confirmed.'
  }, context('registrar-one', {
    authority: { ...structuredClone(authority), mode: 'independent-review' }
  })), /authorized reviewer/);
  const result = policy.reject(independent, {
    commandId: 'reject', reason: 'Evidence could not be independently confirmed.'
  }, context('reviewer-one', {
    authority: { ...structuredClone(authority), mode: 'independent-review' }
  }));
  assert.equal(result.caseRecord.rejectedBy, 'reviewer-one');
});

test('revocation requires an authorized registrar, an approved case, and a reason', () => {
  const approved = policy.approve(pending(), { commandId: 'approve' },
    context('registrar-one')).caseRecord;
  assert.throws(() => policy.revoke(approved, {
    commandId: 'revoke', reason: 'Compromise reported.'
  }, context('reviewer-one')), /authorized registrar/);
  assert.throws(() => policy.revoke(approved, { commandId: 'revoke' },
    context('registrar-one')), /Revocation reason/);
  const result = policy.revoke(approved, {
    commandId: 'revoke', reason: 'Compromise reported.'
  }, context('registrar-two', { now: now + 1000 }));
  assert.equal(result.caseRecord.status, 'revoked');
  assert.equal(result.registryRecord.verificationStatus, 'revoked');
  assert.equal(result.registryRecord.revokedBy, 'registrar-two');
});

test('consumer domains require exact-address verification', () => {
  assert.throws(() => policy.submit({
    ...command,
    target: { type: 'domain', value: 'gmail.com' }
  }, context('registrar-one')), /consumer-mail/);
  const exact = policy.submit({
    ...command,
    target: { type: 'contact', value: 'supplier@gmail.com' }
  }, context('registrar-one'));
  assert.equal(exact.caseRecord.target.value, 'supplier@gmail.com');
});

test('business domains normalize exactly without granting subdomains', () => {
  const result = policy.submit({
    ...command,
    target: { type: 'domain', value: 'BÜCHER.example' }
  }, context('registrar-one'));
  assert.deepEqual(result.caseRecord.target,
    { type: 'domain', value: 'xn--bcher-kva.example' });
});

test('evidence, method, expiry, identifiers, and target inputs are mandatory', () => {
  for (const changes of [
    { evidenceReference: '' },
    { verificationMethod: ' ' },
    { expiresOn: 'not-a-date' },
    { expiresOn: '2026-10-03T12:00:00.000Z' },
    { partyId: ' party-one' },
    { commandId: '' },
    { target: { type: 'contact', value: 'Name <ap@vendor.example>' } },
    { target: { type: 'domain', value: 'vendor.example/path' } }
  ]) {
    assert.throws(() => policy.submit({ ...command, ...changes },
      context('registrar-one')));
  }
});

test('transition command identifiers are idempotent and cannot be reused for another action', () => {
  const approved = policy.approve(pending(), { commandId: 'decision-one' },
    context('registrar-one'));
  const replay = policy.approve(approved.caseRecord, { commandId: 'decision-one' },
    context('registrar-one'));
  assert.equal(replay.idempotentReplay, true);
  assert.deepEqual(replay.caseRecord, approved.caseRecord);
  assert.throws(() => policy.revoke(approved.caseRecord, {
    commandId: 'decision-one', reason: 'Reuse should fail.'
  }, context('registrar-one')), /another transition/);
});

test('authority configuration rejects duplicate principals, unknown roles, and malformed modes', () => {
  for (const badAuthority of [
    null,
    { mode: 'other', principals: [] },
    { mode: 'single-registrar', principals: [] },
    {
      mode: 'single-registrar',
      principals: [
        { id: 'same', roles: ['registrar'] },
        { id: 'SAME', roles: ['reviewer'] }
      ]
    },
    {
      mode: 'single-registrar',
      principals: [{ id: 'person', roles: ['owner'] }]
    }
  ]) {
    assert.throws(() => policy.submit(command,
      context('registrar-one', { authority: badAuthority })), /authority|principal|role/i);
  }
});

test('policy never mutates commands, authority, or case inputs', () => {
  const submitted = pending();
  const approveCommand = { commandId: 'approve-immutable' };
  const approveContext = context('registrar-one');
  const before = JSON.stringify({ submitted, approveCommand, approveContext });
  policy.approve(submitted, approveCommand, approveContext);
  assert.equal(JSON.stringify({ submitted, approveCommand, approveContext }), before);
});
