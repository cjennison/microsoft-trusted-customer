'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  workflowId, graphApiName, buildClientData, validateTarget
} = require('../src/runtime/shadow-flow.js');

const target = {
  environmentOrigin: 'https://synthetic.crm.dynamics.com',
  organizationId: '11111111-1111-1111-1111-111111111111',
  environmentType: 'Sandbox',
  authorizationConfirmed: true
};

test('shadow flow is scheduled, connection-reference based, and category-write free', () => {
  const flow = buildClientData();
  const text = JSON.stringify(flow);
  const definition = flow.properties.definition;
  assert.match(workflowId, /^[0-9a-f-]{36}$/);
  assert.equal(definition.triggers.Recurrence.recurrence.interval, 5);
  assert.equal(definition.triggers.Recurrence.recurrence.frequency, 'Minute');
  assert.equal(flow.properties.connectionReferences[graphApiName].runtimeSource, 'embedded');
  assert.equal(
    flow.properties.connectionReferences[graphApiName].connection.connectionReferenceLogicalName,
    'mtc_MTCGraphMail'
  );
  assert.match(text, /ListInboxMessages/);
  assert.match(text, /GetMessageMetadata/);
  assert.match(text, /IdType=\\?"ImmutableId\\?"/);
  assert.match(text, /internetMessageHeaders/);
  assert.match(text, /MTC_SHADOW_NO_PRESENTATION/);
  assert.doesNotMatch(text, /UpdateMessageCategories|MTC Proof - known sender|MTC Proof - not known/);
});

test('shadow flow fails closed on mailbox scope, paging, duplicate assessments, and authentication ambiguity', () => {
  const text = JSON.stringify(buildClientData());
  assert.match(text, /mtc_enrollmentstatus eq 100000001/);
  assert.match(text, /@odata\.nextLink/);
  assert.match(text, /MTC_DUPLICATE_ASSESSMENT/);
  assert.match(text, /MTC_AUTH_BOUNDARY_MISSING_OR_AMBIGUOUS/);
  assert.match(text, /startsWith\(toLower\(trim\(string\(item\(\)\?\['value'\]\)\)\), 'mx\.microsoft\.com'\)/);
  assert.match(text, /mtc_presentationstatus/);
  assert.match(text, /100000000/);
});

test('shadow flow stores metadata only and contains no tenant-local identities', () => {
  const text = JSON.stringify(buildClientData());
  assert.doesNotMatch(text, /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  assert.doesNotMatch(text, /graph\.microsoft\.com\/v1\.0\/users\//i);
  assert.doesNotMatch(text, /"(body|attachments?|uniqueBody|bodyPreview)"\s*:/i);
  assert.match(text, /mtc_stablemessageid/);
  assert.match(text, /mtc_mailboxreference/);
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
