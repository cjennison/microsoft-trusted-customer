'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const {
  workflowId, graphApiName, buildClientData, validateTarget
} = require('../src/runtime/shadow-flow.js');

const target = {
  environmentOrigin: 'https://synthetic.crm.dynamics.com',
  organizationId: '11111111-1111-1111-1111-111111111111',
  environmentType: 'Sandbox',
  authorizationConfirmed: true
};

test('portable shadow definition and connector script match their source implementations', () => {
  const exported = JSON.parse(readFileSync(join(__dirname, '..', 'solutions', 'MicrosoftTrustedCustomer', 'Workflows',
    'MTCProcessor-scheduledshadowassessment-81B229C4-D759-49A7-93DA-816056E8841C.json'), 'utf8'));
  assert.deepEqual(exported.properties.definition, buildClientData().properties.definition);
  assert.equal(readFileSync(join(__dirname, '..', 'src', 'runtime', 'graph-paging.cs'), 'utf8'),
    readFileSync(join(__dirname, '..', 'solutions', 'MicrosoftTrustedCustomer', 'Connectors',
      'mtc_mtc-20microsoft-20graph-20mail_customcodeblobcontent.csx'), 'utf8'));
});

test('shadow flow is scheduled, connection-reference based, and category-write free', () => {
  const flow = buildClientData();
  const text = JSON.stringify(flow);
  const definition = flow.properties.definition;
  assert.match(workflowId, /^[0-9a-f-]{36}$/);
  assert.equal(definition.triggers.Recurrence.recurrence.interval, 3);
  assert.equal(definition.triggers.Recurrence.recurrence.frequency, 'Minute');
  assert.equal(flow.properties.connectionReferences[graphApiName].runtimeSource, 'embedded');
  assert.equal(
    flow.properties.connectionReferences[graphApiName].connection.connectionReferenceLogicalName,
    'mtc_MTCGraphMail'
  );
  assert.match(text, /ListMailboxMessages/);
  assert.match(text, /mtc_ProcessMessageBatch/);
  assert.match(text, /IdType=\\?"ImmutableId\\?"/);
  assert.match(text, /internetMessageHeaders/);
  assert.match(text, /ImmutableIdsApplied/);
  assert.doesNotMatch(text, /UpdateMessageCategories|MTC Proof - known sender|MTC Proof - not known/);
});

test('shadow flow delegates leases and policy to server APIs and persists each complete Graph page', () => {
  const text = JSON.stringify(buildClientData());
  assert.match(text, /mtc_enrollmentstatus eq 100000001/);
  assert.match(text, /@odata\.nextLink/);
  assert.match(text, /mtc_BeginMailboxPoll/);
  assert.match(text, /mtc_CompleteMailboxPage/);
  assert.match(text, /mtc_ReportMailboxFailure/);
  assert.match(text, /MTC_MAILBOX_PROCESSING_FAILED/);
  assert.match(text, /runs":1/);
  assert.match(text, /Stop_on_page_failure/);
  assert.match(text, /variables\('PageFailed'\)/);
  assert.match(text, /unfinished cursor was preserved/);
});

test('shadow flow stores metadata only and contains no tenant-local identities', () => {
  const text = JSON.stringify(buildClientData());
  assert.doesNotMatch(text, /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  assert.doesNotMatch(text, /graph\.microsoft\.com\/v1\.0\/users\//i);
  assert.doesNotMatch(text, /"(body|attachments?|uniqueBody|bodyPreview)"\s*:/i);
  assert.match(text, /MessagesJson/);
  assert.match(text, /MailboxRecordId/);
});

test('shadow target guard accepts only the approved current development origin', () => {
  assert.doesNotThrow(() => validateTarget(target, target.environmentOrigin));
  for (const change of [
    { environmentType: 'Production' },
    { authorizationConfirmed: false },
    { organizationId: 'not-a-guid' },
    { environmentOrigin: 'https://synthetic.crm.dynamics.com.attacker.invalid' }
  ]) {
    assert.throws(() => validateTarget({ ...target, ...change }, target.environmentOrigin));
  }
  assert.throws(() => validateTarget(target, 'https://other.crm.dynamics.com'));
});
