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
  'blitz-create-league': {
    name: 'blitz-create-league',
    description: 'Login a pool user, check league name, create a private Blitz league, save League_ID on the pool user',
    scenarios: ['login', 'createBlitzLeague'],
    requirePool: true,
    uniqueUsers: true,
    writePool: true,
    removeFromPool: false,
    requireLeague: false,
    executor: 'shared-iterations',
  },
  'blitz-create-team': {
    name: 'blitz-create-team',
    description: 'Login a pool user and create the owner team in that user private Blitz league',
    scenarios: ['login', 'createBlitzTeam'],
    requirePool: true,
    uniqueUsers: true,
    writePool: true,
    removeFromPool: false,
    requireLeague: true,
    executor: 'shared-iterations',
  },
  'blitz-owner-setup': {
    name: 'blitz-owner-setup',
    description: 'Login, create a private Blitz league, then create the owner team in that league',
    scenarios: ['login', 'createBlitzLeague', 'createBlitzTeam'],
    requirePool: true,
    uniqueUsers: true,
    writePool: true,
    removeFromPool: false,
    executor: 'shared-iterations',
  },
  'blitz-join-league': {
    name: 'blitz-join-league',
    description: 'Login remaining pool users, join a host private Blitz league by invite code, then create their team',
    scenarios: ['login', 'joinPrivateBlitzLeague', 'createBlitzTeam'],
    requirePool: true,
    uniqueUsers: true,
    writePool: true,
    removeFromPool: false,
    requireJoinHost: true,
    executor: 'shared-iterations',
  },
  'blitz-join-public-league': {
    name: 'blitz-join-public-league',
    description: 'Login pool users, join the public Extreme Blitz league from getPublicBlitzLeagues, then create a team there',
    scenarios: ['login', 'joinPublicBlitzLeague', 'createBlitzTeam'],
    requirePool: true,
    uniqueUsers: true,
    writePool: true,
    removeFromPool: false,
    requirePublicJoin: true,
    executor: 'shared-iterations',
  },
  'blitz-public-lineup': {
    name: 'blitz-public-lineup',
    description: 'Login users who already have a team in the public Extreme Blitz league, createBlitzLineup, then update all 9 slots',
    scenarios: ['login', 'createBlitzLineup', 'updateBlitzLineup'],
    requirePool: true,
    uniqueUsers: true,
    writePool: true,
    removeFromPool: false,
    requirePublicLineup: true,
    executor: 'shared-iterations',
  },
  'blitz-public-standings': {
    name: 'blitz-public-standings',
    description: 'Public Extreme league: login, getBlitzLeague, FirstHalf/SecondHalf/Championship from timeframe, then getLeagueResultsByWeek. Skips RegularSeason (4+ members)',
    scenarios: ['login', 'getBlitzLeagueDetails', 'getLeagueResultsByWeek'],
    requirePool: true,
    uniqueUsers: true,
    writePool: false,
    removeFromPool: false,
    requirePublicLineup: true,
    requireTimeframe: true,
    forceLargeLeagueDetails: true,
    executor: 'shared-iterations',
  },
  'blitz-create-lineup': {
    name: 'blitz-create-lineup',
    description: 'Login pool users and createBlitzLineup. Default: owned team. Watchable host league: JOIN_HOST_EMAIL + JOIN_INVITE_CODE',
    scenarios: ['login', 'createBlitzLineup'],
    requirePool: true,
    uniqueUsers: true,
    writePool: true,
    removeFromPool: false,
    requireLineupLeague: true,
    executor: 'shared-iterations',
  },
  'blitz-update-lineup': {
    name: 'blitz-update-lineup',
    description: 'Login, ensure weekly lineup exists, load eligible NFL players/teams, update all 9 lineup slots. Default: owned team. Host league: JOIN_HOST_EMAIL + JOIN_INVITE_CODE',
    scenarios: ['login', 'createBlitzLineup', 'updateBlitzLineup'],
    requirePool: true,
    uniqueUsers: true,
    writePool: true,
    removeFromPool: false,
    requireLineupLeague: true,
    executor: 'shared-iterations',
  },
  'blitz-get-lineup': {
    name: 'blitz-get-lineup',
    description: 'Login, getBlitzTeams, then getCurrentWeekBlitzLineup for the team in the target league. Default: owned team. Host league: JOIN_HOST_EMAIL + JOIN_INVITE_CODE',
    scenarios: ['login', 'getCurrentWeekBlitzLineup'],
    requirePool: true,
    uniqueUsers: true,
    writePool: false,
    removeFromPool: false,
    requireLineupLeague: true,
    executor: 'shared-iterations',
  },
  'blitz-league-details': {
    name: 'blitz-league-details',
    description: 'Login, then getBlitzLeague and one standings API from getEFFTimeframe (once in setup) plus league size. Default: owned league. Host league: JOIN_HOST_EMAIL + JOIN_INVITE_CODE',
    scenarios: ['login', 'getBlitzLeagueDetails'],
    requirePool: true,
    uniqueUsers: true,
    writePool: false,
    removeFromPool: false,
    requireLineupLeague: true,
    requireTimeframe: true,
    executor: 'shared-iterations',
  },
  'blitz-league-results': {
    name: 'blitz-league-results',
    description: 'Login, then getLeagueResultsByWeek for the current EFF week from setup getEFFTimeframe. Default: owned league. Host league: JOIN_HOST_EMAIL + JOIN_INVITE_CODE',
    scenarios: ['login', 'getLeagueResultsByWeek'],
    requirePool: true,
    uniqueUsers: true,
    writePool: false,
    removeFromPool: false,
    requireLineupLeague: true,
    requireTimeframe: true,
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

export function suiteHasScenario(suiteName, scenarioName) {
  const suite = SUITES[suiteName];
  if (!suite || !suite.scenarios) return false;
  return suite.scenarios.indexOf(scenarioName) >= 0;
}

export function suiteReportGroup(suite) {
  const name = String((suite && suite.name) || '');
  if (name.indexOf('blitz') === 0) return 'blitz';
  if (name.indexOf('exchange') === 0) return 'exchange';
  return 'auth';
}

export function suiteReportLeaf(suite) {
  const name = String((suite && suite.name) || '');
  const group = suiteReportGroup(suite);
  const prefix = group + '-';
  return name.indexOf(prefix) === 0 ? name.slice(prefix.length) : name;
}
