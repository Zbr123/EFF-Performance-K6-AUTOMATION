const CATEGORY_LABELS = {
  ok: 'OK',
  validation: 'Backend validation',
  server_error: 'Server error (5xx)',
  lambda_fail: 'Lambda fail / timeout',
  network_error: 'Network error',
  skipped: 'Skipped (earlier step failed)',
  unknown: 'Unknown',
};

export function categoryLabel(category) {
  return CATEGORY_LABELS[category] || category;
}

export function classifyFailure(respObj) {
  if (!respObj) {
    return { category: 'unknown', code: 'NO_RESPONSE', message: 'no response object', httpStatus: 'n/a' };
  }

  const status = (respObj.res && respObj.res.status != null) ? respObj.res.status : 'n/a';
  const gqlErr = respObj.gqlErr || null;
  const code = (gqlErr && gqlErr.errorCode) || (status !== 200 && status !== 'n/a' ? `HTTP_${status}` : 'UNKNOWN');
  const message = (gqlErr && gqlErr.message) || '';
  const combined = `${code} ${message}`;

  if (/LAMBDA_TIMEOUT|LAMBDA_|Task timed out|Lambda\.|execution timed out|lambda fail/i.test(combined)) {
    return { category: 'lambda_fail', code: code || 'LAMBDA_FAIL', message: message || 'Lambda failure / timeout', httpStatus: status };
  }

  if (respObj.is5xx || (typeof status === 'number' && status >= 500) ||
      /internal server error|internal_server_error/i.test(message)) {
    return { category: 'server_error', code: code || `HTTP_${status}`, message: message || 'Server / 5xx error', httpStatus: status };
  }

  if (status === 0) {
    return { category: 'network_error', code: 'NETWORK', message: message || 'Network / connection failure', httpStatus: status };
  }

  if (code === 'INVALID_JSON') {
    return { category: 'server_error', code: 'INVALID_JSON', message: message || 'Invalid JSON response', httpStatus: status };
  }

  return {
    category: 'validation',
    code: code || 'VALIDATION',
    message: message || 'Backend validation / business rule failed',
    httpStatus: (gqlErr && gqlErr.statusCode) || status,
  };
}

export function explainErrorCause(errorCode, message) {
  const code = String(errorCode || '');
  const msg = String(message || '');
  if (code === 'EMAIL_ALREADY_EXISTS') return 'Email is already registered (verified account). Use a new plus-address or the login suite.';
  if (code === 'USERNAME_TAKEN') return 'Username collided. Signup retries with a unique fw_ prefix.';
  if (code === 'EMAIL_NOT_VERIFIED') return 'Login ran before verifyEmail succeeded. Check TEST_BYPASS on test env.';
  if (code === 'INVALID_CREDENTIALS') return 'Email/password mismatch, or user is not in the pool with the expected password.';
  if (code === 'PASSWORD_ALREADY_SET') return 'setPassword was retried after a timeout; the first call likely succeeded.';
  if (code === 'USER_ALREADY_VERIFIED') return 'verifyEmail was retried after success.';
  if (code === 'ACTIVATION_ALREADY_SENT') return 'Signup resend window; wait before signing up the same email again.';
  if (code === 'LAMBDA_TIMEOUT' || /Task timed out/i.test(msg)) return 'Lambda timed out under load. The write may still have completed.';
  if (code === 'INTERNAL_ERROR') return 'Unhandled backend/Lambda exception.';
  if (code === 'INVALID_JSON') return 'Response was not JSON (gateway/Lambda crash).';
  if (code === 'NETWORK') return 'HTTP call did not complete.';
  if (code && code !== 'OK' && code !== 'n/a') return `Backend returned ${code}. See message.`;
  return 'See error message for details.';
}
