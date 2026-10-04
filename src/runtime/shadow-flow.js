'use strict';

(function (root) {
  const solutionName = 'MicrosoftTrustedCustomer';
  const workflowId = '81b229c4-d759-49a7-93da-816056e8841c';
  const workflowName = 'MTC Processor - scheduled shadow assessment';
  const graphApiName = 'shared_mtc-20microsoft-20graph-20mail-5fad2197ce913463-bbf4bc2ad08b7a26';
  const graphApiId = `/providers/Microsoft.PowerApps/apis/${graphApiName}`;
  const dataverseApiName = 'shared_commondataserviceforapps';
  const dataverseApiId = `/providers/Microsoft.PowerApps/apis/${dataverseApiName}`;

  function openApi(apiId, connectionName, operationId, parameters, runAfter) {
    return {
      ...(runAfter ? { runAfter } : {}),
      type: 'OpenApiConnection',
      inputs: {
        parameters,
        host: { apiId, operationId, connectionName }
      }
    };
  }

  function dataverse(operationId, parameters, runAfter) {
    return openApi(dataverseApiId, dataverseApiName, operationId, parameters, runAfter);
  }

  function graph(operationId, parameters, runAfter) {
    return openApi(graphApiId, graphApiName, operationId, parameters, runAfter);
  }

  function assessmentParameters(recordId) {
    const contacts = "body('Filter_matching_contacts')";
    const domains = "body('Filter_matching_domains')";
    const parties = "body('Filter_matching_party')";
    const trusted = "body('Filter_trusted_microsoft_authentication_results')";
    const message = "body('Get_message_metadata')";
    const mailbox = "items('For_each_enrolled_mailbox')?['mtc_mailboxreference']";
    const relationship = `@if(and(equals(length(${contacts}), 1), equals(length(${parties}), 1)), 100000003, if(and(equals(length(${contacts}), 0), equals(length(${domains}), 1), equals(length(${parties}), 1)), 100000002, 100000001))`;
    const known = `and(equals(length(${trusted}), 1), or(and(equals(length(${contacts}), 1), equals(length(${parties}), 1)), and(equals(length(${contacts}), 0), equals(length(${domains}), 1), equals(length(${parties}), 1))))`;
    const reasons = `@concat(if(equals(length(${trusted}), 1), 'MTC_TRUSTED_MICROSOFT_AUTH_RESULTS;MTC_SPF_PASS;MTC_DKIM_PASS;MTC_DMARC_PASS;MTC_COMPAUTH_PASS', 'MTC_AUTH_BOUNDARY_MISSING_OR_AMBIGUOUS'), ';', if(and(equals(length(${contacts}), 1), equals(length(${parties}), 1)), 'MTC_EXACT_CONTACT_MATCH', if(and(equals(length(${contacts}), 0), equals(length(${domains}), 1), equals(length(${parties}), 1)), 'MTC_EXACT_DOMAIN_MATCH', 'MTC_REGISTRY_NO_UNAMBIGUOUS_MATCH')), ';MTC_SHADOW_NO_PRESENTATION')`;
    return {
      entityName: 'mtc_messageassessments',
      ...(recordId ? { recordId } : {}),
      'item/mtc_name': `@if(${known}, concat('Shadow known ', substring(${message}?['id'], 0, 24)), concat('Shadow not known ', substring(${message}?['id'], 0, 24)))`,
      'item/mtc_mailboxreference': `@${mailbox}`,
      'item/mtc_stablemessageid': `@${message}?['id']`,
      'item/mtc_receivedon': `@${message}?['receivedDateTime']`,
      'item/mtc_assessedon': '@utcNow()',
      'item/mtc_registryversion': 'known-sender-registry-v1',
      'item/mtc_ruleversion': 'message-runtime-shadow-1',
      'item/mtc_relationshipstate': relationship,
      'item/mtc_authenticationstate': `@if(equals(length(${trusted}), 1), 100000001, 100000002)`,
      'item/mtc_riskstate': 100000000,
      'item/mtc_processingstatus': 100000001,
      'item/mtc_presentationstatus': 100000000,
      'item/mtc_reasoncodes': reasons
    };
  }

  function buildClientData() {
    const updateAssessment = assessmentParameters(
      "@first(body('List_existing_shadow_assessments')?['value'])?['mtc_messageassessmentid']"
    );
    const createAssessment = assessmentParameters();

    const messageActions = {
      Get_message_metadata: graph('GetMessageMetadata', {
        mailbox: "@items('For_each_enrolled_mailbox')?['mtc_mailboxreference']",
        messageId: "@items('For_each_message')?['id']",
        '$select': 'id,receivedDateTime,internetMessageId,parentFolderId,from,sender,replyTo,categories,internetMessageHeaders',
        Prefer: 'IdType="ImmutableId"'
      }),
      Filter_trusted_microsoft_authentication_results: {
        runAfter: { Get_message_metadata: ['Succeeded'] },
        type: 'Query',
        inputs: {
          from: "@coalesce(body('Get_message_metadata')?['internetMessageHeaders'], createArray())",
          where: "@and(equals(toLower(item()?['name']), 'authentication-results'), startsWith(toLower(trim(string(item()?['value']))), 'mx.microsoft.com'), contains(toLower(item()?['value']), 'spf=pass'), contains(toLower(item()?['value']), 'dkim=pass'), contains(toLower(item()?['value']), 'dmarc=pass'), contains(toLower(item()?['value']), 'compauth=pass'))"
        }
      },
      List_active_contacts: dataverse('ListRecords', {
        entityName: 'mtc_approvedcontacts',
        '$select': 'mtc_approvedcontactid,mtc_emailaddress,mtc_expireson,mtc_verifiedon,mtc_verificationmethod,mtc_evidencereference,_mtc_businessparty_value',
        '$filter': 'mtc_verificationstatus eq 100000001 and statecode eq 0',
        '$top': 500
      }, { Get_message_metadata: ['Succeeded'] }),
      Filter_matching_contacts: {
        runAfter: { List_active_contacts: ['Succeeded'] },
        type: 'Query',
        inputs: {
          from: "@coalesce(body('List_active_contacts')?['value'], createArray())",
          where: "@and(equals(toLower(item()?['mtc_emailaddress']), toLower(body('Get_message_metadata')?['from']?['emailAddress']?['address'])), not(empty(item()?['_mtc_businessparty_value'])), not(empty(item()?['mtc_verifiedon'])), not(empty(item()?['mtc_verificationmethod'])), not(empty(item()?['mtc_evidencereference'])), not(empty(item()?['mtc_expireson'])), greater(ticks(item()?['mtc_expireson']), ticks(utcNow())))"
        }
      },
      List_active_domains: dataverse('ListRecords', {
        entityName: 'mtc_approveddomains',
        '$select': 'mtc_approveddomainid,mtc_domain,mtc_expireson,mtc_verifiedon,mtc_verificationmethod,mtc_evidencereference,_mtc_businessparty_value',
        '$filter': 'mtc_verificationstatus eq 100000001 and statecode eq 0',
        '$top': 500
      }, { Get_message_metadata: ['Succeeded'] }),
      Filter_matching_domains: {
        runAfter: { List_active_domains: ['Succeeded'] },
        type: 'Query',
        inputs: {
          from: "@coalesce(body('List_active_domains')?['value'], createArray())",
          where: "@and(equals(toLower(item()?['mtc_domain']), last(split(toLower(body('Get_message_metadata')?['from']?['emailAddress']?['address']), '@'))), not(empty(item()?['_mtc_businessparty_value'])), not(empty(item()?['mtc_verifiedon'])), not(empty(item()?['mtc_verificationmethod'])), not(empty(item()?['mtc_evidencereference'])), not(empty(item()?['mtc_expireson'])), greater(ticks(item()?['mtc_expireson']), ticks(utcNow())))"
        }
      },
      Select_business_party_id: {
        runAfter: {
          Filter_matching_contacts: ['Succeeded'],
          Filter_matching_domains: ['Succeeded']
        },
        type: 'Compose',
        inputs: "@if(equals(length(body('Filter_matching_contacts')), 1), first(body('Filter_matching_contacts'))?['_mtc_businessparty_value'], if(and(equals(length(body('Filter_matching_contacts')), 0), equals(length(body('Filter_matching_domains')), 1)), first(body('Filter_matching_domains'))?['_mtc_businessparty_value'], ''))"
      },
      List_active_parties: dataverse('ListRecords', {
        entityName: 'mtc_businessparties',
        '$select': 'mtc_businesspartyid,mtc_expireson,mtc_verifiedon,mtc_verificationmethod,mtc_evidencereference',
        '$filter': 'mtc_verificationstatus eq 100000001 and statecode eq 0',
        '$top': 500
      }, { Select_business_party_id: ['Succeeded'] }),
      Filter_matching_party: {
        runAfter: { List_active_parties: ['Succeeded'] },
        type: 'Query',
        inputs: {
          from: "@coalesce(body('List_active_parties')?['value'], createArray())",
          where: "@and(not(empty(outputs('Select_business_party_id'))), equals(item()?['mtc_businesspartyid'], outputs('Select_business_party_id')), not(empty(item()?['mtc_verifiedon'])), not(empty(item()?['mtc_verificationmethod'])), not(empty(item()?['mtc_evidencereference'])), not(empty(item()?['mtc_expireson'])), greater(ticks(item()?['mtc_expireson']), ticks(utcNow())))"
        }
      },
      List_existing_shadow_assessments: dataverse('ListRecords', {
        entityName: 'mtc_messageassessments',
        '$select': 'mtc_messageassessmentid',
        '$filter': "@concat('mtc_stablemessageid eq ''', replace(body('Get_message_metadata')?['id'], '''', ''''''), ''' and mtc_mailboxreference eq ''', replace(items('For_each_enrolled_mailbox')?['mtc_mailboxreference'], '''', ''''''), '''')",
        '$top': 2
      }, { Get_message_metadata: ['Succeeded'] }),
      Require_at_most_one_existing_assessment: {
        runAfter: {
          Filter_trusted_microsoft_authentication_results: ['Succeeded'],
          Filter_matching_party: ['Succeeded'],
          List_existing_shadow_assessments: ['Succeeded']
        },
        type: 'If',
        expression: {
          and: [
            {
              lessOrEquals: [
                "@length(body('List_existing_shadow_assessments')?['value'])",
                1
              ]
            }
          ]
        },
        actions: {
          Shadow_assessment_exists: {
            type: 'If',
            expression: {
              and: [
                {
                  equals: [
                    "@length(body('List_existing_shadow_assessments')?['value'])",
                    1
                  ]
                }
              ]
            },
            actions: {
              Update_shadow_assessment: dataverse('UpdateOnlyRecord', updateAssessment)
            },
            else: {
              actions: {
                Create_shadow_assessment: dataverse('CreateRecord', createAssessment)
              }
            }
          }
        },
        else: {
          actions: {
            Fail_duplicate_assessments: {
              type: 'Terminate',
              inputs: {
                runStatus: 'Failed',
                runError: {
                  code: 'MTC_DUPLICATE_ASSESSMENT',
                  message: 'More than one assessment exists for the mailbox and immutable message ID.'
                }
              }
            }
          }
        }
      }
    };

    const mailboxActions = {
      Mark_poll_attempt: dataverse('UpdateOnlyRecord', {
        entityName: 'mtc_mailboxenrollments',
        recordId: "@items('For_each_enrolled_mailbox')?['mtc_mailboxenrollmentid']",
        'item/mtc_lastattempton': '@utcNow()',
        'item/mtc_lasterror': ''
      }),
      List_inbox_messages: graph('ListInboxMessages', {
        mailbox: "@items('For_each_enrolled_mailbox')?['mtc_mailboxreference']",
        '$filter': "@concat('receivedDateTime ge ', if(empty(items('For_each_enrolled_mailbox')?['mtc_checkpoint']), formatDateTime(addMinutes(utcNow(), -10), 'yyyy-MM-ddTHH:mm:ssZ'), items('For_each_enrolled_mailbox')?['mtc_checkpoint']))",
        '$select': 'id,receivedDateTime,internetMessageId,parentFolderId,from,sender,replyTo,categories',
        '$top': 100,
        Prefer: 'IdType="ImmutableId"'
      }, { Mark_poll_attempt: ['Succeeded'] }),
      Require_complete_message_page: {
        runAfter: { List_inbox_messages: ['Succeeded'] },
        type: 'If',
        expression: {
          and: [
            {
              empty: [
                "@body('List_inbox_messages')?['@odata.nextLink']"
              ]
            }
          ]
        },
        actions: {
          For_each_message: {
            type: 'Foreach',
            foreach: "@coalesce(body('List_inbox_messages')?['value'], createArray())",
            actions: messageActions,
            runtimeConfiguration: {
              concurrency: { repetitions: 1 }
            }
          },
          Mark_mailbox_healthy: dataverse('UpdateOnlyRecord', {
            entityName: 'mtc_mailboxenrollments',
            recordId: "@items('For_each_enrolled_mailbox')?['mtc_mailboxenrollmentid']",
            'item/mtc_checkpoint': "@formatDateTime(utcNow(), 'yyyy-MM-ddTHH:mm:ssZ')",
            'item/mtc_lastsuccessfulpollon': '@utcNow()',
            'item/mtc_healthstate': 100000001,
            'item/mtc_lasterror': ''
          }, { For_each_message: ['Succeeded'] })
        },
        else: {
          actions: {
            Mark_mailbox_page_limit: dataverse('UpdateOnlyRecord', {
              entityName: 'mtc_mailboxenrollments',
              recordId: "@items('For_each_enrolled_mailbox')?['mtc_mailboxenrollmentid']",
              'item/mtc_healthstate': 100000003,
              'item/mtc_lasterror': 'Graph returned another message page; checkpoint was not advanced. Increase paging support before enrolling this mailbox.'
            })
          }
        }
      }
    };

    return {
      properties: {
        connectionReferences: {
          [graphApiName]: {
            runtimeSource: 'embedded',
            connection: {
              connectionReferenceLogicalName: 'mtc_MTCGraphMail'
            },
            api: { name: graphApiName }
          },
          [dataverseApiName]: {
            runtimeSource: 'embedded',
            connection: {
              connectionReferenceLogicalName: 'mtc_MTCMicrosoftDataverse'
            },
            api: { name: dataverseApiName }
          }
        },
        definition: {
          '$schema': 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
          contentVersion: '1.0.0.0',
          parameters: {
            '$authentication': { defaultValue: {}, type: 'SecureObject' },
            '$connections': { defaultValue: {}, type: 'Object' }
          },
          triggers: {
            Recurrence: {
              recurrence: {
                frequency: 'Minute',
                interval: 5
              },
              type: 'Recurrence'
            }
          },
          actions: {
            List_enrolled_mailboxes: dataverse('ListRecords', {
              entityName: 'mtc_mailboxenrollments',
              '$select': 'mtc_mailboxenrollmentid,mtc_mailboxreference,mtc_mailboxtype,mtc_enrollmentstatus,mtc_checkpoint,mtc_healthstate',
              '$filter': 'mtc_enrollmentstatus eq 100000001 and statecode eq 0',
              '$top': 100
            }),
            For_each_enrolled_mailbox: {
              runAfter: { List_enrolled_mailboxes: ['Succeeded'] },
              type: 'Foreach',
              foreach: "@coalesce(body('List_enrolled_mailboxes')?['value'], createArray())",
              actions: {
                Process_mailbox: {
                  type: 'Scope',
                  actions: mailboxActions
                },
                Mark_mailbox_failed: dataverse('UpdateOnlyRecord', {
                  entityName: 'mtc_mailboxenrollments',
                  recordId: "@items('For_each_enrolled_mailbox')?['mtc_mailboxenrollmentid']",
                  'item/mtc_healthstate': 100000003,
                  'item/mtc_lasterror': 'Shadow polling failed. Inspect the Power Automate run history; the checkpoint was not advanced.'
                }, {
                  Process_mailbox: ['Failed', 'TimedOut']
                })
              },
              runtimeConfiguration: {
                concurrency: { repetitions: 1 }
              }
            }
          },
          outputs: {}
        },
        templateName: ''
      },
      schemaVersion: '1.0.0.0'
    };
  }

  function validateTarget(target, currentOrigin) {
    if (!target || target.environmentOrigin !== currentOrigin ||
        !/^https:\/\/[a-z0-9-]+\.crm\d*\.dynamics\.com$/.test(target.environmentOrigin) ||
        !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(target.organizationId) ||
        !['Sandbox', 'Developer'].includes(target.environmentType) ||
        target.authorizationConfirmed !== true) {
      throw new Error('An explicitly authorized matching Sandbox or Developer Dataverse target is required.');
    }
  }

  async function publishShadowFlow(target, context = {}) {
    validateTarget(target, context.origin ?? root.location?.origin);
    const fetcher = context.fetch ?? root.fetch.bind(root);
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'OData-Version': '4.0',
      'OData-MaxVersion': '4.0'
    };

    async function request(path, method = 'GET', body, inSolution = false) {
      const response = await fetcher(`${target.environmentOrigin}/api/data/v9.2/${path}`, {
        method,
        credentials: 'same-origin',
        redirect: 'error',
        headers: {
          ...headers,
          ...(inSolution ? { 'MSCRM.SolutionUniqueName': solutionName } : {}),
          ...(['POST', 'PATCH'].includes(method) ? { Prefer: 'return=representation' } : {})
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      if (!response.ok) {
        throw new Error(`Dataverse ${method} ${path} failed (${response.status}): ${(await response.text()).slice(0, 2000)}`);
      }
      if (response.status === 204) return null;
      return response.json();
    }

    const identity = await request('WhoAmI');
    if (identity.OrganizationId.toLowerCase() !== target.organizationId.toLowerCase()) {
      throw new Error('Dataverse organization does not match the approved target; no writes performed.');
    }
    const existing = await request(`workflows(${workflowId})?$select=workflowid,name,statecode,statuscode,category,type,clientdata`);
    const clientdata = JSON.stringify(buildClientData());
    if (existing.name !== workflowName || existing.statecode !== 0 || existing.statuscode !== 1 ||
        existing.category !== 5 || existing.type !== 1) {
      throw new Error('Existing shadow flow identity or Off state conflicts.');
    }
    if (existing.clientdata !== clientdata) {
      await request(`workflows(${workflowId})`, 'PATCH', { clientdata }, true);
    }
    await request('AddSolutionComponent', 'POST', {
      ComponentId: workflowId,
      ComponentType: 29,
      SolutionUniqueName: solutionName,
      AddRequiredComponents: false
    });
    return { workflowId, name: workflowName, state: 'Off', updated: existing.clientdata !== clientdata };
  }

  async function createShadowFlow(target, context = {}) {
    validateTarget(target, context.origin ?? root.location?.origin);
    const fetcher = context.fetch ?? root.fetch.bind(root);
    const identityResponse = await fetcher(`${target.environmentOrigin}/api/data/v9.2/WhoAmI`, {
      method: 'GET',
      credentials: 'same-origin',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        'OData-Version': '4.0',
        'OData-MaxVersion': '4.0'
      }
    });
    if (!identityResponse.ok) {
      throw new Error(`Dataverse GET WhoAmI failed (${identityResponse.status}): ${(await identityResponse.text()).slice(0, 2000)}`);
    }
    const identity = await identityResponse.json();
    if (identity.OrganizationId.toLowerCase() !== target.organizationId.toLowerCase()) {
      throw new Error('Dataverse organization does not match the approved target; no writes performed.');
    }
    const response = await fetcher(`${target.environmentOrigin}/api/data/v9.2/workflows`, {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'OData-Version': '4.0',
        'OData-MaxVersion': '4.0',
        'MSCRM.SolutionUniqueName': solutionName,
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        workflowid: workflowId,
        name: workflowName,
        category: 5,
        type: 1,
        mode: 0,
        scope: 4,
        ondemand: false,
        subprocess: false,
        primaryentity: 'none',
        modernflowtype: 0,
        clientdata: JSON.stringify(buildClientData())
      })
    });
    if (!response.ok) {
      throw new Error(`Dataverse POST workflows failed (${response.status}): ${(await response.text()).slice(0, 2000)}`);
    }
    const created = await response.json();
    return { workflowId: created.workflowid, name: created.name, state: 'Off', created: true };
  }

  const api = {
    solutionName, workflowId, workflowName, graphApiName,
    buildClientData, validateTarget, createShadowFlow, publishShadowFlow
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MtcShadowFlow = api;
})(globalThis);
