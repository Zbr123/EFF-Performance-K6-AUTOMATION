function metricLine(name, metric) {
  if (!metric || !metric.values) return '';
  const v = metric.values;
  const parts = [];
  if (v.rate != null) parts.push(`rate=${(v.rate * 100).toFixed(2)}%`);
  if (v.count != null) parts.push(`count=${v.count}`);
  if (v.avg != null) parts.push(`avg=${Number(v.avg).toFixed(2)}`);
  if (v.min != null) parts.push(`min=${Number(v.min).toFixed(2)}`);
  if (v.max != null) parts.push(`max=${Number(v.max).toFixed(2)}`);
  if (v['p(95)'] != null) parts.push(`p95=${Number(v['p(95)']).toFixed(2)}`);
  return `  ${name}: ${parts.join('  ')}`;
}

export function textSummary(data) {
  const metrics = (data && data.metrics) || {};
  const names = [
    'checks',
    'http_req_failed',
    'http_req_duration',
    'http_reqs',
    'iterations',
    'vus',
    'server_errors_5xx',
    'users_completed',
    'users_all_passed',
    'users_partial_fail',
  ];
  const lines = ['', '  █ EFF k6 summary', ''];
  names.forEach((name) => {
    const line = metricLine(name, metrics[name]);
    if (line) lines.push(line);
  });
  lines.push('');
  return lines.join('\n');
}
