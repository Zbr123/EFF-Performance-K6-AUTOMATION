export const SUITES = {
  signup: {
    name: 'signup',
    description: 'Create new verified accounts and append them to data/users.json',
    scenarios: ['signup'],
    requirePool: false,
    uniqueUsers: false,
    writePool: true,
    removeFromPool: false,
    executor: 'shared-iterations',
  },
  login: {
    name: 'login',
    description: 'Login only, using emails already saved in data/users.json',
    scenarios: ['login'],
    requirePool: true,
    uniqueUsers: true,
    writePool: false,
    removeFromPool: false,
    executor: 'shared-iterations',
  },
  'delete-accounts': {
    name: 'delete-accounts',
    description: 'Login a pool user, then delete it. Deleted users are removed from data/users.json',
    scenarios: ['login', 'deleteAccounts'],
    requirePool: true,
    uniqueUsers: true,
    writePool: true,
    removeFromPool: true,
    executor: 'shared-iterations',
  },
  'full-lifecycle': {
    name: 'full-lifecycle',
    description: 'Create a brand-new account and delete it in the same iteration. Pool untouched',
    scenarios: ['signup', 'deleteAccounts'],
    requirePool: false,
    uniqueUsers: false,
    writePool: false,
    removeFromPool: false,
    executor: 'shared-iterations',
  },
};

export function getSuite(name) {
  const suite = SUITES[name];
  if (!suite) {
    const known = Object.keys(SUITES).join(', ');
    throw new Error(`Unknown SUITE="${name}". Known suites: ${known}`);
  }
  return suite;
}
