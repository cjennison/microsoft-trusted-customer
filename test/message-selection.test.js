'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const runtime = require('../src/runtime/message-selection.js');
const proof = require('../src/qualification/proof-policy.js');

const mailboxId = 'synthetic-mailbox';
const folderId = 'synthetic-folder';
const internetMessageId = '<same-conversation@example.invalid>';
const messages = [
  {
    id: 'immutable-one',
    idType: 'immutable',
    mailboxId,
    folderId,
    subject: '[MTC-PROOF] Synthetic category write test',
    internetMessageId,
    categories: ['Personal'],
    etag: 'W/"one"',
    receivedOn: '2026-10-03T13:03:01.000Z'
  },
  {
    id: 'immutable-two',
    idType: 'immutable',
    mailboxId,
    folderId,
    subject: '[MTC-PROOF] Synthetic category write test',
    internetMessageId,
    categories: [proof.labels.unknown],
    etag: 'W/"two"',
    receivedOn: '2026-10-03T13:03:02.000Z'
  }
];
const selection = {
  idType: 'immutable',
  mailboxId,
  folderId,
  immutableMessageId: 'immutable-one',
  subjectPrefix: '[MTC-PROOF]'
};
const assessment = {
  policyVersion: proof.version,
  evidenceMode: 'captured-message-unvalidated',
  proofOnly: true,
  canApplyPositiveLabel: false,
  presentation: proof.labels.unknown
};

test('selects one immutable item even when Internet Message ID and subject are duplicated', () => {
  const selected = runtime.selectScopedMessage(messages, selection);
  assert.equal(selected.id, 'immutable-one');
  assert.equal(selected.internetMessageId, internetMessageId);
  assert.deepEqual(selected.categories, ['Personal']);
});

test('selection never accepts Internet Message ID or conversation identity as the key', () => {
  assert.throws(() => runtime.selectScopedMessage(messages, {
    ...selection,
    immutableMessageId: internetMessageId
  }), /Exactly one immutable message/);
  assert.throws(() => runtime.selectScopedMessage(messages, {
    ...selection,
    immutableMessageId: undefined,
    internetMessageId
  }), /Immutable message identifier/);
});

test('rejects mutable IDs, duplicate IDs, missing matches, and scope drift', () => {
  assert.throws(() => runtime.selectScopedMessage(messages, {
    ...selection, idType: 'rest'
  }), /immutable/);
  assert.throws(() => runtime.selectScopedMessage([
    messages[0], { ...messages[0] }
  ], selection), /Exactly one/);
  for (const change of [
    { immutableMessageId: 'missing' },
    { mailboxId: 'other-mailbox' },
    { folderId: 'other-folder' },
    { subjectPrefix: '[OTHER]' }
  ]) {
    assert.throws(() => runtime.selectScopedMessage(messages, {
      ...selection, ...change
    }));
  }
});

test('category patch preserves unrelated categories and adds only the owned proof label', () => {
  const plan = runtime.planCategoryPatch(messages, selection, assessment);
  assert.deepEqual(plan.body.categories,
    ['Personal', proof.labels.unknown]);
  assert.equal(plan.messageId, 'immutable-one');
  assert.equal(plan.headers['If-Match'], 'W/"one"');
  assert.equal(plan.headers.Prefer, 'IdType="ImmutableId"');
  assert.equal(plan.relativeUri, '/me/messages/immutable-one');
  assert.equal(plan.requiresWrite, true);
});

test('category patch is a no-op when the exact presentation already exists', () => {
  const plan = runtime.planCategoryPatch(messages, {
    ...selection, immutableMessageId: 'immutable-two'
  }, assessment);
  assert.deepEqual(plan.body.categories, [proof.labels.unknown]);
  assert.equal(plan.requiresWrite, false);
});

test('category patch replaces only service-owned proof categories', () => {
  const source = [{
    ...messages[0],
    categories: ['Personal', proof.labels.known, 'Copied badge']
  }];
  const plan = runtime.planCategoryPatch(source, selection, assessment);
  assert.deepEqual(plan.body.categories,
    ['Personal', 'Copied badge', proof.labels.unknown]);
});

test('malformed message metadata fails explicitly before a write plan exists', () => {
  for (const mutate of [
    message => { message.idType = 'rest'; },
    message => { message.id = ''; },
    message => { message.categories = undefined; },
    message => { message.categories = [null]; },
    message => { message.etag = ''; },
    message => { message.subject = null; }
  ]) {
    const source = structuredClone(messages);
    mutate(source[0]);
    assert.throws(() => runtime.planCategoryPatch(source, selection, assessment));
  }
});

test('message selection and patch planning never mutate inputs', () => {
  const source = structuredClone(messages);
  const chosen = structuredClone(selection);
  const result = structuredClone(assessment);
  const before = JSON.stringify({ source, chosen, result });
  runtime.planCategoryPatch(source, chosen, result);
  assert.equal(JSON.stringify({ source, chosen, result }), before);
});
