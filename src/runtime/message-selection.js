'use strict';

(function (root) {
  const proofPolicy = typeof require === 'function'
    ? require('../qualification/proof-policy.js')
    : root.MtcProofPolicy;
  const version = 'message-selection-1';

  function canonical(value, label, maximum = 1000) {
    if (typeof value !== 'string' || !value.trim() || value.trim() !== value ||
        value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) {
      throw new Error(`${label} must be a nonempty canonical string.`);
    }
    return value;
  }

  function validateSelection(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        value.idType !== 'immutable' || value.subjectPrefix !== '[MTC-PROOF]') {
      throw new Error('Selection requires an immutable Graph ID and exact proof scope.');
    }
    return {
      mailboxId: canonical(value.mailboxId, 'Mailbox identifier'),
      folderId: canonical(value.folderId, 'Folder identifier'),
      immutableMessageId: canonical(value.immutableMessageId, 'Immutable message identifier'),
      subjectPrefix: value.subjectPrefix
    };
  }

  function validateMessage(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message) ||
        message.idType !== 'immutable' || !Array.isArray(message.categories) ||
        message.categories.some(category => typeof category !== 'string') ||
        typeof message.subject !== 'string') {
      throw new Error('Structured immutable message metadata is required.');
    }
    return {
      id: canonical(message.id, 'Message identifier'),
      idType: message.idType,
      mailboxId: canonical(message.mailboxId, 'Message mailbox identifier'),
      folderId: canonical(message.folderId, 'Message folder identifier'),
      subject: message.subject,
      internetMessageId: message.internetMessageId === undefined
        ? null : canonical(message.internetMessageId, 'Internet Message ID'),
      categories: [...message.categories],
      etag: canonical(message.etag, 'Message ETag'),
      receivedOn: message.receivedOn === undefined ? null : canonical(message.receivedOn, 'Received timestamp')
    };
  }

  function selectScopedMessage(messages, selection) {
    if (!Array.isArray(messages)) throw new Error('Message metadata collection is required.');
    const scope = validateSelection(selection);
    const normalized = messages.map(validateMessage);
    const exact = normalized.filter(message =>
      message.id === scope.immutableMessageId &&
      message.mailboxId === scope.mailboxId &&
      message.folderId === scope.folderId &&
      (message.subject === scope.subjectPrefix ||
        message.subject.startsWith(`${scope.subjectPrefix} `)));
    if (exact.length !== 1) {
      throw new Error('Exactly one immutable message must match the approved scope.');
    }
    return structuredClone(exact[0]);
  }

  function planCategoryPatch(messages, selection, assessment) {
    if (!proofPolicy || typeof proofPolicy.nextCategories !== 'function') {
      throw new Error('Qualification policy is required.');
    }
    const message = selectScopedMessage(messages, selection);
    const categories = proofPolicy.nextCategories(message.categories, assessment);
    const unchanged = categories.length === message.categories.length &&
      categories.every((category, index) => category === message.categories[index]);
    return {
      planVersion: version,
      messageId: message.id,
      mailboxId: message.mailboxId,
      folderId: message.folderId,
      internetMessageId: message.internetMessageId,
      method: 'PATCH',
      relativeUri: `/me/messages/${encodeURIComponent(message.id)}`,
      headers: {
        'If-Match': message.etag,
        Prefer: 'IdType="ImmutableId"'
      },
      body: { categories },
      requiresWrite: !unchanged
    };
  }

  const api = { version, selectScopedMessage, planCategoryPatch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MtcMessageSelection = api;
})(globalThis);
