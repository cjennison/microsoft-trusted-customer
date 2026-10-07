'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { install, resourceNames, guardTables, reconcileRequestParameters, verifySenderDefinition } = require('../src/provisioning/registrar.js');

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
    { solutionid: 'synthetic-solution', version: '0.9.0.0', ismanaged: true },
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

test('custom API parameter optionality is reconciled by recreation, and other drift stops deployment', async () => {
  const existing = [
    ['TargetType', 10, false], ['TargetValue', 10, false], ['BusinessName', 10, false],
    ['VerificationMethod', 10, false], ['EvidenceReference', 10, true], ['ExpiresOn', 1, false]
  ].map(([uniquename, type, isoptional], index) => ({ customapirequestparameterid: `p${index}`, uniquename, type, isoptional }));
  const calls = [];
  const request = async (path, method = 'GET', body) => {
    calls.push({ path, method, body });
    return method === 'GET' ? { value: existing } : null;
  };
  const changes = await reconcileRequestParameters(request, verifySenderDefinition, 'api-1');
  assert.deepEqual(changes, ['mtc_VerifySender.VerificationMethod optional', 'mtc_VerifySender.ExpiresOn optional']);
  assert.deepEqual(calls.slice(1).map(call => `${call.method} ${call.path}`), [
    'DELETE customapirequestparameters(p3)', 'POST customapirequestparameters',
    'DELETE customapirequestparameters(p5)', 'POST customapirequestparameters'
  ]);
  assert.equal(calls[2].body.isoptional, true);
  assert.equal(calls[2].body['CustomAPIId@odata.bind'], '/customapis(api-1)');
  assert.equal(calls[4].body.type, 1);

  for (const drift of [
    existing.filter(item => item.uniquename !== 'ExpiresOn'),
    existing.map(item => item.uniquename === 'ExpiresOn' ? { ...item, type: 10 } : item),
    [...existing, { customapirequestparameterid: 'extra', uniquename: 'Extra', type: 10, isoptional: true }]
  ]) {
    const writes = [];
    await assert.rejects(reconcileRequestParameters(async (path, method = 'GET') => {
      if (method !== 'GET') writes.push(path);
      return { value: drift };
    }, verifySenderDefinition, 'api-1'), /parameter conflicts|Unexpected custom API parameters/);
    assert.equal(writes.length, 0, 'Drift must be detected before any parameter is deleted.');
  }
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
