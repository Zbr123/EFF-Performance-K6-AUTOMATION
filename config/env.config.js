function required(name) {
  const val = __ENV[name];
  if (!val) {
    throw new Error(
      `Missing required env variable: ${name}. ` +
      `Set it in .env and run via npm scripts (e.g. npm run login), or pass -e ${name}=...`
    );
  }
  return val;
}

export const GRAPHQL_URL = required('GRAPHQL_URL');
export const API_KEY = required('API_KEY');
export const PASSWORD = required('PASSWORD');

export const EMAIL_PREFIX = __ENV.EMAIL_PREFIX || 'szubair.alam';
export const EMAIL_DOMAIN = __ENV.EMAIL_DOMAIN || 'toptal.com';

export const SUITE = (__ENV.SUITE || 'login').trim();
export const VUS = parseInt(__ENV.VUS || '1', 10);
export const TOTAL_ITERATIONS = parseInt(__ENV.ITERATIONS || '1', 10);
export const REPORT_DIR = __ENV.REPORT_DIR || 'reports';

export function headers(token) {
  const h = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-api-key': API_KEY,
  };
  if (token) h.Authorization = token;
  return h;
}
