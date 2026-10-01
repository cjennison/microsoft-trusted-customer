'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tables, relationships, environmentVariables, validateTarget, validateTable, bootstrap, exportSolution } =
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
    if (options.method === 'POST') {
      state.writes.push({ path, body, headers: options.headers });
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

test('schema has all seven logical record types and four safe configuration definitions', () => {
  assert.equal(tables.length, 7);
  assert.equal(environmentVariables.length, 4);
  assert.equal(environmentVariables.find(item => item.schemaname === 'mtc_ProcessingMode').defaultvalue, 'Disabled');
  assert.equal(environmentVariables.find(item => item.schemaname === 'mtc_PilotMailbox').defaultvalue, '');
  assert.ok(tables.every(item => item.OwnershipType === 'UserOwned' && item.IsAuditEnabled.Value));
});

test('review and processing form choices default to pending/incomplete, never approval', () => {
  const choices = tables.flatMap(item => item.Attributes.filter(attribute => attribute.OptionSet));
  assert.ok(choices.length > 0);
  for (const attribute of choices) {
    const initial = attribute.OptionSet.Options.find(option => option.Value === attribute.DefaultFormValue);
    assert.match(initial.Label.LocalizedLabels[0].Label, /^(Pending|Incomplete|Not attempted)$/);
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
  assert.equal(report.existing.length, 2 + tables.length + relationships.length + environmentVariables.length);
  assert.ok(state.writes.every(item => ['AddSolutionComponent', 'PublishXml'].includes(item.path)));
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
