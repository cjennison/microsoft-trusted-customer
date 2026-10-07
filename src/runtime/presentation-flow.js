'use strict';

(function (root) {
  const workflowId = '92696be8-ad52-4b79-81b2-0dee193808cf';
  const name = 'MTC Processor - authorized Outlook presentation';
  const graph = 'shared_mtc-20microsoft-20graph-20mail-5fad2197ce913463-bbf4bc2ad08b7a26';
  const dataverse = 'shared_commondataserviceforapps';
  const after = action => ({ [action]: ['Succeeded'] });
  const assessment = "@items('For_each_pending_presentation')?['mtc_messageassessmentid']";
  const fields = 'id,parentFolderId,receivedDateTime,categories,from,sender,replyTo,internetMessageHeaders';

  function api(service, operationId, parameters, runAfter) {
    return {
      ...(runAfter ? { runAfter } : {}), type: 'OpenApiConnection',
      inputs: {
        parameters,
        host: { apiId: `/providers/Microsoft.PowerApps/apis/${service}`, operationId, connectionName: service },
        retryPolicy: { type: 'exponential', count: 4, interval: 'PT10S' }
      }
    };
  }
  function action(actionName, input, runAfter) {
    return api(dataverse, 'PerformUnboundAction', {
      actionName, ...Object.fromEntries(Object.entries(input).map(([key, value]) => [`item/${key}`, value]))
    }, runAfter);
  }
  function getMessage(runAfter) {
    return api(graph, 'GetMessageMetadata', {
      mailbox: "@items('For_each_pending_presentation')?['mtc_mailboxreference']",
      messageId: "@items('For_each_pending_presentation')?['mtc_stablemessageid']",
      '$select': fields, Prefer: 'IdType="ImmutableId"'
    }, runAfter);
  }

  function buildClientData() {
    return {
      properties: {
        connectionReferences: Object.fromEntries([
          [graph, 'mtc_MTCGraphMail'], [dataverse, 'mtc_MTCMicrosoftDataverse']
        ].map(([apiName, reference]) => [apiName, {
          runtimeSource: 'embedded', api: { name: apiName },
          connection: { connectionReferenceLogicalName: reference }
        }])),
        definition: {
          '$schema': 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
          contentVersion: '1.0.0.0',
          parameters: {
            '$authentication': { defaultValue: {}, type: 'SecureObject' },
            '$connections': { defaultValue: {}, type: 'Object' }
          },
          triggers: {
            Recurrence: {
              type: 'Recurrence', recurrence: { frequency: 'Minute', interval: 1 },
              runtimeConfiguration: { concurrency: { runs: 1 } }
            }
          },
          actions: {
            Initialize_presentation_failure: {
              type: 'InitializeVariable',
              inputs: { variables: [{ name: 'AnyPresentationFailed', type: 'boolean', value: false }] }
            },
            Check_explicit_label_authorization: action('mtc_IsLabelingEnabled', {}, after('Initialize_presentation_failure')),
            Require_explicit_label_authorization: {
              runAfter: after('Check_explicit_label_authorization'), type: 'If',
              expression: { equals: ["@body('Check_explicit_label_authorization')?['Enabled']", true] },
              actions: {
                List_pending_presentations: api(dataverse, 'ListRecords', {
                  entityName: 'mtc_messageassessments',
                  '$select': 'mtc_messageassessmentid,mtc_mailboxreference,mtc_stablemessageid',
                  '$filter': "@concat('mtc_processingstatus eq 100000001 and mtc_receivedon ge ', formatDateTime(addDays(utcNow(), -30), 'yyyy-MM-ddTHH:mm:ssZ'), ' and (mtc_presentationstatus eq 100000000 or mtc_presentationstatus eq null or (mtc_presentationstatus eq 100000002 and mtc_receivedon ge ', formatDateTime(addDays(utcNow(), -2), 'yyyy-MM-ddTHH:mm:ssZ'), '))')",
                  '$orderby': 'mtc_receivedon desc',
                  '$top': 500
                }),
                For_each_pending_presentation: {
                  runAfter: after('List_pending_presentations'), type: 'Foreach',
                  foreach: "@body('List_pending_presentations')?['value']",
                  runtimeConfiguration: { concurrency: { repetitions: 20 } },
                  actions: {
                    Reconcile_one_message: {
                      type: 'Scope', actions: {
                        Get_current_immutable_metadata: getMessage(),
                        Plan_current_registry_presentation: action('mtc_GetMessageLabelPlan', {
                          AssessmentId: assessment, MessageJson: "@string(body('Get_current_immutable_metadata'))"
                        }, after('Get_current_immutable_metadata')),
                        Require_category_write: {
                          runAfter: after('Plan_current_registry_presentation'), type: 'If',
                          expression: { equals: ["@body('Plan_current_registry_presentation')?['NeedsWrite']", true] },
                          actions: {
                            Apply_owned_category_plan: api(graph, 'UpdateMessageCategories', {
                              mailbox: "@items('For_each_pending_presentation')?['mtc_mailboxreference']",
                              messageId: "@items('For_each_pending_presentation')?['mtc_stablemessageid']",
                              'If-Match': "@body('Plan_current_registry_presentation')?['ETag']",
                              Prefer: 'IdType="ImmutableId"',
                              'body/categories': "@json(body('Plan_current_registry_presentation')?['CategoriesJson'])"
                            })
                          },
                          else: { actions: {} }
                        },
                        Get_category_readback: getMessage(after('Require_category_write')),
                        Verify_exact_category_readback: action('mtc_VerifyMessagePresentation', {
                          AssessmentId: assessment,
                          MessageJson: "@string(body('Get_category_readback'))",
                          ExpectedCategoriesJson: "@body('Plan_current_registry_presentation')?['CategoriesJson']"
                        }, after('Get_category_readback'))
                      }
                    },
                    Mark_presentation_failure: {
                      runAfter: { Reconcile_one_message: ['Failed', 'TimedOut'] },
                      type: 'SetVariable', inputs: { name: 'AnyPresentationFailed', value: true }
                    },
                    Notify_presentation_failure: action('mtc_ReportPresentationFailure', {
                      AssessmentId: assessment,
                      Reason: 'Outlook category write/readback failed. The assessment remains pending or failed; inspect the run before claiming that relabeling completed.'
                    }, after('Mark_presentation_failure'))
                  }
                }
              },
              else: { actions: {} }
            },
            Require_successful_presentations: {
              runAfter: after('Require_explicit_label_authorization'), type: 'If',
              expression: { equals: ["@variables('AnyPresentationFailed')", true] },
              actions: {
                Fail_notified_presentation_run: {
                  type: 'Terminate',
                  inputs: { runStatus: 'Failed', runError: {
                    code: 'MTC_PRESENTATION_FAILED', message: 'One or more category reconciliations failed; in-app operator alerts were issued.'
                  } }
                }
              },
              else: { actions: {} }
            }
          },
          outputs: {}
        }, templateName: ''
      }, schemaVersion: '1.0.0.0'
    };
  }

  async function install(target) {
    root.MtcProvisioning.validateTarget(target, root.location.origin);
    async function request(path, method = 'GET', body) {
      const response = await root.fetch(`${target.environmentOrigin}/api/data/v9.2/${path}`, {
        method, credentials: 'same-origin', redirect: 'error',
        headers: {
          'Content-Type': 'application/json', 'MSCRM.SolutionUniqueName': 'MicrosoftTrustedCustomer',
          ...(method === 'POST' ? { Prefer: 'return=representation' } : {})
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      if (!response.ok) throw new Error(`Presentation flow ${method} ${path} failed (${response.status}): ${(await response.text()).slice(0, 1600)}`);
      return response.status === 204 ? null : response.json();
    }
    const identity = await request('WhoAmI');
    if (identity.OrganizationId.toLowerCase() !== target.organizationId.toLowerCase())
      throw new Error('Presentation organization mismatch; no writes performed.');
    const flows = await request(`workflows?$select=workflowid,name,statecode,statuscode&$filter=workflowid eq ${workflowId}`);
    if (flows.value.length > 1) throw new Error('Duplicate presentation workflow identity.');
    const existing = flows.value[0];
    const clientdata = JSON.stringify(buildClientData());
    if (!existing) {
      await request('workflows', 'POST', {
        workflowid: workflowId, name, category: 5, type: 1, mode: 0, scope: 4,
        ondemand: false, subprocess: false, primaryentity: 'none', modernflowtype: 0, clientdata
      });
    } else {
      if (existing.name !== name || existing.statecode !== 0 || existing.statuscode !== 1)
        throw new Error('The presentation workflow must remain Off during deployment.');
      await request(`workflows(${workflowId})`, 'PATCH', { clientdata });
    }
    await request('AddSolutionComponent', 'POST', {
      ComponentId: workflowId, ComponentType: 29, SolutionUniqueName: 'MicrosoftTrustedCustomer', AddRequiredComponents: false
    });
    return { workflowId, name, state: 'Off', labelAuthorization: 'Separate approval required' };
  }
  const exported = { workflowId, name, buildClientData, install };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else root.MtcPresentationFlow = exported;
})(globalThis);
