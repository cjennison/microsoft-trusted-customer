'use strict';

(function (root) {
  const solutionName = 'MicrosoftTrustedCustomer';
  const workflowId = '81b229c4-d759-49a7-93da-816056e8841c';
  const workflowName = 'MTC Processor - scheduled shadow assessment';
  const graphApiName = 'shared_mtc-20microsoft-20graph-20mail-5fad2197ce913463-bbf4bc2ad08b7a26';

  function buildClientData() {
    const flow = typeof module !== 'undefined' && module.exports ? require('./mailbox-flow.js') : root.MtcMailboxFlow;
    if (!flow) throw new Error('The reviewed mailbox-flow definition must be loaded.');
    return flow.buildClientData();
  }

  function validateTarget(target, currentOrigin) {
    const provisioning = typeof module !== 'undefined' && module.exports
      ? require('../provisioning/dataverse.js') : root.MtcProvisioning;
    provisioning.validateTarget(target, currentOrigin);
  }

  async function publishShadowFlow(target, context = {}) {
    validateTarget(target, context.origin ?? root.location?.origin);
    const fetcher = context.fetch ?? root.fetch.bind(root);
    async function request(path, method = 'GET', body) {
      const response = await fetcher(`${target.environmentOrigin}/api/data/v9.2/${path}`, {
        method, credentials: 'same-origin', redirect: 'error',
        headers: {
          Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8',
          'OData-Version': '4.0', 'OData-MaxVersion': '4.0',
          ...(['POST', 'PATCH'].includes(method) ? { 'MSCRM.SolutionUniqueName': solutionName } : {})
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      if (!response.ok)
        throw new Error(`Shadow flow ${method} ${path} failed (${response.status}): ${(await response.text()).slice(0, 1600)}`);
      if (response.status === 204) return null;
      return response.json();
    }
    const identity = await request('WhoAmI');
    if (identity.OrganizationId.toLowerCase() !== target.organizationId.toLowerCase())
      throw new Error('Shadow flow organization mismatch; no writes performed.');
    const existing = await request(`workflows(${workflowId})?$select=workflowid,name,statecode,statuscode,category,type,clientdata`);
    if (existing.name !== workflowName || existing.statecode !== 0 || existing.statuscode !== 1 ||
        existing.category !== 5 || existing.type !== 1)
      throw new Error('The existing shadow definition must have the expected identity and remain Off.');
    const clientdata = JSON.stringify(buildClientData());
    if (existing.clientdata !== clientdata)
      await request(`workflows(${workflowId})`, 'PATCH', { clientdata });
    await request('AddSolutionComponent', 'POST', {
      ComponentId: workflowId, ComponentType: 29, SolutionUniqueName: solutionName, AddRequiredComponents: false
    });
    return { workflowId, name: workflowName, state: 'Off', updated: existing.clientdata !== clientdata };
  }

  const api = { solutionName, workflowId, workflowName, graphApiName, buildClientData, validateTarget, publishShadowFlow };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MtcShadowFlow = api;
})(globalThis);
