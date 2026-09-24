import http from 'k6/http';
import { check } from 'k6';
import { GRAPHQL_URL, headers } from '../config/env.config.js';
import { apiErrors, errorAtIteration, errorAtVu, serverErrors5xx } from './metrics.registry.js';
import { iterNum, safeTag, checkText } from '../utils/format.util.js';

function recordBackendError(stepName, httpStatus, errorCode, message, is5xx) {
  const tags = {
    endpoint: safeTag(stepName, 40),
    http_status: String(httpStatus || 'n/a'),
    error_code: safeTag(errorCode || 'UNKNOWN', 40),
    message: safeTag(message || '', 100),
  };

  const n = iterNum();
  if (is5xx) serverErrors5xx.add(1, tags);
  apiErrors.add(1, tags);
  errorAtIteration.add(n, { endpoint: tags.endpoint, kind: is5xx ? '5xx' : 'api' });
  errorAtVu.add(__VU, { endpoint: tags.endpoint, kind: is5xx ? '5xx' : 'api' });

  const kind = is5xx ? '5xx' : 'API';
  const detailCheck =
    `[${kind}] ${stepName} | status=${httpStatus} | code=${errorCode || 'UNKNOWN'} | VU=${__VU} | iter=${n} | ${checkText(message || '')}`;
  check(null, { [detailCheck]: () => false });

  console.error(
    `[BACKEND_ERROR] endpoint=${stepName} http=${httpStatus} code=${errorCode} ` +
    `vu=${__VU} iteration=${n} msg=${message}`
  );
}

export function extractGraphqlError(errors) {
  if (!errors || !errors.length) return null;
  const e = errors[0];
  const info = e.errorInfo || {};
  return {
    statusCode: info.statusCode || e.statusCode || null,
    errorCode: info.errorCode || e.errorType || 'GRAPHQL_ERROR',
    message: e.message || JSON.stringify(e),
  };
}

export function gql(query, variables, token, stepName, ctx, options) {
  const expectedCodes = (options && options.expectedErrorCodes) || [];
  const payload = JSON.stringify({ query, variables: variables || {} });
  const res = http.post(GRAPHQL_URL, payload, {
    headers: headers(token),
    tags: { step: stepName },
  });

  let body = {};
  let rawErrors = null;
  try {
    body = res.json();
    rawErrors = body.errors || null;
  } catch (e) {
    const msg = `JSON parse failed. Body: ${String(res.body || '')}`;
    recordBackendError(stepName, res.status, 'INVALID_JSON', msg, res.status >= 500);
    console.error(`[${ctx}] [${stepName}] ${msg}`);
    return {
      res,
      body: {},
      errors: [{ message: 'invalid json' }],
      is5xx: res.status >= 500,
      gqlErr: { statusCode: res.status, errorCode: 'INVALID_JSON', message: msg },
    };
  }

  const gqlErr = extractGraphqlError(rawErrors);
  const gqlStatus = gqlErr && gqlErr.statusCode ? Number(gqlErr.statusCode) : null;
  const httpIs5xx = res.status >= 500;
  const gqlIs5xx = gqlStatus !== null && gqlStatus >= 500;
  const msgLooks5xx = !!(gqlErr && /internal server error|internal_server_error/i.test(gqlErr.message || ''));
  const is5xx = httpIs5xx || gqlIs5xx || msgLooks5xx;
  const expected = !!(gqlErr && expectedCodes.indexOf(gqlErr.errorCode) >= 0 && !is5xx && res.status === 200);

  const errPayload = rawErrors && rawErrors.length
    ? JSON.stringify(rawErrors)
    : (gqlErr ? gqlErr.message : String(res.body || ''));

  if (!expected) {
    if (httpIs5xx || res.status !== 200) {
      recordBackendError(
        stepName,
        res.status,
        gqlErr ? gqlErr.errorCode : `HTTP_${res.status}`,
        errPayload,
        httpIs5xx || is5xx
      );
    } else if (gqlErr) {
      recordBackendError(stepName, gqlStatus || res.status, gqlErr.errorCode, errPayload, is5xx);
    }

    if (rawErrors && rawErrors.length) {
      console.error(`[${ctx}] [${stepName}] GraphQL errors: ${JSON.stringify(rawErrors)}`);
    }
    if (res.status !== 200) {
      console.error(`[${ctx}] [${stepName}] HTTP ${res.status}. Body: ${res.body}`);
    }
  }

  return { res, body: body.data || {}, errors: rawErrors, is5xx, gqlErr };
}

export function isSuccessCode(data) {
  if (!data) return false;
  return data.statusCode === 200 || data.statusCode === '200';
}

export function httpOk(resp) {
  return !!(resp && resp.res && resp.res.status === 200 && !resp.is5xx);
}
