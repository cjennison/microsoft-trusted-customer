'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildClientData } = require('../src/runtime/presentation-flow.js');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

test('portable presentation definition matches its source implementation', () => {
  const exported = JSON.parse(readFileSync(join(__dirname, '..', 'solutions', 'MicrosoftTrustedCustomer', 'Workflows',
    'MTCProcessor-authorizedOutlookpresentation-92696BE8-AD52-4B79-81B2-0DEE193808CF.json'), 'utf8'));
  assert.deepEqual(exported.properties.definition, buildClientData().properties.definition);
});

test('presentation worker checks independent label authorization before enumerating any messages', () => {
  const flow = buildClientData();
  const actions = flow.properties.definition.actions;
  assert.equal(actions.Check_explicit_label_authorization.inputs.parameters.actionName, 'mtc_IsLabelingEnabled');
  assert.ok(actions.Require_explicit_label_authorization.actions.List_pending_presentations);
  assert.deepEqual(actions.Require_explicit_label_authorization.else.actions, {});
  assert.equal(flow.properties.definition.triggers.Recurrence.runtimeConfiguration.concurrency.runs, 1);
});

test('presentation worker reads fresh immutable metadata, plans current eligibility, uses ETag, and verifies exact readback', () => {
  const text = JSON.stringify(buildClientData());
  assert.match(text, /GetMessageMetadata/);
  assert.match(text, /mtc_GetMessageLabelPlan/);
  assert.match(text, /If-Match/);
  assert.match(text, /UpdateMessageCategories/);
  assert.match(text, /mtc_VerifyMessagePresentation/);
  assert.match(text, /mtc_ReportPresentationFailure/);
  assert.match(text, /MTC_PRESENTATION_FAILED/);
  assert.doesNotMatch(text, /SendMail|DeleteMessage|MoveMessage|bodyPreview|attachments/);
  assert.doesNotMatch(text, /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
});
