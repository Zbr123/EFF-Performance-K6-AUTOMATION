import exec from 'k6/execution';

export function iterNum() {
  return (exec.scenario && exec.scenario.iterationInTest != null)
    ? exec.scenario.iterationInTest + 1
    : (__ITER + 1);
}

export function safeTag(value, maxLen) {
  return String(value || 'unknown')
    .replace(/[^a-zA-Z0-9 _.\-:@+/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLen || 80);
}
