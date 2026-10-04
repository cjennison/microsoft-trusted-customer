'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { install, resourceNames, guardTables } = require('../src/provisioning/registrar.js');

const target = {
  environmentOrigin: 'https://synthetic.crm.dynamics.com',
  organizationId: '11111111-1111-1111-1111-111111111111',
  environmentType: 'Sandbox',
  authorizationConfirmed: true
};
const payload = {
  assembly: 'synthetic-assembly', html: 'synthetic-html', javascript: 'synthetic-js', css: 'synthetic-css',
  verificationAuthorityMode: 'single-registrar'
};

test('registrar deployment rejects production and unselected verification mode before every request', async () => {
  let requests = 0;
  const context = {
    origin: target.environmentOrigin,
    fetch: async () => { requests++; assert.fail('No requests should occur.'); }
  };
  await assert.rejects(install({ ...target, environmentType: 'Production' }, payload, context), /Sandbox or Developer/);
  await assert.rejects(install(target, { ...payload, verificationAuthorityMode: 'independent-review' }, context),
    /explicitly selected single-registrar/);
  await assert.rejects(install(target, { ...payload, verificationAuthorityMode: undefined }, context),
    /explicitly selected single-registrar/);
  assert.equal(requests, 0);
});

test('registrar organization mismatch prevents all deployment writes', async () => {
  const requests = [];
  await assert.rejects(install(target, payload, {
    origin: target.environmentOrigin,
    fetch: async (url, options) => {
      requests.push({ url, method: options.method });
      assert.equal(options.credentials, 'same-origin');
      assert.equal(options.redirect, 'error');
      return {
        ok: true, status: 200,
        json: async () => ({ OrganizationId: '22222222-2222-2222-2222-222222222222' })
      };
    }
  }), /no writes performed/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'GET');
});

test('registrar deployment fails explicitly on access denial rather than treating it as absent components', async () => {
  await assert.rejects(install(target, payload, {
    origin: target.environmentOrigin,
    fetch: async () => ({
      ok: false, status: 403, text: async () => 'Synthetic access denied'
    })
  }), /failed \(403\)/);
});

test('managed or mismatched development schemas prevent every registrar deployment write', async () => {
  for (const solution of [
    { solutionid: 'synthetic-solution', version: '0.7.0.0', ismanaged: true },
    { solutionid: 'synthetic-solution', version: '0.6.0.0', ismanaged: false }
  ]) {
    const requests = [];
    await assert.rejects(install(target, payload, {
      origin: target.environmentOrigin,
      fetch: async (url, options) => {
        requests.push(options.method);
        return {
          ok: true, status: 200,
          json: async () => url.endsWith('/WhoAmI')
            ? { OrganizationId: target.organizationId } : { value: [solution] }
        };
      }
    }), /no writes performed/);
    assert.deepEqual(requests, ['GET', 'GET']);
  }
});

test('registry guards cover the four approval record types and not mailbox health or assessments', () => {
  assert.deepEqual(guardTables, [
    'mtc_businessparty', 'mtc_approvedcontact', 'mtc_approveddomain', 'mtc_verificationcase'
  ]);
  assert.equal(Object.keys(resourceNames).length, 3);
});

test('app is dependency-free, avoids HTML injection, and has no mail-content or credential requests', () => {
  const root = path.resolve(__dirname, '..');
  const script = fs.readFileSync(path.join(root, 'src', 'registrar-app', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src', 'registrar-app', 'index.html'), 'utf8');
  assert.doesNotMatch(script, /innerHTML|document\.write|eval\(|localStorage|sessionStorage/);
  assert.doesNotMatch(script + html, /https:\/\/.*(?:cdn|unpkg|jsdelivr)|Mail\.Send|access_token|clientSecret/);
  assert.match(script, /textContent/);
  assert.match(script, /url\.origin !== location\.origin/);
  assert.match(script, /mtc_VerifySender/);
  assert.match(script, /mtc_RevokeSender/);
  assert.match(script, /mtc_SetMailboxEnrollment/);
  assert.match(script, /Enrolled: false/);
  assert.match(html, /ownership-confirmed.*required/);
});
