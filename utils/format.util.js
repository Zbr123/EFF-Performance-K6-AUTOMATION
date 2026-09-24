import exec from 'k6/execution';

export function iterNum() {
  return (exec.scenario && exec.scenario.iterationInTest != null)
    ? exec.scenario.iterationInTest + 1
    : (__ITER + 1);
}

export function safeTag(value, maxLen) {
  if (value == null || value === '') return '';
  return String(value)
    .replace(/[^a-zA-Z0-9 _.\-:@+/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLen || 80);
}

export function checkText(value, maxLen) {
  if (value == null || value === '') return '';
  const limit = maxLen == null ? 4000 : maxLen;
  return String(value)
    .replace(/\|/g, '/')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, limit);
}

export function backendText(respObj) {
  if (!respObj) return '';
  if (respObj.errors && respObj.errors.length) {
    try {
      return JSON.stringify(respObj.errors);
    } catch (e) {
      return String(respObj.errors);
    }
  }
  if (respObj.gqlErr && respObj.gqlErr.message) return String(respObj.gqlErr.message);
  if (respObj.res && respObj.res.body != null && respObj.res.body !== '') {
    return String(respObj.res.body);
  }
  return '';
}
