'use strict';

(function () {
  const api = `${location.origin}/api/data/v9.2/`;
  const state = { senders: [], mailboxes: [], revoke: null, mode: null };
  const element = id => document.getElementById(id);
  const dateText = value => value ? new Date(value).toLocaleString() : 'Not yet';

  function status(text, error = false) {
    element('message').textContent = text;
    element('message').classList.toggle('error', error);
  }

  async function request(path, method = 'GET', body) {
    const url = new URL(path, api);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/data/v9.2/'))
      throw new Error('Refusing an unexpected registry API destination.');
    const response = await fetch(url, {
      method, credentials: 'same-origin', redirect: 'error',
      headers: {
        Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8',
        'OData-Version': '4.0', 'OData-MaxVersion': '4.0'
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (!response.ok) {
      const text = await response.text();
      let detail;
      try { detail = JSON.parse(text).error?.message; }
      catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        detail = `Unexpected server response (${response.status}).`;
      }
      throw new Error(detail || `Registry request failed (${response.status}).`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async function collection(path) {
    const rows = [];
    const visited = new Set();
    while (path) {
      if (visited.has(path)) throw new Error('Registry paging repeated a page. Refresh or contact your operator.');
      visited.add(path);
      const page = await request(path);
      if (!Array.isArray(page.value)) throw new Error('Registry returned an invalid collection.');
      rows.push(...page.value);
      path = page['@odata.nextLink'];
    }
    return rows;
  }

  function showPanel(name) {
    for (const panel of document.querySelectorAll('main > section')) panel.hidden = panel.id !== name;
    for (const button of document.querySelectorAll('nav button')) {
      if (button.dataset.panel === name) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  }

  function cell(row, text) {
    const td = document.createElement('td');
    td.textContent = text;
    row.append(td);
    return td;
  }

  function badge(td, text, style = '') {
    const span = document.createElement('span');
    span.className = `badge ${style}`;
    span.textContent = text;
    td.append(span);
  }

  function senderStatus(sender) {
    if (sender.mtc_verificationstatus === 100000003) return ['Revoked', 'revoked'];
    if (sender.mtc_verificationstatus !== 100000001) return ['Not approved', ''];
    if (!sender.mtc_expireson || Date.parse(sender.mtc_expireson) <= Date.now()) return ['Expired', 'expired'];
    return ['Approved', 'approved'];
  }

  function renderSenders() {
    const tbody = element('sender-rows');
    tbody.replaceChildren();
    const search = element('search').value.trim().toLowerCase();
    const rows = state.senders.filter(sender =>
      `${sender.target} ${sender.business}`.toLowerCase().includes(search));
    element('sender-empty').hidden = state.senders.length > 0;
    for (const sender of rows) {
      const row = document.createElement('tr');
      cell(row, sender.target);
      cell(row, sender.type === 'contact' ? 'Exact address' : 'Exact business domain');
      cell(row, sender.business);
      badge(cell(row, ''), ...senderStatus(sender));
      cell(row, dateText(sender.mtc_expireson));
      const actions = cell(row, '');
      const renew = document.createElement('button');
      renew.type = 'button';
      renew.textContent = 'Renew';
      renew.addEventListener('click', () => {
        element('target-type').value = sender.type;
        updateScope();
        element('target-value').value = sender.target;
        element('business-name').value = sender.business;
        element('verification-method').value = '';
        element('evidence-reference').value = '';
        element('ownership-confirmed').checked = false;
        showPanel('verify');
        element('verification-method').focus();
      });
      actions.append(renew);
      if (sender.mtc_verificationstatus === 100000001) {
        const revoke = document.createElement('button');
        revoke.type = 'button';
        revoke.textContent = 'Revoke';
        revoke.addEventListener('click', () => {
          state.revoke = sender;
          element('revoke-target').textContent = sender.target;
          element('revoke-reason').value = '';
          element('revoke-dialog').showModal();
        });
        actions.append(revoke);
      }
      tbody.append(row);
    }
  }

  function renderMailboxes() {
    const tbody = element('mailbox-rows');
    tbody.replaceChildren();
    element('mailbox-empty').hidden = state.mailboxes.length > 0;
    for (const mailbox of state.mailboxes) {
      const row = document.createElement('tr');
      cell(row, mailbox.mtc_mailboxreference);
      cell(row, mailbox.mtc_mailboxtype === 100000001 ? 'Shared' : 'User');
      cell(row, mailbox.mtc_enrollmentstatus === 100000001 ? 'Enrolled' : 'Paused');
      cell(row, dateText(mailbox.mtc_lastsuccessfulpollon));
      const health = ['Not started', 'Healthy', 'Degraded', 'Failed'][mailbox.mtc_healthstate - 100000000] ?? 'Unknown';
      badge(cell(row, ''), health, health === 'Failed' ? 'failed' : '');
      const action = cell(row, '');
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.textContent = mailbox.mtc_enrollmentstatus === 100000001 ? 'Pause' : 'Enroll';
      toggle.addEventListener('click', async () => {
        toggle.disabled = true;
        try {
          await request('mtc_SetMailboxEnrollment', 'POST', {
            MailboxReference: mailbox.mtc_mailboxreference,
            MailboxType: mailbox.mtc_mailboxtype === 100000001 ? 'Shared' : 'User',
            Enrolled: mailbox.mtc_enrollmentstatus !== 100000001
          });
          await refresh();
          status('Mailbox enrollment updated. This does not change the processor mode or start the flow.');
        } catch (error) {
          status(`Mailbox enrollment failed: ${error.message}`, true);
          toggle.disabled = false;
        }
      });
      action.append(toggle);
      tbody.append(row);
    }
    element('processing-mode').textContent = state.mode;
    element('enrollment-count').textContent =
      `${state.mailboxes.filter(mailbox => mailbox.mtc_enrollmentstatus === 100000001).length} of ${state.mailboxes.length}`;
    const errors = element('health-errors');
    errors.replaceChildren();
    for (const mailbox of state.mailboxes.filter(item => item.mtc_lasterror)) {
      const p = document.createElement('p');
      p.className = 'notice';
      p.textContent = `${mailbox.mtc_mailboxreference}: ${mailbox.mtc_lasterror}`;
      errors.append(p);
    }
  }

  async function refresh() {
    element('refresh').disabled = true;
    try {
      const [contacts, domains, parties, mailboxes, modes] = await Promise.all([
        collection('mtc_approvedcontacts?$select=mtc_approvedcontactid,mtc_emailaddress,mtc_expireson,mtc_verificationstatus,_mtc_businessparty_value&$filter=statecode eq 0'),
        collection('mtc_approveddomains?$select=mtc_approveddomainid,mtc_domain,mtc_expireson,mtc_verificationstatus,_mtc_businessparty_value&$filter=statecode eq 0'),
        collection('mtc_businessparties?$select=mtc_businesspartyid,mtc_name&$filter=statecode eq 0'),
        collection('mtc_mailboxenrollments?$select=mtc_mailboxreference,mtc_mailboxtype,mtc_enrollmentstatus,mtc_lastsuccessfulpollon,mtc_healthstate,mtc_lasterror&$filter=statecode eq 0'),
        collection("environmentvariabledefinitions?$select=environmentvariabledefinitionid,defaultvalue&$filter=schemaname eq 'mtc_ProcessingMode'&$expand=environmentvariabledefinition_environmentvariablevalue($select=value,statecode)")
      ]);
      if (modes.length !== 1) throw new Error('Processing-mode configuration is missing or ambiguous.');
      const values = modes[0].environmentvariabledefinition_environmentvariablevalue.filter(value => value.statecode === 0);
      if (values.length > 1) throw new Error('Processing-mode configuration has multiple active values.');
      const mode = values.length ? values[0].value : modes[0].defaultvalue;
      if (!['Disabled', 'Shadow', 'Label'].includes(mode)) throw new Error('Processing-mode configuration is invalid.');
      const businesses = new Map(parties.map(party => [party.mtc_businesspartyid, party.mtc_name]));
      state.senders = [
        ...contacts.map(sender => ({
          ...sender, id: sender.mtc_approvedcontactid, target: sender.mtc_emailaddress, type: 'contact'
        })),
        ...domains.map(sender => ({
          ...sender, id: sender.mtc_approveddomainid, target: sender.mtc_domain, type: 'domain'
        }))
      ].map(sender => ({ ...sender, business: businesses.get(sender._mtc_businessparty_value) ?? 'Missing business record' }));
      state.mailboxes = mailboxes;
      state.mode = mode;
      renderSenders();
      renderMailboxes();
      await refreshAlerts();
      status(`Registry loaded. Configured processing mode: ${mode}.`);
    } finally {
      element('refresh').disabled = false;
    }
  }

  async function refreshAlerts() {
    const identity = await request('WhoAmI');
    if (!/^[0-9a-f-]{36}$/i.test(identity.UserId)) throw new Error('Current operator identity is unavailable.');
    const notices = await collection(
      `appnotifications?$select=appnotificationid,title,body,createdon&$filter=_ownerid_value eq ${identity.UserId} and title eq 'Sender Registry processing needs attention'&$orderby=createdon desc&$top=10`
    );
    const panel = element('operator-alert-list');
    panel.replaceChildren();
    element('operator-alerts').hidden = notices.length === 0;
    for (const notice of notices) {
      const paragraph = document.createElement('p');
      paragraph.textContent = `${dateText(notice.createdon)}: ${notice.body}`;
      panel.append(paragraph);
    }
  }

  function updateScope() {
    const domain = element('target-type').value === 'domain';
    element('target-label').textContent = domain ? 'Exact business domain' : 'Exact email address';
    element('target-value').placeholder = domain ? 'equipment.example' : 'person@equipment.example';
    element('scope-help').textContent = domain
      ? 'Covers addresses at this exact business domain only, not subdomains. Shared providers such as Gmail are not allowed.'
      : 'Other addresses at this provider will remain Not known.';
  }

  async function submitVerification(event) {
    event.preventDefault();
    const button = element('verify-submit');
    button.disabled = true;
    try {
      const data = new FormData(element('verification-form'));
      const body = Object.fromEntries(data);
      body.ExpiresOn = new Date(`${body.ExpiresOn}T23:59:59`).toISOString();
      await request('mtc_VerifySender', 'POST', body);
      element('verification-form').reset();
      setExpiry();
      updateScope();
      await refresh();
      showPanel('senders');
      status(`Sender verified. Configured processing mode: ${state.mode}. Registry approval is not confirmation that Outlook messages have been relabeled.`);
    } catch (error) {
      status(`Verification failed: ${error.message}`, true);
    } finally {
      button.disabled = false;
    }
  }

  async function submitRevocation(event) {
    event.preventDefault();
    const button = element('revoke-submit');
    button.disabled = true;
    try {
      if (!state.revoke) throw new Error('Select a sender to revoke.');
      await request('mtc_RevokeSender', 'POST', {
        TargetType: state.revoke.type, RecordId: state.revoke.id,
        Reason: element('revoke-reason').value.trim()
      });
      element('revoke-dialog').close();
      state.revoke = null;
      await refresh();
      status('Sender revoked in the registry. Existing Outlook labels still require successful reassessment.');
    } catch (error) {
      status(`Revocation failed: ${error.message}`, true);
    } finally {
      button.disabled = false;
    }
  }

  function setExpiry() {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 365);
    const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    element('expiry').value = localDate(expiry);
    element('expiry').min = localDate(new Date());
  }

  document.querySelectorAll('[data-panel]').forEach(button =>
    button.addEventListener('click', () => showPanel(button.dataset.panel)));
  element('refresh').addEventListener('click', () => refresh().catch(error => status(error.message, true)));
  element('search').addEventListener('input', renderSenders);
  element('target-type').addEventListener('change', updateScope);
  element('verification-form').addEventListener('submit', submitVerification);
  element('revocation-form').addEventListener('submit', submitRevocation);
  element('mailbox-form').addEventListener('submit', async event => {
    event.preventDefault();
    element('mailbox-submit').disabled = true;
    try {
      const data = Object.fromEntries(new FormData(element('mailbox-form')));
      await request('mtc_SetMailboxEnrollment', 'POST', { ...data, Enrolled: false });
      element('mailbox-form').reset();
      await refresh();
      status('Mailbox added in Paused state. An authorized operator must enroll it before processing.');
    } catch (error) {
      status(`Mailbox onboarding failed: ${error.message}`, true);
    } finally {
      element('mailbox-submit').disabled = false;
    }
  });
  element('revoke-cancel').addEventListener('click', () => element('revoke-dialog').close());
  setExpiry();
  refresh().catch(error => status(`Could not load the registry: ${error.message}`, true));
  setInterval(() => refreshAlerts().catch(error =>
    status(`Could not refresh operator notifications: ${error.message}`, true)), 60000);
})();
