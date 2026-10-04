'use strict';

(function (root) {
  const solutionName = 'MicrosoftTrustedCustomer';
  const assemblyName = 'Mtc.Registrar';
  const appName = 'mtc_SenderRegistry';
  const resourceNames = {
    html: 'mtc_/registrar/index.html',
    javascript: 'mtc_/registrar/app.js',
    css: 'mtc_/registrar/styles.css'
  };
  const guardTables = [
    'mtc_businessparty', 'mtc_approvedcontact', 'mtc_approveddomain', 'mtc_verificationcase'
  ];

  async function install(target, payload, context = {}) {
    const provisioning = typeof module !== 'undefined' && module.exports
      ? require('./dataverse.js') : root.MtcProvisioning;
    provisioning.validateTarget(target, context.origin ?? root.location?.origin);
    if (!payload?.assembly || !payload.html || !payload.javascript || !payload.css)
      throw new Error('Compiled registrar assembly and all three web resources are required.');
    if (payload.verificationAuthorityMode !== 'single-registrar')
      throw new Error('This MVP requires an explicitly selected single-registrar model. Independent-review mode is not implemented in the live app.');
    const fetcher = context.fetch ?? root.fetch.bind(root);
    const report = { components: [], assignments: [], appId: null, processing: 'Unchanged' };
    const headers = {
      Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8',
      'OData-Version': '4.0', 'OData-MaxVersion': '4.0'
    };
    async function request(path, method = 'GET', body) {
      const response = await fetcher(`${target.environmentOrigin}/api/data/v9.2/${path}`, {
        method, credentials: 'same-origin', redirect: 'error',
        headers: {
          ...headers,
          ...(['POST', 'PATCH'].includes(method) && path !== 'appmodules' ? {
            Prefer: 'return=representation', 'MSCRM.SolutionUniqueName': solutionName
          } : {})
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      if (!response.ok)
        throw new Error(`Registrar deployment ${method} ${path} failed (${response.status}): ${(await response.text()).slice(0, 1800)}`);
      if (response.status === 204) return null;
      return response.json();
    }
    const identity = await request('WhoAmI');
    if (identity.OrganizationId.toLowerCase() !== target.organizationId.toLowerCase())
      throw new Error('Registrar organization mismatch; no writes performed.');
    const solutions = await request(`solutions?$select=solutionid,version,ismanaged&$filter=uniquename eq '${solutionName}'`);
    if (solutions.value.length !== 1 || solutions.value[0].ismanaged ||
        solutions.value[0].version !== provisioning.solutionVersion)
      throw new Error('The matching unmanaged development schema version must be provisioned before registrar deployment; no writes performed.');
    async function find(set, filter, select) {
      const response = await request(`${set}?$select=${select}&$filter=${encodeURIComponent(filter)}`);
      if (response.value.length > 1) throw new Error(`Ambiguous registrar deployment component: ${set}.`);
      return response.value[0] ?? null;
    }
    async function addComponent(id, type) {
      await request('AddSolutionComponent', 'POST', {
        ComponentId: id, ComponentType: type, SolutionUniqueName: solutionName,
        AddRequiredComponents: false, DoNotIncludeSubcomponents: false
      });
    }
    for (const [table, name, column] of [
      ['mtc_approvedcontact', 'mtc_ApprovedContactIdentity', 'mtc_emailaddress'],
      ['mtc_approveddomain', 'mtc_ApprovedDomainIdentity', 'mtc_domain'],
      ['mtc_mailboxenrollment', 'mtc_MailboxIdentity', 'mtc_mailboxreference']
    ]) {
      const path = `EntityDefinitions(LogicalName='${table}')/Keys`;
      const keys = await request(`${path}?$select=SchemaName,KeyAttributes,EntityKeyIndexStatus`);
      const matches = keys.value.filter(key => key.SchemaName === name);
      if (matches.length > 1) throw new Error(`Ambiguous identity key: ${name}`);
      if (matches.length === 0) {
        await request(path, 'POST', {
          '@odata.type': 'Microsoft.Dynamics.CRM.EntityKeyMetadata',
          SchemaName: name, KeyAttributes: [column],
          DisplayName: { LocalizedLabels: [{ Label: 'Unique exact identity', LanguageCode: 1033 }] }
        });
      } else if (matches[0].KeyAttributes.length !== 1 || matches[0].KeyAttributes[0] !== column ||
        matches[0].EntityKeyIndexStatus === 'Failed') {
        throw new Error(`Conflicting or failed identity key: ${name}`);
      }
    }
    report.components.push('Unique address, domain, and mailbox identity keys');

    let assembly = await find('pluginassemblies', `name eq '${assemblyName}'`, 'pluginassemblyid,name,content,isolationmode');
    if (assembly && assembly.isolationmode !== 2) throw new Error('Registrar assembly must be sandbox-isolated.');
    if (!assembly) {
      assembly = await request('pluginassemblies', 'POST', {
        name: assemblyName, content: payload.assembly, isolationmode: 2, sourcetype: 0,
        description: 'Caller-stamped single-registrar verification and protected registry writes.'
      });
    } else if (assembly.content !== payload.assembly) {
      await request(`pluginassemblies(${assembly.pluginassemblyid})`, 'PATCH', { content: payload.assembly });
    }
    await addComponent(assembly.pluginassemblyid, 91);
    report.components.push('registrar assembly');
    const types = await request(`plugintypes?$select=plugintypeid,typename&$filter=_pluginassemblyid_value eq ${assembly.pluginassemblyid}`);
    async function pluginType(name) {
      const existing = types.value.filter(type => type.typename === name);
      if (existing.length > 1) throw new Error(`Duplicate registrar plug-in type: ${name}`);
      if (existing.length === 1) return existing[0].plugintypeid;
      const type = await request('plugintypes', 'POST', {
        typename: name, name, friendlyname: name,
        'pluginassemblyid@odata.bind': `/pluginassemblies(${assembly.pluginassemblyid})`
      });
      return type.plugintypeid;
    }
    const verificationType = await pluginType('Mtc.Registrar.VerificationApi');
    const guardType = await pluginType('Mtc.Registrar.RegistryWriteGuard');
    const mailboxType = await pluginType('Mtc.Registrar.MailboxApi');
    const apiDefinitions = [
      {
        name: 'mtc_VerifySender', display: 'Verify or renew a sender',
        parameters: [
          ['TargetType', 10], ['TargetValue', 10], ['BusinessName', 10],
          ['VerificationMethod', 10], ['EvidenceReference', 10], ['ExpiresOn', 1]
        ],
        results: [['RecordId', 12], ['VerificationCaseId', 12]]
      },
      {
        name: 'mtc_RevokeSender', display: 'Revoke an approved sender',
        parameters: [['TargetType', 10], ['RecordId', 12], ['Reason', 10]],
        results: [['VerificationCaseId', 12]]
      },
      {
        name: 'mtc_SetMailboxEnrollment', display: 'Enroll or pause a mailbox',
        pluginType: mailboxType,
        parameters: [['MailboxReference', 10], ['MailboxType', 10], ['Enrolled', 0]],
        results: [['RecordId', 12]]
      }
    ];
    for (const definition of apiDefinitions) {
      const description = definition.pluginType
        ? 'Requires MTC Operator membership; changes mailbox enrollment without activating processing.'
        : 'Requires MTC Registrar membership; stamps the actual interactive caller. Single-registrar MVP.';
      let api = await find('customapis', `uniquename eq '${definition.name}'`, 'customapiid,uniquename,_plugintypeid_value');
      if (!api) {
        api = await request('customapis', 'POST', {
          uniquename: definition.name, name: definition.name, displayname: definition.display,
          description,
          bindingtype: 0, isfunction: false, isprivate: false, allowedcustomprocessingsteptype: 0,
          iscustomizable: { Value: false },
          'PluginTypeId@odata.bind': `/plugintypes(${definition.pluginType ?? verificationType})`,
          CustomAPIRequestParameters: definition.parameters.map(([name, type]) => ({
            name: `${definition.name}.${name}`, uniquename: name, displayname: name,
            type, isoptional: false, iscustomizable: { Value: false }
          })),
          CustomAPIResponseProperties: definition.results.map(([name, type]) => ({
            name: `${definition.name}.${name}`, uniquename: name, displayname: name,
            type, iscustomizable: { Value: false }
          }))
        });
      } else if (api._plugintypeid_value !== (definition.pluginType ?? verificationType)) {
        throw new Error(`Custom API handler conflicts: ${definition.name}`);
      } else {
        await request(`customapis(${api.customapiid})`, 'PATCH', { description });
      }
      await addComponent(api.customapiid, 10038);
      report.components.push(definition.name);
    }

    for (const table of guardTables) {
      for (const messageName of ['Create', 'Update', 'Delete']) {
        const message = await find('sdkmessages', `name eq '${messageName}'`, 'sdkmessageid');
        if (!message) throw new Error(`Dataverse message is unavailable: ${messageName}`);
        const filter = await find('sdkmessagefilters',
          `_sdkmessageid_value eq ${message.sdkmessageid} and primaryobjecttypecode eq '${table}'`,
          'sdkmessagefilterid');
        if (!filter) throw new Error(`Dataverse guard filter is unavailable: ${table} ${messageName}`);
        const stepName = `MTC registry guard: ${table} ${messageName}`;
        let step = await find('sdkmessageprocessingsteps', `name eq '${stepName}'`,
          'sdkmessageprocessingstepid,statecode,stage,mode');
        if (!step) {
          step = await request('sdkmessageprocessingsteps', 'POST', {
            name: stepName, description: 'Reject direct writes outside the authorized verification API.',
            stage: 10, mode: 0, rank: 1, supporteddeployment: 0, canbebypassed: false,
            'sdkmessageid@odata.bind': `/sdkmessages(${message.sdkmessageid})`,
            'sdkmessagefilterid@odata.bind': `/sdkmessagefilters(${filter.sdkmessagefilterid})`,
            'eventhandler_plugintype@odata.bind': `/plugintypes(${guardType})`
          });
        } else if (step.statecode !== 0 || step.stage !== 10 || step.mode !== 0) {
          throw new Error(`Registry guard is disabled or misconfigured: ${stepName}`);
        }
        await addComponent(step.sdkmessageprocessingstepid, 92);
      }
    }
    report.components.push('12 synchronous registry write guards');
    for (const name of ['Associate', 'Disassociate']) {
      const message = await find('sdkmessages', `name eq '${name}'`, 'sdkmessageid');
      if (!message) throw new Error(`Registry relationship message is unavailable: ${name}`);
      const stepName = `MTC registry relationship guard: ${name}`;
      let step = await find('sdkmessageprocessingsteps', `name eq '${stepName}'`,
        'sdkmessageprocessingstepid,statecode,stage,mode');
      if (!step) {
        step = await request('sdkmessageprocessingsteps', 'POST', {
          name: stepName, description: 'Protect approval relationships; unrelated tables are unaffected.',
          stage: 10, mode: 0, rank: 1, supporteddeployment: 0, canbebypassed: false,
          'sdkmessageid@odata.bind': `/sdkmessages(${message.sdkmessageid})`,
          'eventhandler_plugintype@odata.bind': `/plugintypes(${guardType})`
        });
      } else if (step.statecode !== 0 || step.stage !== 10 || step.mode !== 0) {
        throw new Error(`Registry relationship guard is disabled or misconfigured: ${name}`);
      }
      await addComponent(step.sdkmessageprocessingstepid, 92);
    }
    report.components.push('2 registry relationship guards');

    const resources = {};
    for (const [kind, type] of [['html', 1], ['javascript', 3], ['css', 2]]) {
      const name = resourceNames[kind];
      let resource = await find('webresourceset', `name eq '${name}'`, 'webresourceid,name,webresourcetype');
      const fields = {
        content: payload[kind], displayname: `Sender Registry ${kind}`,
        description: 'Portable client-facing registry workspace; no tenant identities or current values.'
      };
      if (!resource) {
        resource = await request('webresourceset', 'POST', { ...fields, name, webresourcetype: type });
      } else {
        if (resource.webresourcetype !== type) throw new Error(`Web resource type conflicts: ${name}`);
        await request(`webresourceset(${resource.webresourceid})`, 'PATCH', fields);
      }
      resources[kind] = resource.webresourceid;
      await addComponent(resource.webresourceid, 61);
    }

    const appCollection = 'appmodules/Microsoft.Dynamics.CRM.RetrieveUnpublishedMultiple()';
    let app = await find(appCollection, `uniquename eq '${appName}'`, 'appmoduleid,name,uniquename');
    if (!app) {
      await request('appmodules', 'POST', {
        name: 'Sender Registry', uniquename: appName,
        description: 'Verify business sender addresses and domains, review coverage, and monitor service health.',
        webresourceid: '953b9fac-1e5e-e611-80d6-00155ded156f'
      });
      app = await find(appCollection, `uniquename eq '${appName}'`, 'appmoduleid,name,uniquename');
      if (!app) throw new Error('Sender Registry app creation did not produce the expected app.');
    }
    const sitemapName = 'mtc_SenderRegistrySitemap';
    let sitemap = await find('sitemaps', `sitemapnameunique eq '${sitemapName}'`, 'sitemapid,sitemapnameunique');
    const sitemapXml = '<SiteMap><Area Id="MTC_Registry"><Titles><Title LCID="1033" Title="Sender Registry" /></Titles><Group Id="MTC_Workspace"><Titles><Title LCID="1033" Title="Workspace" /></Titles><SubArea Id="MTC_SenderRegistry" Url="$webresource:mtc_/registrar/index.html"><Titles><Title LCID="1033" Title="Sender Registry" /></Titles></SubArea></Group></Area></SiteMap>';
    if (!sitemap) {
      sitemap = await request('sitemaps', 'POST', { sitemapname: 'Sender Registry', sitemapnameunique: sitemapName, sitemapxml: sitemapXml });
    } else {
      await request(`sitemaps(${sitemap.sitemapid})`, 'PATCH', { sitemapxml: sitemapXml });
    }
    await addComponent(sitemap.sitemapid, 62);
    await addComponent(app.appmoduleid, 80);
    await request('AddAppComponents', 'POST', {
      AppId: app.appmoduleid,
      Components: [{ '@odata.type': 'Microsoft.Dynamics.CRM.sitemap', sitemapid: sitemap.sitemapid }]
    });
    const validation = await request(`ValidateApp(AppModuleId=${app.appmoduleid})`);
    if (!validation.AppValidationResponse?.ValidationSuccess)
      throw new Error(`Sender Registry validation failed: ${JSON.stringify(validation.AppValidationResponse)}`);
    await request('PublishXml', 'POST', {
      ParameterXml: `<importexportxml><webresources>${Object.values(resources).map(id => `<webresource>${id}</webresource>`).join('')}</webresources><sitemaps><sitemap>${sitemap.sitemapid}</sitemap></sitemaps><appmodules><appmodule>${app.appmoduleid}</appmodule></appmodules></importexportxml>`
    });
    report.appId = app.appmoduleid;
    report.components.push('Sender Registry app and web resources');
    const user = await request(`systemusers(${identity.UserId})?$select=_businessunitid_value`);
    const businessUnit = user._businessunitid_value;
    if (!businessUnit) throw new Error('Current operator business unit is missing.');
    const registrarPrivileges = guardTables.flatMap(table =>
      ['Read', 'Create', 'Write', 'Append', 'AppendTo'].map(operation =>
        `prv${operation}${provisioning.tables.find(definition => definition.SchemaName.toLowerCase() === table).SchemaName}`));
    const privilegeNames = [
      ...registrarPrivileges,
      'prvReadmtc_MessageAssessment', 'prvReadmtc_MailboxEnrollment',
      'prvReadEnvironmentVariableDefinition', 'prvAppendToUser',
      'prvCreatemtc_MailboxEnrollment', 'prvWritemtc_MailboxEnrollment',
      'prvAppendmtc_MailboxEnrollment', 'prvAppendTomtc_MailboxEnrollment'
    ];
    const privileges = await request(`privileges?$select=privilegeid,name&$filter=${encodeURIComponent(privilegeNames.map(name => `name eq '${name}'`).join(' or '))}`);
    if (privileges.value.length !== privilegeNames.length)
      throw new Error('One or more registrar privileges are unavailable; no access assignment performed.');
    for (const name of ['MTC Registrar', 'MTC Operator']) {
      let role = await find('roles', `name eq '${name}' and _businessunitid_value eq ${businessUnit}`, 'roleid,name');
      if (!role) {
        role = await request('roles', 'POST', {
          name, 'businessunitid@odata.bind': `/businessunits(${businessUnit})`
        });
      }
      const allowed = name === 'MTC Registrar'
        ? privileges.value.filter(privilege => !privilege.name.endsWith('mtc_MailboxEnrollment') ||
          privilege.name === 'prvReadmtc_MailboxEnrollment')
        : privileges.value.filter(privilege => privilege.name.startsWith('prvRead') ||
          privilege.name.endsWith('mtc_MailboxEnrollment'));
      await request(`roles(${role.roleid})/Microsoft.Dynamics.CRM.ReplacePrivilegesRole`, 'POST', {
        Privileges: allowed.map(privilege => ({
          PrivilegeId: privilege.privilegeid, Depth: 'Global', BusinessUnitId: businessUnit
        }))
      });
      await addComponent(role.roleid, 20);
      const roles = await request(`appmodules(${app.appmoduleid})/appmoduleroles_association?$select=roleid`);
      if (!roles.value.some(existing => existing.roleid === role.roleid))
        await request(`appmodules(${app.appmoduleid})/appmoduleroles_association/$ref`, 'POST', {
          '@odata.id': `${target.environmentOrigin}/api/data/v9.2/roles(${role.roleid})`
        });
      if (payload.assignCurrentUser === true) {
        const assigned = await request(`systemusers(${identity.UserId})/systemuserroles_association?$select=roleid`);
        if (!assigned.value.some(existing => existing.roleid === role.roleid))
          await request(`systemusers(${identity.UserId})/systemuserroles_association/$ref`, 'POST', {
            '@odata.id': `${target.environmentOrigin}/api/data/v9.2/roles(${role.roleid})`
          });
        report.assignments.push(`Current authenticated operator: ${name}`);
      }
    }
    report.components.push('MTC Registrar and MTC Operator roles');
    await request(`solutions(${solutions.value[0].solutionid})`, 'PATCH', {
      description: 'Development Sender Registry app with caller-stamped single-registrar APIs, protected approval records, and paused mailbox onboarding. Automatic Outlook processing remains Off.'
    });
    return report;
  }

  const api = { install, solutionName, assemblyName, appName, resourceNames, guardTables };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MtcRegistrarDeployment = api;
})(globalThis);
