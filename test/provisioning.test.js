'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { solutionVersion, tables, relationships, environmentVariables, validateTarget, validateTable, bootstrap, exportSolution } =
  require('../src/provisioning/dataverse.js');

const target = {
  environmentOrigin: 'https://synthetic.crm.dynamics.com',
  organizationId: '11111111-1111-1111-1111-111111111111',
  environmentType: 'Sandbox',
  authorizationConfirmed: true
};

function metadata(definition) {
  return {
    ...structuredClone(definition),
    MetadataId: '22222222-2222-2222-2222-222222222222',
    Attributes: definition.Attributes.map(attribute => ({
      ...structuredClone(attribute),
      AttributeType: attribute['@odata.type'].split('.').at(-1).replace('AttributeMetadata', '')
    }))
  };
}

function fakeDataverse() {
  const state = { writes: [], tables: new Map(), relationships: new Map(), variables: new Map() };
  let publisher;
  let solution;
  state.setSolutionVersion = version => { solution.version = version; };
  const reply = (value, status = 200) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => structuredClone(value),
    text: async () => JSON.stringify(value)
  });
  state.fetch = async (url, options) => {
    assert.ok(url.startsWith(`${target.environmentOrigin}/api/data/v9.2/`));
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.redirect, 'error');
    const path = url.split('/api/data/v9.2/')[1];
    const body = options.body ? JSON.parse(options.body) : undefined;
    if (['POST', 'PATCH', 'PUT'].includes(options.method)) {
      state.writes.push({ path, body, headers: options.headers });
      if (options.method === 'PUT') {
        assert.ok(path.startsWith('EntityDefinitions('));
        assert.equal(options.headers['MSCRM.MergeLabels'], 'true');
        const table = state.tables.get(body.SchemaName.toLowerCase());
        assert.ok(table);
        table.IsAuditEnabled = structuredClone(body.IsAuditEnabled);
        return reply(null, 204);
      }
      if (path === 'InsertOptionValue') {
        const table = state.tables.get(body.EntityLogicalName);
        const attribute = table.Attributes.find(item => item.SchemaName.toLowerCase() === body.AttributeLogicalName);
        attribute.OptionSet.Options.push({ Value: body.Value, Label: structuredClone(body.Label) });
        return reply({ NewOptionValue: body.Value });
      }
      if (options.method === 'PATCH') {
        if (path.startsWith('solutions(')) {
          solution = { ...solution, ...body };
          return reply(null, 204);
        }
        assert.fail(`Unexpected PATCH: ${path}`);
      }
      if (path === 'publishers') {
        publisher = { ...body, publisherid: '33333333-3333-3333-3333-333333333333' };
        return reply(publisher, 201);
      }
      if (path === 'solutions') {
        solution = { ...body, ismanaged: false, _publisherid_value: publisher.publisherid };
        return reply(solution, 201);
      }
      if (path === 'EntityDefinitions') {
        state.tables.set(body.SchemaName.toLowerCase(), metadata(body));
        return reply(null, 204);
      }
      if (path.startsWith('EntityDefinitions(') && path.endsWith('/Attributes')) {
        const name = /LogicalName='([^']+)'/.exec(path)[1];
        const table = state.tables.get(name);
        assert.ok(table);
        table.Attributes.push({
          ...structuredClone(body),
          AttributeType: body['@odata.type'].split('.').at(-1).replace('AttributeMetadata', '')
        });
        return reply(null, 204);
      }
      if (path === 'RelationshipDefinitions') {
        state.relationships.set(body.SchemaName, { ...body, ReferencingAttribute: body.Lookup.SchemaName.toLowerCase() });
        return reply(null, 204);
      }
      if (path === 'environmentvariabledefinitions') {
        const variable = { ...body, environmentvariabledefinitionid: '44444444-4444-4444-4444-444444444444' };
        state.variables.set(body.schemaname, variable);
        return reply(variable, 201);
      }
      if (['AddSolutionComponent', 'PublishXml'].includes(path)) return reply(null, 204);
      assert.fail(`Unexpected POST: ${path}`);
    }
    if (path === 'WhoAmI') return reply({ OrganizationId: target.organizationId });
    if (path.startsWith('publishers?')) return reply({ value: publisher ? [publisher] : [] });
    if (path.startsWith('solutions?')) return reply({ value: solution ? [solution] : [] });
    if (path.startsWith('environmentvariablevalues?')) return reply({ value: [] });
    if (path.startsWith('environmentvariabledefinitions?')) {
      const name = /schemaname eq '([^']+)'/.exec(path)[1];
      return reply({ value: state.variables.has(name) ? [state.variables.get(name)] : [] });
    }
    if (path.startsWith('EntityDefinitions(')) {
      const name = /LogicalName='([^']+)'/.exec(path)[1];
      const table = state.tables.get(name);
      if (!table) return reply({ error: 'Missing table' }, 404);
      if (path.includes('/Attributes/')) return reply({ value: table.Attributes.filter(item => item.OptionSet) });
      return reply(table);
    }
    if (path.startsWith('RelationshipDefinitions(')) {
      const name = /SchemaName='([^']+)'/.exec(path)[1];
      return state.relationships.has(name) ? reply(state.relationships.get(name)) : reply({}, 404);
    }
    assert.fail(`Unexpected GET: ${path}`);
  };
  return state;
}

test('schema has seven runtime record types and six safe configuration definitions', () => {
  assert.equal(solutionVersion, '0.9.11.0');
  assert.equal(tables.length, 7);
  assert.equal(environmentVariables.length, 6);
  assert.equal(environmentVariables.find(item => item.schemaname === 'mtc_RequiredRegistrarFields').defaultvalue, '');
  assert.equal(environmentVariables.find(item => item.schemaname === 'mtc_ProcessingMode').defaultvalue, 'Disabled');
  assert.equal(environmentVariables.find(item => item.schemaname === 'mtc_PilotMailbox').defaultvalue, '');
  assert.ok(tables.every(item => item.OwnershipType === 'UserOwned'));
  assert.deepEqual(tables.filter(item => !item.IsAuditEnabled.Value).map(item => item.SchemaName).sort(),
    ['mtc_MessageAssessment', 'mtc_RunLog'], 'Only high-churn processing tables skip auditing.');
  const enrollment = tables.find(item => item.SchemaName === 'mtc_MailboxEnrollment');
  const status = enrollment.Attributes.find(item => item.SchemaName === 'mtc_EnrollmentStatus');
  const health = enrollment.Attributes.find(item => item.SchemaName === 'mtc_HealthState');
  assert.equal(status.OptionSet.Options[0].Label.LocalizedLabels[0].Label, 'Paused');
  assert.equal(health.OptionSet.Options[0].Label.LocalizedLabels[0].Label, 'Not started');
});

test('review, processing, and enrollment choices default to non-active states', () => {
  const choices = tables.flatMap(item => item.Attributes.filter(attribute => attribute.OptionSet));
  assert.ok(choices.length > 0);
  for (const attribute of choices) {
    const initial = attribute.OptionSet.Options.find(option => option.Value === attribute.DefaultFormValue);
    assert.match(initial.Label.LocalizedLabels[0].Label,
      /^(Pending|Incomplete|Not attempted|User|Paused|Not started|Not known)$/);
  }
  assert.ok(relationships.every(item => item.CascadeConfiguration.Delete === 'Restrict'));
});

test('target guard accepts an explicitly approved isolated development target', () => {
  assert.doesNotThrow(() => validateTarget(target, target.environmentOrigin));
});

test('target guard rejects production, unknown consent, placeholders, and wrong origins', () => {
  for (const changes of [
    { environmentType: 'Production' },
    { authorizationConfirmed: false },
    { authorizationConfirmed: 'true' },
    { organizationId: '00000000-0000-0000-0000-000000000000' },
    { environmentOrigin: 'https://synthetic.crm.dynamics.com.attacker.invalid' },
    { environmentOrigin: 'http://synthetic.crm.dynamics.com' }
  ]) {
    assert.throws(() => validateTarget({ ...target, ...changes }, target.environmentOrigin));
  }
  assert.throws(() => validateTarget(target, 'https://other.crm.dynamics.com'));
});

test('metadata verification rejects column, choice, and ownership drift', () => {
  const definition = tables[0];
  assert.doesNotThrow(() => validateTable(metadata(definition), definition));
  for (const mutate of [
    actual => { actual.OwnershipType = 'OrganizationOwned'; },
    actual => { actual.IsManaged = true; },
    actual => { actual.Attributes[0].MaxLength = 10; },
    actual => { actual.Attributes[2].DefaultFormValue = 100000001; },
    actual => { actual.Attributes[2].OptionSet.Options.pop(); },
    actual => { actual.Attributes[2].OptionSet.Options[0].Label.LocalizedLabels[0].Label = 'Approved'; },
    actual => { actual.Attributes = []; }
  ]) {
    const actual = metadata(definition);
    mutate(actual);
    assert.throws(() => validateTable(actual, definition));
  }
});

test('wrong organization is rejected before every write', async () => {
  const state = fakeDataverse();
  await assert.rejects(bootstrap({ ...target, organizationId: '55555555-5555-5555-5555-555555555555' },
    { origin: target.environmentOrigin, fetch: state.fetch }), /no writes performed/);
  assert.equal(state.writes.length, 0);
});

test('fresh bootstrap creates solution components, publishes only owned tables, and never enables mail', async () => {
  const state = fakeDataverse();
  const report = await bootstrap(target, { origin: target.environmentOrigin, fetch: state.fetch });
  assert.equal(report.published, true);
  assert.equal(state.tables.size, tables.length);
  assert.equal(state.relationships.size, relationships.length);
  assert.equal(state.variables.size, environmentVariables.length);
  for (const write of state.writes.filter(item => ['EntityDefinitions', 'RelationshipDefinitions', 'environmentvariabledefinitions'].includes(item.path))) {
    assert.equal(write.headers['MSCRM.SolutionUniqueName'], 'MicrosoftTrustedCustomer');
  }
  assert.ok(!state.writes.some(item => /workflow|environmentvariablevalues|organization|role|Send|Mail/i.test(item.path)));
  const publish = state.writes.find(item => item.path === 'PublishXml').body.ParameterXml;
  assert.ok(!publish.includes('<all'));
  for (const definition of tables) assert.ok(publish.includes(definition.SchemaName.toLowerCase()));
});

test('second bootstrap is idempotent and does not recreate or update schema', async () => {
  const state = fakeDataverse();
  const context = { origin: target.environmentOrigin, fetch: state.fetch };
  await bootstrap(target, context);
  state.writes.length = 0;
  const report = await bootstrap(target, context);
  assert.equal(report.created.length, 0);
  assert.equal(report.updated.length, 0);
  assert.equal(report.existing.length, 2 + tables.length + relationships.length + environmentVariables.length);
  assert.ok(state.writes.every(item => ['AddSolutionComponent', 'PublishXml'].includes(item.path)));
});

test('bootstrap upgrades the reviewed 0.5 solution only after publishing the new schema', async () => {
  const state = fakeDataverse();
  const context = { origin: target.environmentOrigin, fetch: state.fetch };
  await bootstrap(target, context);
  state.setSolutionVersion('0.5.0.0');
  state.writes.length = 0;
  const report = await bootstrap(target, context);
  const publishIndex = state.writes.findIndex(item => item.path === 'PublishXml');
  const upgradeIndex = state.writes.findIndex(item => item.path.startsWith('solutions('));
  assert.ok(publishIndex >= 0 && upgradeIndex > publishIndex);
  assert.deepEqual(report.updated, ['solution 0.5.0.0 -> 0.9.11.0']);
});

test('0.6 migration adds only the new immutable verification event columns', async () => {
  const state = fakeDataverse();
  const context = { origin: target.environmentOrigin, fetch: state.fetch };
  await bootstrap(target, context);
  state.setSolutionVersion('0.6.0.0');
  const columns = new Set(['mtc_TargetType', 'mtc_TargetValue', 'mtc_VerificationMethod', 'mtc_Reason', 'mtc_ExpiresOn']);
  const verificationCase = state.tables.get('mtc_verificationcase');
  verificationCase.Attributes = verificationCase.Attributes.filter(attribute => !columns.has(attribute.SchemaName));
  state.writes.length = 0;
  const report = await bootstrap(target, context);
  const added = state.writes.filter(write => write.path.endsWith('/Attributes'));
  assert.deepEqual(added.map(write => write.body.SchemaName).sort(), [...columns].sort());
  assert.equal(report.updated.length, 6);
  state.writes.length = 0;
  await bootstrap(target, context);
  assert.ok(!state.writes.some(write => write.path.endsWith('/Attributes')));
});

test('authorization failures and throttling never become missing-table fallbacks', async () => {
  for (const status of [401, 403, 429, 500]) {
    const state = fakeDataverse();
    const fetcher = async (url, options) => {
      if (url.includes('EntityDefinitions(')) {
        return { ok: false, status, text: async () => 'Synthetic operator-visible error' };
      }
      return state.fetch(url, options);
    };
    await assert.rejects(bootstrap(target, { origin: target.environmentOrigin, fetch: fetcher }), /failed/);
    assert.ok(!state.writes.some(item => item.path === 'EntityDefinitions'));
  }
});

test('tenant-local current values block successful public-source bootstrap', async () => {
  const state = fakeDataverse();
  const fetcher = async (url, options) => url.includes('environmentvariablevalues?')
    ? { ok: true, status: 200, json: async () => ({ value: [{ environmentvariablevalueid: 'synthetic' }] }) }
    : state.fetch(url, options);
  await assert.rejects(bootstrap(target, { origin: target.environmentOrigin, fetch: fetcher }),
    /Tenant-specific current values/);
  assert.ok(!state.writes.some(item => item.path === 'PublishXml'));
});

test('solution export is explicit, read-only, and excludes tenant-wide settings', async () => {
  for (const managed of [false, true]) {
    const state = fakeDataverse();
    await bootstrap(target, { origin: target.environmentOrigin, fetch: state.fetch });
    state.writes.length = 0;
    let exportBody;
    const fetcher = async (url, options) => {
      if (url.endsWith('/ExportSolution')) {
        exportBody = JSON.parse(options.body);
        return { ok: true, status: 200, json: async () => ({ ExportSolutionFile: 'UEsDBA==' }) };
      }
      return state.fetch(url, options);
    };
    const result = await exportSolution(target, managed, { origin: target.environmentOrigin, fetch: fetcher });
    assert.equal(result.fileName, `MicrosoftTrustedCustomer${managed ? '_managed' : ''}.zip`);
    assert.equal(exportBody.Managed, managed);
    assert.ok(Object.entries(exportBody).filter(([key]) => key.startsWith('Export')).every(([, value]) => value === false));
    assert.equal(state.writes.length, 0);
  }
});

test('export rejects current values, wrong organizations, and ambiguous mode before export', async () => {
  const state = fakeDataverse();
  await bootstrap(target, { origin: target.environmentOrigin, fetch: state.fetch });
  const context = { origin: target.environmentOrigin, fetch: state.fetch };
  await assert.rejects(exportSolution(target, 'true', context), /must be explicit/);
  await assert.rejects(exportSolution({ ...target, organizationId: '55555555-5555-5555-5555-555555555555' },
    true, context), /organization/);
  const fetcher = async (url, options) => url.includes('environmentvariablevalues?')
    ? { ok: true, status: 200, json: async () => ({ value: [{ environmentvariablevalueid: 'synthetic' }] }) }
    : state.fetch(url, options);
  await assert.rejects(exportSolution(target, true, { origin: target.environmentOrigin, fetch: fetcher }),
    /tenant-specific current values/);
});

test('explicit development migration preserves current settings without writing them', async () => {
  const state = fakeDataverse();
  await bootstrap(target, { origin: target.environmentOrigin, fetch: state.fetch });
  state.setSolutionVersion('0.8.0.0');
  state.writes.length = 0;
  const fetcher = async (url, options) => url.includes('environmentvariablevalues?')
    ? { ok: true, status: 200, json: async () => ({ value: [{ environmentvariablevalueid: 'synthetic' }] }) }
    : state.fetch(url, options);
  const context = { origin: target.environmentOrigin, fetch: fetcher };
  for (const preserveOperationalSettings of [false, 'true']) {
    await assert.rejects(bootstrap(target, { ...context, preserveOperationalSettings }), /Tenant-specific current values/);
  }
  const report = await bootstrap(target, { ...context, preserveOperationalSettings: true });
  assert.equal(report.published, true);
  assert.deepEqual(report.updated, ['solution 0.8.0.0 -> 0.9.11.0']);
  assert.ok(!state.writes.some(write => write.path.startsWith('environmentvariablevalues')));
  state.writes.length = 0;
  await assert.rejects(bootstrap({ ...target, environmentType: 'Production' },
    { ...context, preserveOperationalSettings: true }));
  await assert.rejects(bootstrap(target,
    { ...context, origin: 'https://other.crm.dynamics.com', preserveOperationalSettings: true }));
  await assert.rejects(bootstrap({ ...target, organizationId: '55555555-5555-5555-5555-555555555555' },
    { ...context, preserveOperationalSettings: true }), /no writes performed/);
  assert.equal(state.writes.length, 0);
});

test('0.9.7 migration adds run log, message log columns, Not applicable, and per-table audit', async () => {
  const state = fakeDataverse();
  const context = { origin: target.environmentOrigin, fetch: state.fetch };
  await bootstrap(target, context);
  state.setSolutionVersion('0.9.6.0');
  state.tables.delete('mtc_runlog');
  const assessment = state.tables.get('mtc_messageassessment');
  assessment.Attributes = assessment.Attributes.filter(item => !['mtc_FirstPresentedOn', 'mtc_LastPresentationError'].includes(item.SchemaName));
  assessment.Attributes.find(item => item.SchemaName === 'mtc_PresentationStatus').OptionSet.Options.pop();
  assessment.IsAuditEnabled = { Value: true };
  state.writes.length = 0;
  const report = await bootstrap(target, context);
  assert.ok(report.created.includes('mtc_RunLog'));
  assert.deepEqual(report.updated.sort(), [
    'mtc_MessageAssessment.IsAuditEnabled', 'mtc_MessageAssessment.mtc_FirstPresentedOn',
    'mtc_MessageAssessment.mtc_LastPresentationError', 'mtc_MessageAssessment.mtc_PresentationStatus=100000003',
    'solution 0.9.6.0 -> 0.9.11.0'
  ].sort());
  assert.equal(state.tables.get('mtc_messageassessment').IsAuditEnabled.Value, false);
  state.writes.length = 0;
  const again = await bootstrap(target, context);
  assert.equal(again.updated.length, 0);
});

test('production accepts only an explicitly flagged versioned upgrade of the existing solution', async () => {
  const production = { ...target, environmentType: 'Production' };
  assert.throws(() => validateTarget(production, target.environmentOrigin));
  assert.throws(() => validateTarget(production, target.environmentOrigin, { productionMigration: 'true' }));
  assert.doesNotThrow(() => validateTarget(production, target.environmentOrigin, { productionMigration: true }));
  const fresh = fakeDataverse();
  await assert.rejects(bootstrap(production, { origin: target.environmentOrigin, fetch: fresh.fetch, productionMigration: true }),
    /existing solution; no writes performed/);
  assert.equal(fresh.writes.length, 0);
  const state = fakeDataverse();
  await bootstrap(target, { origin: target.environmentOrigin, fetch: state.fetch });
  state.writes.length = 0;
  await assert.rejects(bootstrap(production, { origin: target.environmentOrigin, fetch: state.fetch, productionMigration: true }),
    /versioned upgrade/);
  assert.equal(state.writes.length, 0);
  state.setSolutionVersion('0.9.6.0');
  const report = await bootstrap(production, { origin: target.environmentOrigin, fetch: state.fetch, productionMigration: true });
  assert.deepEqual(report.updated, ['solution 0.9.6.0 -> 0.9.11.0']);
});

test('presentation release migrations only publish and version unchanged schema', async () => {
  for (const previous of ['0.9.0.0', '0.9.1.0', '0.9.2.0', '0.9.3.0', '0.9.4.0', '0.9.5.0', '0.9.6.0', '0.9.7.0', '0.9.8.0', '0.9.9.0', '0.9.10.0']) {
    const state = fakeDataverse();
    const context = { origin: target.environmentOrigin, fetch: state.fetch };
    await bootstrap(target, context);
    state.setSolutionVersion(previous);
    state.writes.length = 0;
    const report = await bootstrap(target, context);
    assert.deepEqual(report.updated, [`solution ${previous} -> 0.9.11.0`]);
    assert.ok(state.writes.every(write => ['AddSolutionComponent', 'PublishXml'].includes(write.path) ||
      write.path.startsWith('solutions(')));
  }
});

test('private review export requires literal consent and retains identity and export guards', async () => {
  const state = fakeDataverse();
  await bootstrap(target, { origin: target.environmentOrigin, fetch: state.fetch });
  state.writes.length = 0;
  const exports = [];
  const fetcher = async (url, options) => {
    if (url.includes('environmentvariablevalues?')) {
      return { ok: true, status: 200, json: async () => ({ value: [{ environmentvariablevalueid: 'synthetic' }] }) };
    }
    if (url.endsWith('/ExportSolution')) {
      exports.push(JSON.parse(options.body));
      return { ok: true, status: 200, json: async () => ({ ExportSolutionFile: 'UEsDBA==' }) };
    }
    return state.fetch(url, options);
  };
  const context = { origin: target.environmentOrigin, fetch: fetcher };
  for (const privateReviewOnly of [false, 'true']) {
    await assert.rejects(exportSolution(target, true, { ...context, privateReviewOnly }), /tenant-specific current values/);
  }
  assert.equal(exports.length, 0);
  for (const managed of [false, true]) {
    await exportSolution(target, managed, { ...context, privateReviewOnly: true });
    assert.equal(exports.at(-1).Managed, managed);
    assert.ok(Object.entries(exports.at(-1)).filter(([key]) => key.startsWith('Export'))
      .every(([, value]) => value === false));
  }
  const count = exports.length;
  await assert.rejects(exportSolution({ ...target, environmentType: 'Production' }, true,
    { ...context, privateReviewOnly: true }));
  await assert.rejects(exportSolution(target, true,
    { ...context, origin: 'https://other.crm.dynamics.com', privateReviewOnly: true }));
  await assert.rejects(exportSolution({ ...target, organizationId: '55555555-5555-5555-5555-555555555555' },
    true, { ...context, privateReviewOnly: true }), /organization/);
  await assert.rejects(exportSolution(target, 'true', { ...context, privateReviewOnly: true }), /must be explicit/);
  assert.equal(exports.length, count);
  assert.equal(state.writes.length, 0);
});
