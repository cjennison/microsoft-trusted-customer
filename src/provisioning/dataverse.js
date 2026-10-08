'use strict';

(function (root) {
  const solutionName = 'MicrosoftTrustedCustomer';
  const solutionVersion = '0.9.12.0';
  const upgradeableSolutionVersions = new Set(['0.5.0.0', '0.6.0.0', '0.7.0.0', '0.8.0.0', '0.9.0.0', '0.9.1.0', '0.9.2.0', '0.9.3.0', '0.9.4.0', '0.9.5.0', '0.9.6.0', '0.9.7.0', '0.9.8.0', '0.9.9.0', '0.9.10.0', '0.9.11.0']);
  const verificationCaseUpgradeColumns = new Set([
    'mtc_TargetType', 'mtc_TargetValue', 'mtc_VerificationMethod', 'mtc_Reason', 'mtc_ExpiresOn'
  ]);
  const runtimeUpgradeColumns = {
    mtc_MessageAssessment: new Set([
      'mtc_SenderAddress', 'mtc_SenderDomain', 'mtc_Decision', 'mtc_EligibilityExpiresOn',
      'mtc_RegistryCheckedOn', 'mtc_FirstPresentedOn', 'mtc_LastPresentationError'
    ]),
    mtc_MailboxEnrollment: new Set([
      'mtc_NextPageUrl', 'mtc_ScanFrom', 'mtc_ScanUntil', 'mtc_LeaseId', 'mtc_LeaseExpiresOn',
      'mtc_RegistryCheckedOn', 'mtc_ReassessmentDueOn', 'mtc_LastAlertOn', 'mtc_ExcludedFolderIds'
    ])
  };
  const prefix = 'mtc';
  const label = text => ({ LocalizedLabels: [{ Label: text, LanguageCode: 1033 }] });
  const required = value => ({ Value: value });

  function text(name, displayName, maxLength = 200, primary = false) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: `${prefix}_${name}`,
      DisplayName: label(displayName),
      RequiredLevel: required(primary ? 'ApplicationRequired' : 'None'),
      MaxLength: maxLength,
      FormatName: { Value: 'Text' },
      IsPrimaryName: primary
    };
  }

  function date(name, displayName) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
      SchemaName: `${prefix}_${name}`,
      DisplayName: label(displayName),
      RequiredLevel: required('None'),
      Format: 'DateAndTime',
      DateTimeBehavior: { Value: 'UserLocal' }
    };
  }

  function choice(name, displayName, values) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
      SchemaName: `${prefix}_${name}`,
      DisplayName: label(displayName),
      RequiredLevel: required('ApplicationRequired'),
      DefaultFormValue: 100000000,
      OptionSet: {
        '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
        IsGlobal: false,
        OptionSetType: 'Picklist',
        Options: values.map((value, index) => ({
          Value: 100000000 + index,
          Label: label(value)
        }))
      }
    };
  }

  function whole(name, displayName) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
      SchemaName: `${prefix}_${name}`,
      DisplayName: label(displayName),
      RequiredLevel: required('None'),
      Format: 'None', MinValue: 0, MaxValue: 2147483647
    };
  }

  function verification() {
    return [
      choice('VerificationStatus', 'Verification status', ['Pending', 'Approved', 'Rejected', 'Revoked']),
      text('VerificationMethod', 'Independent verification method'),
      text('EvidenceReference', 'Restricted evidence reference', 1000),
      date('VerifiedOn', 'Verified on'),
      date('ExpiresOn', 'Expires on')
    ];
  }

  function table(name, displayName, collectionName, description, attributes, audited = true) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
      SchemaName: `${prefix}_${name}`,
      DisplayName: label(displayName),
      DisplayCollectionName: label(collectionName),
      Description: label(description),
      OwnershipType: 'UserOwned',
      IsActivity: false,
      HasActivities: false,
      HasNotes: false,
      IsAuditEnabled: { Value: audited },
      Attributes: [text('Name', 'Name', 200, true), ...attributes]
    };
  }

  const tables = [
    table('BusinessParty', 'Business party', 'Business parties',
      'Independently reviewed business relationship. Known sender does not mean safe message.',
      [text('RelationshipType', 'Relationship type'), ...verification()]),
    table('ApprovedDomain', 'Approved domain', 'Approved domains',
      'Exact business domain only; never implicitly includes subdomains or consumer-mail providers.',
      [text('Domain', 'Exact domain', 253), text('Purpose', 'Purpose'), ...verification()]),
    table('ApprovedContact', 'Approved contact', 'Approved contacts',
      'Exact independently verified address for binary known/not-known sender status.',
      [text('EmailAddress', 'Exact email address', 320),
        text('ReplyToAddress', 'Exact approved Reply-To address', 320),
        text('BusinessRole', 'Business role'), ...verification()]),
    table('VerificationCase', 'Verification case', 'Verification cases',
      'Independent review history. Separation of duties still requires workflow and security implementation.',
      [choice('ReviewStatus', 'Review status', ['Pending', 'Approved', 'Rejected', 'Revoked']),
        text('EvidenceReference', 'Restricted evidence reference', 1000),
        text('TargetType', 'Verification target type', 10),
        text('TargetValue', 'Exact verification target', 320),
        text('VerificationMethod', 'Independent verification method'),
        text('Reason', 'Verification change reason', 1000),
        date('ExpiresOn', 'Verification expiry'),
        date('ReviewedOn', 'Reviewed on')]),
    table('MessageAssessment', 'Message assessment', 'Message assessments',
      'Known/not-known sender assessment metadata only. Do not store message bodies or attachment contents.',
      [text('MailboxReference', 'Mailbox reference', 320),
        text('StableMessageId', 'Stable message identifier', 1000),
        date('ReceivedOn', 'Received on'), date('AssessedOn', 'Assessed on'),
        text('RegistryVersion', 'Registry version'), text('RuleVersion', 'Rule version'),
        choice('RelationshipState', 'Relationship state', ['Incomplete', 'Unrecognized', 'Domain recognized', 'Contact recognized']),
        choice('AuthenticationState', 'Authentication state', ['Incomplete', 'Aligned pass', 'Review required']),
        choice('RiskState', 'Risk state', ['Incomplete', 'Review required', 'No signal in completed checks']),
        choice('ProcessingStatus', 'Processing status', ['Pending', 'Completed', 'Failed']),
        choice('PresentationStatus', 'Presentation status', ['Not attempted', 'Applied', 'Failed', 'Not applicable']),
        text('SenderAddress', 'Sender address', 320),
        text('SenderDomain', 'Sender domain', 253),
        choice('Decision', 'Sender decision', ['Not known', 'Known sender']),
        date('EligibilityExpiresOn', 'Known eligibility expiry'),
        date('RegistryCheckedOn', 'Registry checked on'),
        text('ReasonCodes', 'Deterministic reason codes', 4000),
        date('FirstPresentedOn', 'First labeled on'),
        text('LastPresentationError', 'Last labeling error', 2000)], false),
    table('MailboxEnrollment', 'Mailbox enrollment', 'Mailbox enrollments',
      'Tenant-local mailbox polling enrollment and health. New records remain paused until explicitly enrolled.',
      [text('MailboxReference', 'Mailbox reference', 320),
        choice('MailboxType', 'Mailbox type', ['User', 'Shared']),
        choice('EnrollmentStatus', 'Enrollment status', ['Paused', 'Enrolled']),
        text('Checkpoint', 'Polling checkpoint', 4000),
        date('LastAttemptOn', 'Last poll attempt'),
        date('LastSuccessfulPollOn', 'Last successful poll'),
        text('NextPageUrl', 'Unfinished Graph page', 4000),
        date('ScanFrom', 'Current scan start'),
        date('ScanUntil', 'Current scan cutoff'),
        text('LeaseId', 'Active poll lease', 36),
        date('LeaseExpiresOn', 'Poll lease expiry'),
        date('RegistryCheckedOn', 'Completed registry scan cutoff'),
        date('ReassessmentDueOn', 'Next verification expiry'),
        date('LastAlertOn', 'Last operator alert'),
        text('ExcludedFolderIds', 'Excluded mailbox folders', 4000),
        choice('HealthState', 'Health state', ['Not started', 'Healthy', 'Degraded', 'Failed']),
        text('LastError', 'Last operator-visible error', 4000)]),
    table('RunLog', 'Run log', 'Run logs',
      'One row per processor run for troubleshooting. Metadata only; retained 90 days.',
      [text('Worker', 'Worker', 100), text('RunId', 'Flow run ID', 200),
        date('StartedOn', 'Started on'), date('EndedOn', 'Ended on'),
        choice('Outcome', 'Outcome', ['Pending', 'Succeeded', 'Failed']),
        whole('ItemsProcessed', 'Items processed'), whole('Failures', 'Failures'),
        text('Details', 'Details', 4000)], false)
  ];

  function relationship(parent, child, column, displayName) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
      SchemaName: `${prefix}_${parent}_${child}_${column}`,
      ReferencedEntity: parent === 'SystemUser' ? 'systemuser' : `${prefix}_${parent.toLowerCase()}`,
      ReferencedAttribute: parent === 'SystemUser' ? 'systemuserid' : `${prefix}_${parent.toLowerCase()}id`,
      ReferencingEntity: `${prefix}_${child.toLowerCase()}`,
      Lookup: {
        '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
        SchemaName: `${prefix}_${column}`,
        DisplayName: label(displayName),
        RequiredLevel: required('None')
      },
      CascadeConfiguration: {
        Assign: 'NoCascade', Delete: 'Restrict', Merge: 'NoCascade',
        Reparent: 'NoCascade', Share: 'NoCascade', Unshare: 'NoCascade'
      }
    };
  }

  const relationships = [
    ...['ApprovedDomain', 'ApprovedContact', 'VerificationCase']
      .map(child => relationship('BusinessParty', child, 'BusinessParty', 'Business party')),
    relationship('ApprovedContact', 'VerificationCase', 'Contact', 'Contact'),
    relationship('ApprovedContact', 'MessageAssessment', 'Contact', 'Matched contact'),
    relationship('VerificationCase', 'BusinessParty', 'VerificationCase', 'Verification case'),
    ...['BusinessParty', 'ApprovedDomain', 'ApprovedContact', 'VerificationCase']
      .map(child => relationship('SystemUser', child, 'IndependentReviewer', 'Independent reviewer'))
  ];

  const environmentVariables = [
    {
      schemaname: 'mtc_ProcessingMode', displayname: 'MTC processing mode',
      description: 'Disabled, Shadow, or Label. Keep Disabled until explicit acceptance and activation approval.',
      defaultvalue: 'Disabled', type: 100000000
    },
    {
      schemaname: 'mtc_LabelingMode', displayname: 'MTC Outlook labeling mode',
      description: 'Disabled, Pilot, or Production. Visible labels require separate explicit approval. Shadow processing alone never authorizes categories.',
      defaultvalue: 'Disabled', type: 100000000
    },
    {
      schemaname: 'mtc_PilotMailbox', displayname: 'MTC pilot mailbox',
      description: 'Customer-approved mailbox scope. An empty value prohibits mailbox processing.',
      defaultvalue: '', type: 100000000
    },
    {
      schemaname: 'mtc_OperatorAlertDestination', displayname: 'MTC operator alert destination',
      description: 'Tenant-local restricted operator destination. Required before automation activation.',
      defaultvalue: '', type: 100000000
    },
    {
      schemaname: 'mtc_PolicyVersion', displayname: 'MTC policy version',
      description: 'Deterministic qualification policy version, not an approval or security verdict.',
      defaultvalue: '1', type: 100000000
    },
    {
      schemaname: 'mtc_RequiredRegistrarFields', displayname: 'MTC required registrar fields',
      description: 'Client choice of verification details a registrar must record: a comma-separated list of VerificationMethod, EvidenceReference and ExpiresOn. Empty makes all three optional. Listed fields are enforced on new approvals and for Known matching.',
      defaultvalue: '', type: 100000000
    }
  ];

  function validateTarget(target, currentOrigin, options = {}) {
    if (!target || !/^https:\/\/[a-z0-9-]+\.crm\d*\.dynamics\.com$/.test(target.environmentOrigin)) {
      throw new Error('An explicit commercial-cloud Dataverse HTTPS origin is required.');
    }
    if (currentOrigin !== target.environmentOrigin) {
      throw new Error('Browser origin does not match the approved environment.');
    }
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(target.organizationId) ||
        target.organizationId === '00000000-0000-0000-0000-000000000000') {
      throw new Error('A verified, non-placeholder organization ID is required.');
    }
    // Production accepts only an explicitly approved versioned migration of an existing solution.
    const production = target.environmentType === 'Production' && options.productionMigration === true;
    if ((!['Sandbox', 'Developer'].includes(target.environmentType) && !production) || target.authorizationConfirmed !== true) {
      throw new Error('Bootstrap is limited to an explicitly authorized Sandbox or Developer environment.');
    }
  }

  function validateTable(actual, expected) {
    if (actual.SchemaName !== expected.SchemaName || actual.OwnershipType !== expected.OwnershipType ||
        actual.IsAuditEnabled?.Value !== expected.IsAuditEnabled.Value || actual.IsManaged) {
      throw new Error(`Existing table conflicts with the development schema: ${expected.SchemaName}`);
    }
    for (const attribute of expected.Attributes) {
      const existing = actual.Attributes?.find(item => item.SchemaName === attribute.SchemaName);
      const type = attribute['@odata.type'].split('.').at(-1).replace('AttributeMetadata', '');
      if (!existing || existing.AttributeType !== type ||
          existing.RequiredLevel?.Value !== attribute.RequiredLevel.Value ||
          (attribute.IsPrimaryName && !existing.IsPrimaryName) ||
          (attribute.MaxLength && existing.MaxLength !== attribute.MaxLength) ||
          (attribute.DateTimeBehavior && existing.DateTimeBehavior?.Value !== attribute.DateTimeBehavior.Value) ||
          (attribute.OptionSet && (existing.DefaultFormValue !== attribute.DefaultFormValue ||
            JSON.stringify(existing.OptionSet?.Options?.map(item => item.Value).sort()) !==
            JSON.stringify(attribute.OptionSet.Options.map(item => item.Value).sort()) ||
            attribute.OptionSet.Options.some(option => {
              const actual = existing.OptionSet?.Options?.find(item => item.Value === option.Value);
              return actual?.Label?.LocalizedLabels?.find(item => item.LanguageCode === 1033)?.Label !==
                option.Label.LocalizedLabels[0].Label;
            })))) {
        throw new Error(`Existing column conflicts with the development schema: ${expected.SchemaName}.${attribute.SchemaName}`);
      }
    }
  }

  async function bootstrap(target, context = {}) {
    const currentOrigin = context.origin ?? root.location?.origin;
    validateTarget(target, currentOrigin, { productionMigration: context.productionMigration === true });
    const productionMigration = target.environmentType === 'Production';
    const fetcher = context.fetch ?? root.fetch.bind(root);
    const report = { solution: solutionName, version: solutionVersion, created: [], existing: [], updated: [], published: false };
    const headers = {
      Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8',
      'OData-Version': '4.0', 'OData-MaxVersion': '4.0'
    };

    async function request(path, method = 'GET', body, inSolution = false, allowMissing = false) {
      const response = await fetcher(`${target.environmentOrigin}/api/data/v9.2/${path}`, {
        method, credentials: 'same-origin', redirect: 'error',
        headers: {
          ...headers,
          ...(inSolution ? { 'MSCRM.SolutionUniqueName': solutionName } : {}),
          ...(method === 'POST' ? { Prefer: 'return=representation' } : {}),
          ...(method === 'PUT' ? { 'MSCRM.MergeLabels': 'true' } : {})
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      if (allowMissing && response.status === 404) return null;
      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Dataverse ${method} ${path} failed (${response.status}): ${details.slice(0, 2000)}`);
      }
      if (response.status === 204) return null;
      return response.json();
    }

    const identity = await request('WhoAmI');
    if (identity.OrganizationId.toLowerCase() !== target.organizationId.toLowerCase()) {
      throw new Error('Dataverse organization does not match the approved target; no writes performed.');
    }

    const publishers = await request(`publishers?$select=publisherid,customizationprefix&$filter=uniquename eq '${solutionName}'`);
    if (publishers.value.length > 1) throw new Error('Ambiguous solution publisher.');
    let publisher = publishers.value[0];
    if (productionMigration && !publisher)
      throw new Error('Production accepts only a migration of the existing solution; no writes performed.');
    if (publisher && publisher.customizationprefix !== prefix) throw new Error('Existing publisher prefix conflicts.');
    if (!publisher) {
      publisher = await request('publishers', 'POST', {
        uniquename: solutionName, friendlyname: 'Trusted Sender Solution',
        customizationprefix: prefix, customizationoptionvalueprefix: 10740
      });
      report.created.push('publisher');
    } else {
      report.existing.push('publisher');
    }

    const solutions = await request(`solutions?$select=solutionid,ismanaged,_publisherid_value,version&$filter=uniquename eq '${solutionName}'`);
    if (solutions.value.length > 1) throw new Error('Ambiguous development solution.');
    const existingSolution = solutions.value[0];
    if (existingSolution && (existingSolution.ismanaged ||
        existingSolution._publisherid_value !== publisher.publisherid ||
        (existingSolution.version !== solutionVersion &&
          !upgradeableSolutionVersions.has(existingSolution.version)))) {
      throw new Error('Existing solution conflicts; use a versioned migration rather than bootstrap.');
    }
    const upgradeSolution = existingSolution && existingSolution.version !== solutionVersion;
    if (productionMigration && !upgradeSolution)
      throw new Error('Production accepts only a versioned upgrade of the existing solution; no writes performed.');
    if (!existingSolution) {
      await request('solutions', 'POST', {
        uniquename: solutionName, friendlyname: 'Trusted Sender Solution',
        version: solutionVersion,
        description: 'Development known/not-known sender registry and disabled shadow-runtime foundation. No active mailbox automation.',
        'publisherid@odata.bind': `/publishers(${publisher.publisherid})`
      });
      report.created.push('solution');
    } else {
      report.existing.push('solution');
    }

    for (const definition of tables) {
      const basePath = `EntityDefinitions(LogicalName='${definition.SchemaName.toLowerCase()}')`;
      const path = `${basePath}?$expand=Attributes`;
      let existing = await request(path, 'GET', undefined, false, true);
      const created = !existing;
      if (!existing) {
        await request('EntityDefinitions', 'POST', definition, true);
        existing = await request(path);
      }
      const upgradeColumns = definition.SchemaName === 'mtc_VerificationCase'
        ? verificationCaseUpgradeColumns : runtimeUpgradeColumns[definition.SchemaName];
      if (!created && upgradeSolution && upgradeColumns) {
        for (const attribute of definition.Attributes) {
          if (upgradeColumns.has(attribute.SchemaName) &&
              !existing.Attributes.some(item => item.SchemaName === attribute.SchemaName)) {
            await request(`${basePath}/Attributes`, 'POST', attribute, true);
            report.updated.push(`${definition.SchemaName}.${attribute.SchemaName}`);
          }
        }
        existing = await request(path);
      }
      if (!created && upgradeSolution && existing.IsAuditEnabled?.Value !== definition.IsAuditEnabled.Value) {
        const full = await request(basePath);
        delete full['@odata.context'];
        full.IsAuditEnabled = { ...full.IsAuditEnabled, Value: definition.IsAuditEnabled.Value };
        await request(`EntityDefinitions(${full.MetadataId})`, 'PUT', full, true);
        report.updated.push(`${definition.SchemaName}.IsAuditEnabled`);
        existing = await request(path);
      }
      const loadChoices = async () => {
        const choices = await request(`${basePath}/Attributes/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$expand=OptionSet`);
        existing.Attributes = existing.Attributes.map(attribute => ({
          ...attribute, ...choices.value.find(item => item.SchemaName === attribute.SchemaName)
        }));
      };
      if (definition.Attributes.some(attribute => attribute.OptionSet)) {
        await loadChoices();
        let inserted = false;
        for (const attribute of definition.Attributes.filter(item => item.OptionSet && !created && upgradeSolution)) {
          const actual = existing.Attributes.find(item => item.SchemaName === attribute.SchemaName);
          for (const option of attribute.OptionSet.Options) {
            if (actual && !actual.OptionSet?.Options?.some(item => item.Value === option.Value)) {
              await request('InsertOptionValue', 'POST', {
                EntityLogicalName: definition.SchemaName.toLowerCase(),
                AttributeLogicalName: attribute.SchemaName.toLowerCase(),
                Value: option.Value, Label: option.Label, SolutionUniqueName: solutionName
              });
              report.updated.push(`${definition.SchemaName}.${attribute.SchemaName}=${option.Value}`);
              inserted = true;
            }
          }
        }
        if (inserted) await loadChoices();
      }
      validateTable(existing, definition);
      report[created ? 'created' : 'existing'].push(definition.SchemaName);
      await request('AddSolutionComponent', 'POST', {
        ComponentId: existing.MetadataId, ComponentType: 1,
        SolutionUniqueName: solutionName, AddRequiredComponents: false, DoNotIncludeSubcomponents: false
      });
    }

    for (const definition of relationships) {
      const existing = await request(`RelationshipDefinitions(SchemaName='${definition.SchemaName}')`,
        'GET', undefined, false, true);
      if (existing) {
        if (existing.ReferencedEntity !== definition.ReferencedEntity ||
            existing.ReferencingEntity !== definition.ReferencingEntity ||
            existing.ReferencingAttribute !== definition.Lookup.SchemaName.toLowerCase() ||
            Object.entries(definition.CascadeConfiguration).some(([name, value]) =>
              existing.CascadeConfiguration?.[name] !== value)) {
          throw new Error(`Existing relationship conflicts: ${definition.SchemaName}`);
        }
        report.existing.push(definition.SchemaName);
      } else {
        await request('RelationshipDefinitions', 'POST', definition, true);
        report.created.push(definition.SchemaName);
      }
    }

    for (const definition of environmentVariables) {
      const matches = await request(`environmentvariabledefinitions?$select=environmentvariabledefinitionid,defaultvalue,type&$filter=schemaname eq '${definition.schemaname}'`);
      if (matches.value.length > 1) throw new Error(`Ambiguous environment variable: ${definition.schemaname}`);
      let existing = matches.value[0];
      if (existing) {
        if ((existing.defaultvalue ?? '') !== definition.defaultvalue || existing.type !== definition.type) {
          throw new Error(`Existing environment variable conflicts: ${definition.schemaname}`);
        }
        report.existing.push(definition.schemaname);
      } else {
        existing = await request('environmentvariabledefinitions', 'POST', definition, true);
        report.created.push(definition.schemaname);
      }
      await request('AddSolutionComponent', 'POST', {
        ComponentId: existing.environmentvariabledefinitionid, ComponentType: 380,
        SolutionUniqueName: solutionName, AddRequiredComponents: false
      });
      const currentValues = await request(`environmentvariablevalues?$select=environmentvariablevalueid&$filter=_environmentvariabledefinitionid_value eq ${existing.environmentvariabledefinitionid}`);
      if (currentValues.value.length && context.preserveOperationalSettings !== true) {
        throw new Error(`Tenant-specific current values exist for ${definition.schemaname}; do not export this development solution to public source control.`);
      }
    }

    const entities = tables.map(item => `<entity>${item.SchemaName.toLowerCase()}</entity>`).join('');
    await request('PublishXml', 'POST', { ParameterXml: `<importexportxml><entities>${entities}</entities></importexportxml>` });
    if (upgradeSolution) {
      await request(`solutions(${existingSolution.solutionid})`, 'PATCH', {
        version: solutionVersion,
        ...(productionMigration ? {} : {
          description: 'Development known/not-known sender registry and disabled shadow-runtime foundation. No active mailbox automation.'
        })
      });
      report.updated.push(`solution ${existingSolution.version} -> ${solutionVersion}`);
    }
    report.published = true;
    return report;
  }

  async function exportSolution(target, managed, context = {}) {
    validateTarget(target, context.origin ?? root.location?.origin);
    if (typeof managed !== 'boolean') throw new Error('Managed export mode must be explicit.');
    const fetcher = context.fetch ?? root.fetch.bind(root);
    async function request(path, method = 'GET', body) {
      const response = await fetcher(`${target.environmentOrigin}/api/data/v9.2/${path}`, {
        method, credentials: 'same-origin', redirect: 'error',
        headers: {
          Accept: 'application/json', 'Content-Type': 'application/json',
          'OData-Version': '4.0', 'OData-MaxVersion': '4.0'
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      if (!response.ok) throw new Error(`Export ${method} ${path} failed (${response.status}): ${(await response.text()).slice(0, 2000)}`);
      return response.json();
    }
    const identity = await request('WhoAmI');
    if (identity.OrganizationId.toLowerCase() !== target.organizationId.toLowerCase()) {
      throw new Error('Export organization does not match the approved development target.');
    }
    for (const definition of environmentVariables) {
      const matches = await request(`environmentvariabledefinitions?$select=environmentvariabledefinitionid&$filter=schemaname eq '${definition.schemaname}'`);
      if (matches.value.length !== 1) throw new Error(`Missing or ambiguous export configuration: ${definition.schemaname}`);
      const values = await request(`environmentvariablevalues?$select=environmentvariablevalueid&$filter=_environmentvariabledefinitionid_value eq ${matches.value[0].environmentvariabledefinitionid}`);
      if (values.value.length && context.privateReviewOnly !== true)
        throw new Error(`Remove tenant-specific current values from the export solution: ${definition.schemaname}`);
    }
    const result = await request('ExportSolution', 'POST', {
      SolutionName: solutionName, Managed: managed,
      ExportAutoNumberingSettings: false, ExportCalendarSettings: false,
      ExportCustomizationSettings: false, ExportEmailTrackingSettings: false,
      ExportGeneralSettings: false, ExportMarketingSettings: false,
      ExportOutlookSynchronizationSettings: false, ExportRelationshipRoles: false,
      ExportIsvConfig: false, ExportSales: false, ExportExternalApplications: false
    });
    if (typeof result.ExportSolutionFile !== 'string' || !result.ExportSolutionFile.length) {
      throw new Error('Dataverse export returned no solution file.');
    }
    return {
      fileName: `${solutionName}${managed ? '_managed' : ''}.zip`,
      base64: result.ExportSolutionFile
    };
  }

  const api = {
    solutionName, solutionVersion, tables, relationships, environmentVariables,
    validateTarget, validateTable, bootstrap, exportSolution
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MtcProvisioning = api;
})(globalThis);
