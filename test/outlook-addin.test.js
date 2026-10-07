'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const addin = require('../src/outlook-addin/public/taskpane.js');

const appScript = fs.readFileSync(path.join(__dirname, '..', 'src', 'registrar-app', 'app.js'), 'utf8');

async function loadApp(search) {
  const elements = new Map();
  const panels = [];
  const statuses = [];
  const requests = [];
  function node(id) {
    let text = '';
    return {
      id, children: [], value: '', checked: false, dataset: {}, hidden: false,
      classList: { toggle() {} },
      addEventListener() {},
      append(child) { this.children.push(child); },
      replaceChildren() { this.children = []; },
      focus() {},
      get textContent() { return text; },
      set textContent(value) { text = value; if (id === 'message') statuses.push(value); }
    };
  }
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, node(id));
      return elements.get(id);
    },
    createElement() { return node(); },
    querySelectorAll(selector) {
      if (selector !== 'main > section') return [];
      return ['senders', 'verify', 'mailboxes', 'health'].map(name => {
        const panel = document.getElementById(name);
        panels.push(panel);
        return panel;
      });
    }
  };
  const context = {
    document,
    location: { origin: 'https://synthetic.crm.dynamics.com', search },
    URL, URLSearchParams,
    setInterval() {},
    fetch: async (url, options) => {
      requests.push(`${options.method} ${url.pathname.split('/').pop()}`);
      const endpoint = url.pathname.split('/').pop();
      const result = endpoint === 'WhoAmI'
        ? { UserId: '11111111-1111-1111-1111-111111111111' }
        : endpoint === 'environmentvariabledefinitions'
          ? { value: [{ schemaname: 'mtc_ProcessingMode', defaultvalue: 'Disabled', environmentvariabledefinition_environmentvariablevalue: [] }] }
          : { value: [] };
      return { ok: true, status: 200, json: async () => result };
    }
  };
  vm.runInNewContext(appScript, context);
  for (let attempt = 0; attempt < 50 && !statuses.some(value => value.startsWith('Registry loaded.')); attempt++)
    await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  return { element: id => document.getElementById(id), statuses, requests };
}

test('Outlook prefill fills the verification form without approving anything', async () => {
  for (const [type, target] of [['contact', 'person@supplier.example'], ['domain', 'supplier.example']]) {
    const app = await loadApp(`?type=${type}&target=${encodeURIComponent(target)}`);
    assert.equal(app.element('target-type').value, type);
    assert.equal(app.element('target-value').value, target);
    assert.equal(app.element('ownership-confirmed').checked, false);
    assert.equal(app.element('verification-method').value, '');
    assert.equal(app.element('verify').hidden, false);
    assert.equal(app.element('senders').hidden, true);
    assert.match(app.statuses.at(-1), /Nothing is approved yet/);
    assert.ok(app.requests.every(request => request.startsWith('GET ')), 'prefill must never submit');
  }
});

test('malformed or mismatched Outlook prefill is ignored with a visible message', async () => {
  for (const search of ['?type=admin&target=a@b.example', '?type=contact&target=supplier.example',
    '?type=domain&target=a@b.example', '?type=contact&target=a%20b@c.example',
    `?type=domain&target=${'a'.repeat(321)}`]) {
    const app = await loadApp(search);
    assert.equal(app.element('target-value').value, '');
    assert.match(app.statuses.at(-1), /prefill was ignored/);
  }
  const plain = await loadApp('');
  assert.match(plain.statuses.at(-1), /^Registry loaded\./);
});

test('add-in only accepts an exact Dataverse origin and one sender address', () => {
  assert.equal(addin.registryOrigin('?registry=https%3A%2F%2Forg1.crm.dynamics.com'), 'https://org1.crm.dynamics.com');
  for (const bad of ['?registry=https%3A%2F%2Fevil.example', '?registry=http%3A%2F%2Forg.crm.dynamics.com',
    '?registry=https%3A%2F%2Forg.crm.dynamics.com.evil.example', '']) assert.equal(addin.registryOrigin(bad), null);
  assert.deepEqual(addin.senderTargets(' Person@Supplier.Example '), { address: 'person@supplier.example', domain: 'supplier.example' });
  for (const bad of ['', 'no-at', '@x.example', 'a@', 'a@b@c.example', 'a b@c.example', null]) assert.equal(addin.senderTargets(bad), null);
  const link = new URL(addin.registryLink('https://org1.crm.dynamics.com', 'domain', 'supplier.example'));
  assert.equal(link.origin, 'https://org1.crm.dynamics.com');
  assert.equal(link.pathname, '/WebResources/mtc_/registrar/index.html');
  assert.equal(link.searchParams.get('type'), 'domain');
  assert.equal(link.searchParams.get('target'), 'supplier.example');
});

test('add-in renders sender text safely and refuses misconfiguration', () => {
  const elements = new Map();
  const document = { getElementById: id => { if (!elements.has(id)) elements.set(id, { hidden: true }); return elements.get(id); } };
  assert.equal(addin.render(document, null, { emailAddress: 'a@b.example' }), false);
  assert.match(elements.get('message').textContent, /misconfigured/);
  assert.equal(addin.render(document, 'https://org1.crm.dynamics.com',
    { displayName: '<img src=x onerror=alert(1)>', emailAddress: 'A@Lookalike.example' }), true);
  assert.equal(elements.get('sender-name').textContent, '<img src=x onerror=alert(1)>');
  assert.equal(elements.get('sender-address').textContent, 'a@lookalike.example');
  assert.equal(elements.get('actions').hidden, false);
  assert.match(elements.get('verify-domain').href, /target=lookalike\.example/);
});

test('public add-in sources carry no tenant identifiers or credentials', () => {
  const root = path.join(__dirname, '..', 'src', 'outlook-addin');
  const template = fs.readFileSync(path.join(root, 'manifest.template.xml'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public', 'taskpane.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'public', 'taskpane.js'), 'utf8');
  assert.match(template, /\{\{ADDIN_ID\}\}/);
  assert.match(template, /\{\{TASKPANE_URL\}\}/);
  assert.match(template, /MobileMessageReadCommandSurface/);
  assert.match(template, /<Permissions>ReadItem<\/Permissions>/);
  assert.doesNotMatch(template + html + js, /crm\.dynamics\.com\/|sesturbo|onmicrosoft|access_token|clientSecret|Mail\.Send/i);
  assert.doesNotMatch(js, /innerHTML|document\.write|eval\(/);
});
