'use strict';

(function (root) {
  const graphApiName = 'shared_mtc-20microsoft-20graph-20mail-5fad2197ce913463-bbf4bc2ad08b7a26';
  const dataverseApiName = 'shared_commondataserviceforapps';
  const after = name => ({ [name]: ['Succeeded'] });
  const mailboxId = "@items('For_each_enrolled_mailbox')?['mtc_mailboxenrollmentid']";

  function api(apiName, operationId, parameters, runAfter) {
    return {
      ...(runAfter ? { runAfter } : {}),
      type: 'OpenApiConnection',
      inputs: {
        parameters,
        host: { apiId: `/providers/Microsoft.PowerApps/apis/${apiName}`, operationId, connectionName: apiName },
        retryPolicy: { type: 'exponential', count: 4, interval: 'PT10S', minimumInterval: 'PT5S', maximumInterval: 'PT2M' }
      }
    };
  }

  function action(name, parameters, runAfter) {
    return api(dataverseApiName, 'PerformUnboundAction', {
      actionName: name,
      ...Object.fromEntries(Object.entries(parameters).map(([key, value]) => [`item/${key}`, value]))
    }, runAfter);
  }

  function variable(name, value, runAfter) {
    return { ...(runAfter ? { runAfter } : {}), type: 'SetVariable', inputs: { name, value } };
  }

  function buildClientData() {
    const scan = {
      Reset_poll_lease: variable('PollLease', '00000000-0000-0000-0000-000000000000'),
      Reset_page_failure: variable('PageFailed', false, after('Reset_poll_lease')),
      Begin_mailbox_poll: action('mtc_BeginMailboxPoll', { MailboxRecordId: mailboxId }, after('Reset_page_failure')),
      Require_enabled_shadow_mailbox: {
        runAfter: after('Begin_mailbox_poll'), type: 'If',
        expression: { equals: ["@body('Begin_mailbox_poll')?['Enabled']", true] },
        actions: {
          Set_poll_lease: variable('PollLease', "@body('Begin_mailbox_poll')?['LeaseId']"),
          Set_initial_page_url: variable('NextPageUrl', "@body('Begin_mailbox_poll')?['NextPageUrl']", after('Set_poll_lease')),
          Process_all_message_pages: {
            runAfter: after('Set_initial_page_url'),
            type: 'Until',
            expression: "@or(equals(variables('NextPageUrl'), ''), equals(variables('PageFailed'), true))",
            limit: { count: 1000, timeout: 'PT6H' },
            actions: {
              Process_one_page: { type: 'Scope', actions: {
              List_metadata_page: api(graphApiName, 'ListMailboxMessages', {
                mailbox: "@body('Begin_mailbox_poll')?['MailboxReference']",
                '$filter': "@concat('receivedDateTime ge ', formatDateTime(body('Begin_mailbox_poll')?['ScanFrom'], 'yyyy-MM-ddTHH:mm:ssZ'), ' and receivedDateTime lt ', formatDateTime(body('Begin_mailbox_poll')?['ScanUntil'], 'yyyy-MM-ddTHH:mm:ssZ'))",
                '$select': 'id,parentFolderId,receivedDateTime,from,sender,replyTo,categories,internetMessageHeaders',
                '$top': 50,
                Prefer: 'IdType="ImmutableId"',
                'x-mtc-page-url': "@variables('NextPageUrl')"
              }),
              Assess_shadow_batch: action('mtc_ProcessMessageBatch', {
                MailboxRecordId: mailboxId,
                LeaseId: "@variables('PollLease')",
                MessagesJson: "@string(body('List_metadata_page')?['value'])",
                ImmutableIdsApplied: "@contains(toLower(replace(coalesce(outputs('List_metadata_page')?['headers']?['preference-applied'], outputs('List_metadata_page')?['headers']?['Preference-Applied'], ''), '\"', '')), 'idtype=immutableid')"
              }, after('List_metadata_page')),
              Set_next_graph_page: variable('NextPageUrl', "@coalesce(body('List_metadata_page')?['@odata.nextLink'], '')", after('Assess_shadow_batch')),
              Complete_successful_page: action('mtc_CompleteMailboxPage', {
                MailboxRecordId: mailboxId,
                LeaseId: "@variables('PollLease')",
                NextPageUrl: "@variables('NextPageUrl')"
              }, after('Set_next_graph_page'))
              } },
              Stop_on_page_failure: variable('PageFailed', true, { Process_one_page: ['Failed', 'TimedOut'] })
            }
          },
          Require_successful_page_loop: {
            runAfter: after('Process_all_message_pages'), type: 'If',
            expression: { equals: ["@variables('PageFailed')", true] },
            actions: {
              Mark_page_failure: variable('AnyMailboxFailed', true),
              Notify_page_failure: action('mtc_ReportMailboxFailure', {
                MailboxRecordId: mailboxId, LeaseId: "@variables('PollLease')",
                Reason: 'A Graph page or metadata assessment failed. The unfinished cursor was preserved; inspect the run before retrying.'
              }, after('Mark_page_failure'))
            },
            else: { actions: {} }
          }
        },
        else: { actions: {} }
      }
    };
    return {
      properties: {
        connectionReferences: {
          [graphApiName]: {
            runtimeSource: 'embedded', connection: { connectionReferenceLogicalName: 'mtc_MTCGraphMail' },
            api: { name: graphApiName }
          },
          [dataverseApiName]: {
            runtimeSource: 'embedded', connection: { connectionReferenceLogicalName: 'mtc_MTCMicrosoftDataverse' },
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
              type: 'Recurrence', recurrence: { frequency: 'Minute', interval: 3 },
              runtimeConfiguration: { concurrency: { runs: 1 } }
            }
          },
          actions: {
            Initialize_runtime_variables: {
              type: 'InitializeVariable',
              inputs: { variables: [
                { name: 'NextPageUrl', type: 'string', value: '' },
                { name: 'PageFailed', type: 'boolean', value: false },
                { name: 'PollLease', type: 'string', value: '00000000-0000-0000-0000-000000000000' },
                { name: 'AnyMailboxFailed', type: 'boolean', value: false }
              ] }
            },
            List_enrolled_mailboxes: api(dataverseApiName, 'ListRecords', {
              entityName: 'mtc_mailboxenrollments', '$select': 'mtc_mailboxenrollmentid',
              '$filter': 'mtc_enrollmentstatus eq 100000001 and statecode eq 0', '$top': 500
            }, after('Initialize_runtime_variables')),
            For_each_enrolled_mailbox: {
              runAfter: after('List_enrolled_mailboxes'), type: 'Foreach',
              foreach: "@body('List_enrolled_mailboxes')?['value']",
              runtimeConfiguration: { concurrency: { repetitions: 1 } },
              actions: {
                Process_mailbox: { type: 'Scope', actions: scan },
                Mark_any_mailbox_failed: variable('AnyMailboxFailed', true, { Process_mailbox: ['Failed', 'TimedOut'] }),
                Notify_mailbox_failure: action('mtc_ReportMailboxFailure', {
                  MailboxRecordId: mailboxId, LeaseId: "@variables('PollLease')",
                  Reason: 'Shadow processing failed. Inspect the Power Automate run; the delivery checkpoint was not advanced.'
                }, after('Mark_any_mailbox_failed'))
              }
            },
            Require_all_mailboxes_succeeded: {
              runAfter: after('For_each_enrolled_mailbox'), type: 'If',
              expression: { equals: ["@variables('AnyMailboxFailed')", true] },
              actions: {
                Fail_run_with_operator_notifications: {
                  type: 'Terminate',
                  inputs: { runStatus: 'Failed', runError: {
                    code: 'MTC_MAILBOX_PROCESSING_FAILED',
                    message: 'One or more mailboxes failed. In-app notifications and mailbox health identify the affected scope.'
                  } }
                }
              },
              else: { actions: {} }
            }
          },
          outputs: {}
        },
        templateName: ''
      },
      schemaVersion: '1.0.0.0'
    };
  }

  const exported = { buildClientData, graphApiName };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else root.MtcMailboxFlow = exported;
})(globalThis);
