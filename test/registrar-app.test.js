'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('mailbox badges render actual Dataverse health choices and retain unknown states', async () => {
  const { elements, requests } = await loadRegistrar('');
  const choices = [100000000, 100000001, 100000002, 100000003, 100000004, null, undefined];
  const expected = ['Not started', 'Healthy', 'Degraded', 'Failed', 'Unknown', 'Unknown', 'Unknown'];
  const rows = elements.get('mailbox-rows').children;
  assert.equal(rows.length, choices.length);
  for (let index = 0; index < expected.length; index++) {
    const badge = rows[index].children[4].children[0];
    assert.equal(badge.textContent, expected[index]);
    assert.equal(badge.className, expected[index] === 'Failed' ? 'badge failed' : 'badge ');
  }
  assert.equal(requests.length, 7);
});

test('verification details follow the client required-field setting', async () => {
  const optional = (await loadRegistrar('')).elements;
  for (const id of ['verification-method', 'evidence-reference', 'expiry']) {
    assert.equal(optional.get(id).required, false);
    assert.match(optional.get(`${id}-label`).textContent, /\(optional\)$/);
  }
  assert.equal(optional.get('operator-alert-count').textContent, '0');
  assert.equal(optional.get('expiry').value, '');
  assert.equal(optional.get('verification-method-blank').textContent, 'Not recorded');

  const forced = (await loadRegistrar('ExpiresOn, EvidenceReference')).elements;
  assert.equal(forced.get('expiry').required, true);
  assert.equal(forced.get('evidence-reference').required, true);
  assert.equal(forced.get('verification-method').required, false);
  assert.doesNotMatch(forced.get('expiry-label').textContent, /optional/);
  assert.match(forced.get('expiry').value, /^\d{4}-\d{2}-\d{2}$/);

  const missing = (await loadRegistrar(undefined)).elements;
  for (const id of ['verification-method', 'evidence-reference', 'expiry'])
    assert.equal(missing.get(id).required, true, 'A missing setting fails closed to required.');

  await assert.rejects(loadRegistrar('Bogus'), /required-field configuration is invalid/);
});

async function loadRegistrar(requiredFields) {
  const choices = [100000000, 100000001, 100000002, 100000003, 100000004, null, undefined];
  const elements = new Map();
  let loaded;
  let failed;
  const ready = new Promise((resolve, reject) => { loaded = resolve; failed = reject; });

  function node(id) {
    let text = '';
    return {
      children: [], value: '', dataset: {},
      classList: { toggle() {} },
      addEventListener() {},
      append(child) { this.children.push(child); },
      replaceChildren() { this.children = []; },
      get textContent() { return text; },
      set textContent(value) {
        text = value;
        if (id === 'message' && value.startsWith('Registry loaded.')) loaded();
        if (id === 'message' && value.startsWith('Could not load the registry:')) failed(new Error(value));
      }
    };
  }

  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, node(id));
      return elements.get(id);
    },
    createElement() { return node(); },
    querySelectorAll() { return []; }
  };
  const requests = [];
  const context = {
    document,
    location: { origin: 'https://synthetic.crm.dynamics.com' },
    URL, URLSearchParams,
    setInterval() {},
    fetch: async (url, options) => {
      requests.push(options.method);
      assert.equal(options.method, 'GET');
      assert.equal(options.credentials, 'same-origin');
      let result;
      const endpoint = url.pathname.split('/').pop();
      switch (endpoint) {
        case 'mtc_mailboxenrollments':
          result = {
            value: choices.map((choice, index) => ({
              mtc_mailboxreference: `mailbox${index}@fixture.example`,
              mtc_mailboxtype: 100000000,
              mtc_enrollmentstatus: 100000001,
              mtc_healthstate: choice
            }))
          };
          break;
        case 'environmentvariabledefinitions':
          result = {
            value: [{
              schemaname: 'mtc_ProcessingMode', defaultvalue: 'Disabled',
              environmentvariabledefinition_environmentvariablevalue: [{ value: 'Shadow', statecode: 0 }]
            }, ...(requiredFields === undefined ? [] : [{
              schemaname: 'mtc_RequiredRegistrarFields', defaultvalue: '',
              environmentvariabledefinition_environmentvariablevalue: [{ value: requiredFields, statecode: 0 }]
            }])]
          };
          break;
        case 'WhoAmI':
          result = { UserId: '11111111-1111-1111-1111-111111111111' };
          break;
        case 'mtc_approvedcontacts':
        case 'mtc_approveddomains':
        case 'mtc_businessparties':
        case 'appnotifications':
          result = { value: [] };
          break;
        default:
          assert.fail(`Unexpected app request: ${endpoint}`);
      }
      return { ok: true, status: 200, json: async () => result };
    }
  };
  const script = fs.readFileSync(path.join(__dirname, '..', 'src', 'registrar-app', 'app.js'), 'utf8');
  vm.runInNewContext(script, context);
  await ready;
  return { elements, requests };
}
