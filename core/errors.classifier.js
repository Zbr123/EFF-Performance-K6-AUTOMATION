const CATEGORY_LABELS = {
  ok: 'OK',
  validation: 'Backend validation',
  business_rule: 'Business rule',
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
  if (code === 'PRESEASON_NO_STANDINGS') return 'Preseason has no matches, so league standings views are not available.';
  if (code === 'PRESEASON_NO_RESULTS') return 'Preseason has no matches, so weekly league results are not available.';
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
  if (code === 'NOT_FOUND') return 'Verify GET ran, but the created league was not in the list. The timeout write did not complete.';
  if (code === 'LEAGUE_NAME_TAKEN') return 'League name is already taken. The check or create collided.';
  if (code === 'LEAGUE_CREATION_LIMIT') return 'User hit the daily private-league creation limit (5).';
  if (code === 'LEAGUE_CREATION_CLOSED' || code === 'LEAGUE_CREATION_NOT_ALLOWED' || code === 'LEAGUE_CREATION_NOT_STARTED') return 'League creation is blocked by the current NFL timeframe.';
  if (code === 'TEAM_NAME_TAKEN') return 'Team name is already taken in this league.';
  if (code === 'TEAM_ALREADY_EXISTS') return 'This user already has a team in this league. Use a user without blitz.teamId, or a new league.';
  if (code === 'LEAGUE_MEMBERSHIP_REQUIRED') return 'User is not a member of the league. Owner team create needs the league they own.';
  if (code === 'LEAGUE_FULL') return 'League is full; team create is blocked.';
  if (code === 'TEAM_CREATION_CLOSED' || code === 'TEAM_CREATION_NOT_ALLOWED' || code === 'TEAM_CREATION_NOT_STARTED') return 'Team creation is blocked by the current NFL timeframe.';
  if (code === 'INVALID_INVITE_CODE' || code === 'INVITE_CODE_REQUIRED') return 'Invite code is missing or does not match a private Blitz league.';
  if (code === 'LEAGUE_NOT_PRIVATE') return 'That league is public. Use joinPublicBlitzLeague, not the private invite join.';
  if (code === 'LEAGUE_NOT_PUBLIC') return 'That league is not public. Use joinPrivateBlitzLeague with an invite code, or pick the Extreme public league from getPublicBlitzLeagues.';
  if (code === 'LEAGUE_MEMBERSHIP_ALREADY_EXISTS') return 'This user is already a member of that league.';
  if (code === 'WEEKLY_CHALLENGE_JOIN_CLOSED' || code === 'WEEKLY_CHALLENGE_JOIN_NOT_ALLOWED' || code === 'WEEKLY_CHALLENGE_JOIN_GAME_WEEK_CHANGED') return 'Weekly challenge join is blocked by the current game week or NFL timeframe.';
  if (code === 'LEAGUE_OWNER_TEAM_NOT_CREATED') return 'Host must create their owner team before others can join.';
  if (code === 'LEAGUE_JOINED_TEAM_NOT_CREATED') return 'User previously joined a league without creating a team. Create that team first.';
  if (code === 'LEAGUE_JOIN_CLOSED' || code === 'LEAGUE_JOIN_NOT_ALLOWED' || code === 'LEAGUE_JOIN_NOT_STARTED') return 'Private league join is blocked by the current NFL timeframe.';
  if (code === 'LEAGUE_REJOIN_CLOSED' || code === 'LEAGUE_REJOIN_NOT_ALLOWED' || code === 'LEAGUE_REJOIN_NOT_STARTED') return 'Rejoin is blocked by the current NFL timeframe.';
  if (code === 'LINEUP_ALREADY_EXISTS') return 'This team already has a lineup for the current week. Lineups are per team; the same user can still create one on another team.';
  if (code === 'LINEUP_CREATION_NOT_STARTED' || code === 'LINEUP_CREATION_CLOSED') return 'Lineup creation is blocked by the current NFL timeframe.';
  if (code === 'LAST_GAME_STARTED') return 'Lineup create closed because the last game of the week has started.';
  if (code === 'FUTURE_WEEK_NOT_ALLOWED' || code === 'INVALID_WEEK_VALUE' || code === 'WEEK_REQUIRED') return 'Results week is missing, invalid, or still in the future.';
  if (code === 'POSTSEASON_NOT_PLAYED_YET') return 'Postseason results are locked until that week is reached.';
  if (code === 'LEAGUE_VIEW_NOT_STARTED') return 'League details view is blocked by the current NFL timeframe.';
  if (code === 'SECOND_HALF_VIEW_LOCKED') return 'Second half standings are locked until after week 9.';
  if (code === 'CHAMPIONSHIP_VIEW_LOCKED') return 'Championship standings are locked until the regular season ends.';
  if (code === 'LEAGUE_MEMBERS_FOUR_OR_MORE') return 'Regular season standings are only for leagues with 3 or fewer members.';
  if (code === 'LEAGUE_MEMBERS_LESS_THAN_FOUR') return 'This league has fewer than 4 members.';
  if (code === 'TEAM_OWNERSHIP_REQUIRED') return 'Lineup can only be created on a team this user owns.';
  if (code === 'TEAM_NOT_QUALIFIED') return 'This team is not eligible to create a lineup.';
  if (code === 'TEAM_ID_REQUIRED' || code === 'INVALID_TEAM_ID' || code === 'TEAM_NOT_FOUND') return 'Team_ID is missing, invalid, or not in the backend.';
  if (code === 'LINEUP_NOT_FOUND') return 'No weekly lineup on this team. createBlitzLineup must succeed first.';
  if (code === 'LINEUP_VIEW_NOT_STARTED') return 'Lineup view is blocked by the current NFL timeframe.';
  if (code === 'SEASON_NOT_STARTED') return 'The season has not started yet, so current-week lineup cannot be viewed.';
  if (code === 'FIRST_GAME_NOT_STARTED' || code === 'PRESEASON_VIEW_ONLY_WEEK_ONE' || code === 'PRESEASON_VIEW_ONLY_OWNER') return 'Current-week lineup view is blocked by the current NFL timeframe.';
  if (code === 'LINEUP_UPDATE_NOT_STARTED' || code === 'LINEUP_UPDATE_CLOSED') return 'Lineup update is blocked by the current NFL timeframe.';
  if (code === 'INVALID_PLAYER_ID' || code === 'INVALID_QB_VALUE' || code === 'INVALID_RB_VALUE' || code === 'INVALID_WR_VALUE' || code === 'INVALID_TE_VALUE') return 'Value_ID is not a valid NFL player for that lineup slot.';
  if (code === 'INVALID_NFL_TEAM_ID' || code === 'INVALID_PLAYER_NFL_TEAM_ID') return 'Value_ID is not a valid NFL team for K / OFF / DEF.';
  if (code === 'RB_UNIQUENESS_VIOLATION') return 'RB1 and RB2 must be different players.';
  if (code === 'WR_UNIQUENESS_VIOLATION') return 'WR1 and WR2 must be different players.';
  if (code === 'HALF_REUSED') return 'That player or NFL team was already used in this half for this Blitz team.';
  if (code === 'BYE_WEEK') return 'That player or NFL team is on a bye this week.';
  if (code === 'GAME_ALREADY_STARTED' || code === 'GAME_ALREADY_PLAYED' || code === 'CANNOT_CHANGE_ALREADY_STARTED' || code === 'CANNOT_CHANGE_ALREADY_PLAYED') return 'That slot or selection is locked because the game has started or finished.';
  if (code === 'PLAYER_FREE_AGENT' || code === 'PLAYER_PERSONAL_LEAVE' || code === 'PLAYER_SUSPENDED') return 'That player cannot be selected in the current status.';
  if (code && code !== 'OK' && code !== 'n/a') return `Backend returned ${code}. See message.`;
  return 'See error message for details.';
}
