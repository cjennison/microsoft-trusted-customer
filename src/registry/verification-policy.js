'use strict';

(function (root) {
  const version = 'verification-1';
  const allowedRoles = new Set(['registrar', 'reviewer', 'service']);
  const consumerDomains = new Set([
    'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
    'yahoo.com', 'icloud.com', 'aol.com', 'proton.me', 'protonmail.com'
  ]);
  const forbiddenCommandFields = new Set([
    'actorId', 'actualVerifierId', 'approvedBy', 'auditTrail', 'createdBy',
    'requestedBy', 'requestedOn', 'reviewedOn', 'reviewerId', 'status',
    'verifiedOn', 'version'
  ]);

  function canonicalId(value, label) {
    if (typeof value !== 'string' || !value.trim() || value.trim() !== value ||
        value.length > 200 || /[\u0000-\u001f\u007f]/u.test(value)) {
      throw new Error(`${label} must be a nonempty canonical identifier.`);
    }
    return value.toLowerCase();
  }

  function boundedText(value, label, maximum = 1000) {
    if (typeof value !== 'string' || !value.trim() || value.trim() !== value ||
        value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
      throw new Error(`${label} is required and must be canonical.`);
    }
    return value;
  }

  function timestamp(value, label) {
    if (typeof value !== 'string' || value.trim() !== value) {
      throw new Error(`${label} must be an ISO timestamp.`);
    }
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
      throw new Error(`${label} must be a canonical ISO timestamp.`);
    }
    return parsed;
  }

  function trustedTime(value) {
    if (!Number.isFinite(value)) throw new Error('Trusted server time is required.');
    return new Date(value).toISOString();
  }

  function domain(value) {
    if (typeof value !== 'string' || !value || value.trim() !== value ||
        /[\s/:@?#\\%]/u.test(value) || value.endsWith('.')) {
      throw new Error('Unsupported or malformed domain.');
    }
    const normalized = new URL(`https://${value}`).hostname;
    if (normalized.length > 253 || !normalized.includes('.') ||
        normalized.split('.').some(part => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part)) ||
        /^[\d.]+$/.test(normalized)) {
      throw new Error('Unsupported or malformed domain.');
    }
    return normalized;
  }

  function address(value) {
    if (typeof value !== 'string') throw new Error('Structured email address is required.');
    const parts = value.split('@');
    if (parts.length !== 2 || parts[0].length > 64 ||
        !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(parts[0])) {
      throw new Error('Unsupported or malformed email local part.');
    }
    return `${parts[0]}@${domain(parts[1])}`;
  }

  function validateAuthority(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        !['independent-review', 'single-registrar'].includes(value.mode) ||
        !Array.isArray(value.principals) || value.principals.length === 0) {
      throw new Error('Verification authority mode and principals are required.');
    }
    const principals = new Map();
    for (const principal of value.principals) {
      if (!principal || typeof principal !== 'object' || Array.isArray(principal) ||
          !Array.isArray(principal.roles) || principal.roles.length === 0) {
        throw new Error('Each verification principal requires explicit roles.');
      }
      const id = canonicalId(principal.id, 'Principal identifier');
      if (principals.has(id)) throw new Error('Verification principals must be unique.');
      const roles = new Set();
      for (const role of principal.roles) {
        if (!allowedRoles.has(role) || roles.has(role)) {
          throw new Error('Verification roles must be supported and unique.');
        }
        roles.add(role);
      }
      principals.set(id, roles);
    }
    return { mode: value.mode, principals };
  }

  function trustedContext(context, requiredRole) {
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
      throw new Error('Trusted caller context is required.');
    }
    const authority = validateAuthority(context.authority);
    const actorId = canonicalId(context.actorId, 'Actual caller identifier');
    const roles = authority.principals.get(actorId);
    if (!roles || (requiredRole && !roles.has(requiredRole))) {
      throw new Error(`Actual caller is not an authorized ${requiredRole}.`);
    }
    return {
      actorId,
      roles,
      authority,
      now: trustedTime(context.now)
    };
  }

  function validateCommand(command) {
    if (!command || typeof command !== 'object' || Array.isArray(command)) {
      throw new Error('A structured verification command is required.');
    }
    for (const field of forbiddenCommandFields) {
      if (Object.prototype.hasOwnProperty.call(command, field)) {
        throw new Error(`Command cannot supply server-stamped field ${field}.`);
      }
    }
    return {
      commandId: canonicalId(command.commandId, 'Command identifier'),
      reason: command.reason === undefined ? null : boundedText(command.reason, 'Reason')
    };
  }

  function target(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        !['contact', 'domain'].includes(value.type)) {
      throw new Error('Verification target must be an exact contact or business domain.');
    }
    if (value.type === 'contact') {
      return { type: 'contact', value: address(value.value) };
    }
    const normalized = domain(value.value);
    if (consumerDomains.has(normalized)) {
      throw new Error('Shared consumer-mail providers cannot be approved as business domains.');
    }
    return { type: 'domain', value: normalized };
  }

  function auditEvent(type, caseRecord, commandId, actorId, at, details = {}) {
    return Object.freeze({
      type,
      caseId: caseRecord.id,
      commandId,
      actorId,
      at,
      fromStatus: details.fromStatus ?? null,
      toStatus: details.toStatus,
      reason: details.reason ?? null
    });
  }

  function copyCase(caseRecord) {
    return structuredClone(caseRecord);
  }

  function validateCase(caseRecord) {
    if (!caseRecord || typeof caseRecord !== 'object' || Array.isArray(caseRecord) ||
        caseRecord.policyVersion !== version || !Number.isInteger(caseRecord.version) ||
        caseRecord.version < 1 || !['pending', 'approved', 'rejected', 'revoked'].includes(caseRecord.status) ||
        !Array.isArray(caseRecord.auditTrail)) {
      throw new Error('A valid versioned verification case is required.');
    }
    canonicalId(caseRecord.id, 'Case identifier');
    canonicalId(caseRecord.requestedBy, 'Requester identifier');
    target(caseRecord.target);
    timestamp(caseRecord.requestedOn, 'Requested timestamp');
    timestamp(caseRecord.expiresOn, 'Expiry timestamp');
    boundedText(caseRecord.evidenceReference, 'Evidence reference');
    boundedText(caseRecord.verificationMethod, 'Verification method', 200);
    return caseRecord;
  }

  function retryResult(caseRecord, commandId, eventType) {
    const match = caseRecord.auditTrail.find(event => event.commandId === commandId);
    if (!match) return null;
    if (match.type !== eventType) {
      throw new Error('Command identifier was already used for another transition.');
    }
    return {
      caseRecord: copyCase(caseRecord),
      auditEvent: structuredClone(match),
      registryRecord: projectRegistryRecord(caseRecord),
      idempotentReplay: true
    };
  }

  function projectRegistryRecord(caseRecord) {
    if (!caseRecord || !['approved', 'revoked'].includes(caseRecord.status)) return null;
    return {
      targetType: caseRecord.target.type,
      targetValue: caseRecord.target.value,
      partyId: caseRecord.partyId,
      verificationStatus: caseRecord.status,
      independentVerification: true,
      verificationMethod: caseRecord.verificationMethod,
      evidenceReference: caseRecord.evidenceReference,
      verifiedOn: caseRecord.verifiedOn,
      expiresOn: caseRecord.expiresOn,
      requesterId: caseRecord.requestedBy,
      reviewerId: caseRecord.approvedBy,
      revokedOn: caseRecord.revokedOn ?? null,
      revokedBy: caseRecord.revokedBy ?? null
    };
  }

  function submit(command, context) {
    const trusted = trustedContext(context, 'registrar');
    const input = validateCommand(command);
    const caseId = canonicalId(context.caseId, 'Server-generated case identifier');
    const partyId = canonicalId(command.partyId, 'Business party identifier');
    const normalizedTarget = target(command.target);
    const evidenceReference = boundedText(command.evidenceReference, 'Evidence reference');
    const verificationMethod = boundedText(command.verificationMethod, 'Verification method', 200);
    const expires = timestamp(command.expiresOn, 'Expiry timestamp');
    const requested = Date.parse(trusted.now);
    if (expires <= requested) throw new Error('Verification expiry must be after submission.');
    const caseRecord = {
      policyVersion: version,
      version: 1,
      id: caseId,
      status: 'pending',
      partyId,
      target: normalizedTarget,
      evidenceReference,
      verificationMethod,
      expiresOn: new Date(expires).toISOString(),
      requestedBy: trusted.actorId,
      requestedOn: trusted.now,
      approvedBy: null,
      verifiedOn: null,
      rejectedBy: null,
      rejectedOn: null,
      revokedBy: null,
      revokedOn: null,
      auditTrail: []
    };
    const event = auditEvent('verification-submitted', caseRecord, input.commandId,
      trusted.actorId, trusted.now, { toStatus: 'pending' });
    caseRecord.auditTrail.push(event);
    return {
      caseRecord,
      auditEvent: event,
      registryRecord: null,
      idempotentReplay: false
    };
  }

  function decide(caseRecord, command, context, decision) {
    validateCase(caseRecord);
    const trusted = trustedContext(context,
      trustedContextRole(context.authority?.mode, decision));
    const input = validateCommand(command);
    const eventType = `verification-${decision}`;
    const replay = retryResult(caseRecord, input.commandId, eventType);
    if (replay) return replay;
    if (caseRecord.status !== 'pending') {
      throw new Error(`Only pending cases can be ${decision}.`);
    }
    if (decision === 'approved' && trusted.authority.mode === 'independent-review' &&
        trusted.actorId === caseRecord.requestedBy) {
      throw new Error('Independent-review mode requires a distinct reviewer.');
    }
    if (decision === 'rejected') boundedText(command.reason, 'Rejection reason');
    const verifiedTime = Date.parse(trusted.now);
    if (decision === 'approved' && Date.parse(caseRecord.expiresOn) <= verifiedTime) {
      throw new Error('Expired verification evidence cannot be approved.');
    }
    const next = copyCase(caseRecord);
    next.version++;
    next.status = decision;
    if (decision === 'approved') {
      next.approvedBy = trusted.actorId;
      next.verifiedOn = trusted.now;
    } else {
      next.rejectedBy = trusted.actorId;
      next.rejectedOn = trusted.now;
    }
    const event = auditEvent(eventType, next, input.commandId, trusted.actorId, trusted.now, {
      fromStatus: 'pending',
      toStatus: decision,
      reason: input.reason
    });
    next.auditTrail.push(event);
    return {
      caseRecord: next,
      auditEvent: event,
      registryRecord: projectRegistryRecord(next),
      idempotentReplay: false
    };
  }

  function trustedContextRole(mode, decision) {
    if (mode === 'single-registrar' &&
        ['approved', 'rejected'].includes(decision)) return 'registrar';
    return 'reviewer';
  }

  function approve(caseRecord, command, context) {
    return decide(caseRecord, command, context, 'approved');
  }

  function reject(caseRecord, command, context) {
    return decide(caseRecord, command, context, 'rejected');
  }

  function revoke(caseRecord, command, context) {
    validateCase(caseRecord);
    const trusted = trustedContext(context, 'registrar');
    const input = validateCommand(command);
    const replay = retryResult(caseRecord, input.commandId, 'verification-revoked');
    if (replay) return replay;
    if (caseRecord.status !== 'approved') throw new Error('Only approved cases can be revoked.');
    const reason = boundedText(command.reason, 'Revocation reason');
    const next = copyCase(caseRecord);
    next.version++;
    next.status = 'revoked';
    next.revokedBy = trusted.actorId;
    next.revokedOn = trusted.now;
    const event = auditEvent('verification-revoked', next, input.commandId, trusted.actorId, trusted.now, {
      fromStatus: 'approved',
      toStatus: 'revoked',
      reason
    });
    next.auditTrail.push(event);
    return {
      caseRecord: next,
      auditEvent: event,
      registryRecord: projectRegistryRecord(next),
      idempotentReplay: false
    };
  }

  const api = {
    version,
    submit,
    approve,
    reject,
    revoke,
    projectRegistryRecord
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MtcVerificationPolicy = api;
})(globalThis);
