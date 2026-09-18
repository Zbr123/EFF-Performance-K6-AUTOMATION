import { gql, httpOk, isSuccessCode } from '../core/http.client.js';
import { SUITE } from '../config/env.config.js';

function field(resp, key) {
  return resp && resp.body ? resp.body[key] : null;
}

function payloadOk(resp, key, extra) {
  const data = field(resp, key);
  return httpOk(resp) && isSuccessCode(data) && (!extra || extra(data));
}

function selectableIds(rows, idKey) {
  const ids = [];
  const list = rows || [];
  for (let i = 0; i < list.length; i++) {
    if (list[i][idKey] && list[i].Eligibility && list[i].Eligibility.isSelectable) {
      ids.push(String(list[i][idKey]));
    }
  }
  return ids;
}

const Q_CHECK_BLITZ_LEAGUE_NAME = `query CheckBlitzLeagueName($League_Name: String!) { checkBlitzLeagueName(League_Name: $League_Name) { statusCode message valid } }`;
const Q_CREATE_BLITZ_LEAGUE = `mutation CreateBlitzLeague($League_Name: String!, $League_Image: String) { createBlitzLeague(League_Name: $League_Name, League_Image: $League_Image) { statusCode message League_ID } }`;
const Q_CHECK_BLITZ_TEAM_NAME = `query CheckBlitzTeamName($League_ID: ID!, $Team_Name: String!) { checkBlitzTeamName(League_ID: $League_ID, Team_Name: $Team_Name) { statusCode message valid } }`;
const Q_CREATE_BLITZ_TEAM = `mutation CreateBlitzTeam($Team_Name: String!, $Team_Image: String, $League_ID: ID!) { createBlitzTeam(Team_Name: $Team_Name, Team_Image: $Team_Image, League_ID: $League_ID) { statusCode message Team_ID } }`;
const Q_GET_BLITZ_LEAGUE = `query GetBlitzLeague($League_ID: ID!) { getBlitzLeague(League_ID: $League_ID) { statusCode leagues { _id League_Name League_Type Invite_Code League_Image Members Owner_Email Owner_ID Public Game_Type Game_Week hasTeam } } }`;
const Q_GET_BLITZ_LEAGUES = `query GetBlitzLeagues { getBlitzLeagues { statusCode leagues { _id Invite_Code Owner_Email Public } } }`;
const Q_JOIN_PRIVATE_BLITZ_LEAGUE = `mutation JoinPrivateBlitzLeague($Invite_Code: String!) { joinPrivateBlitzLeague(Invite_Code: $Invite_Code) { statusCode message League_ID } }`;
const Q_CREATE_BLITZ_LINEUP = `mutation CreateBlitzLineup($Team_ID: ID!) { createBlitzLineup(Team_ID: $Team_ID) { statusCode message Team_ID Week } }`;
const Q_GET_NFL_PLAYERS_FOR_BLITZ_TEAM_BY_POSITION = `query GetNFLPlayersForBlitzTeamByPosition($Team_ID: ID!, $Position: PlayerPositionEnum!) { getNFLPlayersForBlitzTeamByPosition(Team_ID: $Team_ID, Position: $Position) { statusCode message players { Player_ID Eligibility { isSelectable flags } } } }`;
const Q_GET_NFL_TEAMS_FOR_BLITZ_TEAM_BY_POSITION = `query GetNFLTeamsForBlitzTeamByPosition($Team_ID: ID!, $Position: TeamPositionEnum!) { getNFLTeamsForBlitzTeamByPosition(Team_ID: $Team_ID, Position: $Position) { statusCode message teams { Team_ID Eligibility { isSelectable flags } } } }`;
const Q_UPDATE_BLITZ_LINEUP_BY_POSITION = `mutation UpdateBlitzLineupByPosition($Team_ID: ID!, $Position: LineupPositionEnum!, $Value_ID: ID!) { updateBlitzLineupByPosition(Team_ID: $Team_ID, Position: $Position, Value_ID: $Value_ID) { statusCode message Team_ID Week Position Value_ID } }`;
const Q_GET_BLITZ_TEAMS = `query GetBlitzTeams { getBlitzTeams { statusCode teams { _id Team_Name League_ID Lineup_Status league_details { League_Name Game_Type League_Type Public Members isMine } Page_Context { Current_Week } } } }`;
const Q_GET_CURRENT_WEEK_BLITZ_LINEUP = `query GetCurrentWeekBlitzLineup($Team_ID: ID!) { getCurrentWeekBlitzLineup(Team_ID: $Team_ID) { statusCode message Basic { Season Week seasonEnd Team_ID Team_Name Team_Image Total_Week_Points Total_Season_Points Rank League_ID league_details { League_Name Game_Type League_Type Public Members } Lineup_Status } Lineup { Players { Quarterback { LineupPosition Points } Running_Back1 { LineupPosition Points } Running_Back2 { LineupPosition Points } Wide_Receiver1 { LineupPosition Points } Wide_Receiver2 { LineupPosition Points } Tight_End { LineupPosition Points } } Teams { Kicker { LineupPosition Points } Offense { LineupPosition Points } Defense { LineupPosition Points } } } } }`;
const Q_LEAGUE_DETAILS_FIELDS = `statusCode message details { League_ID View_Type hasTeam League_Details { League_Name Game_Type League_Type Public Members Invite_Code } Teams { Team_ID Team_Name Rank Total_Points Total_Wins Own_Team } }`;

function leagueDetailsQuery(op) {
  return `query ${op}($League_ID: ID!) { ${op}(League_ID: $League_ID) { ${Q_LEAGUE_DETAILS_FIELDS} } }`;
}

function leagueDetailsView(op) {
  return {
    label: op,
    call(leagueId, token, ctx) {
      return gql(leagueDetailsQuery(op), { League_ID: leagueId }, token, op, ctx);
    },
    ok(resp) {
      const data = field(resp, op);
      return httpOk(resp) && isSuccessCode(data) && !!(data && data.details && data.details.League_ID);
    },
  };
}

export function checkBlitzLeagueName(leagueName, token, ctx) {
  return gql(Q_CHECK_BLITZ_LEAGUE_NAME, { League_Name: leagueName }, token, 'checkBlitzLeagueName', ctx);
}

export function createBlitzLeague(leagueName, token, ctx) {
  return gql(Q_CREATE_BLITZ_LEAGUE, { League_Name: leagueName, League_Image: 'icon_bull' }, token, 'createBlitzLeague', ctx);
}

export function checkBlitzLeagueNameOk(resp) {
  const data = field(resp, 'checkBlitzLeagueName');
  return httpOk(resp) && !!(data && data.valid === true);
}

export function createBlitzLeagueOk(resp) {
  return payloadOk(resp, 'createBlitzLeague', (d) => !!d.League_ID);
}

export function checkBlitzTeamName(leagueId, teamName, token, ctx) {
  return gql(Q_CHECK_BLITZ_TEAM_NAME, { League_ID: leagueId, Team_Name: teamName }, token, 'checkBlitzTeamName', ctx);
}

export function createBlitzTeam(leagueId, teamName, token, ctx) {
  return gql(Q_CREATE_BLITZ_TEAM, { League_ID: leagueId, Team_Name: teamName, Team_Image: 'icon_reaper' }, token, 'createBlitzTeam', ctx);
}

export function checkBlitzTeamNameOk(resp) {
  const data = field(resp, 'checkBlitzTeamName');
  return httpOk(resp) && !!(data && data.valid === true);
}

export function createBlitzTeamOk(resp) {
  return payloadOk(resp, 'createBlitzTeam', (d) => !!d.Team_ID);
}

export function getBlitzLeague(leagueId, token, ctx) {
  return gql(Q_GET_BLITZ_LEAGUE, { League_ID: leagueId }, token, 'getBlitzLeague', ctx);
}

export function getBlitzLeagueOk(resp) {
  return payloadOk(resp, 'getBlitzLeague', (d) => Array.isArray(d.leagues) && d.leagues.length > 0);
}

export function pickBlitzLeague(resp, leagueId) {
  const data = field(resp, 'getBlitzLeague');
  const rows = (data && data.leagues) || [];
  const want = String(leagueId || '');
  if (want) {
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i]._id) === want) return rows[i];
    }
  }
  return rows[0] || null;
}

export function getBlitzLeagues(token, ctx) {
  return gql(Q_GET_BLITZ_LEAGUES, {}, token, 'getBlitzLeagues', ctx);
}

export function joinPrivateBlitzLeague(inviteCode, token, ctx) {
  return gql(Q_JOIN_PRIVATE_BLITZ_LEAGUE, { Invite_Code: inviteCode }, token, 'joinPrivateBlitzLeague', ctx);
}

export function joinPrivateBlitzLeagueOk(resp) {
  return payloadOk(resp, 'joinPrivateBlitzLeague', (d) => !!d.League_ID);
}

function firstInvite(leagues, leagueId) {
  if (!leagues || !leagues.length) return '';
  const want = leagueId ? String(leagueId) : '';
  for (let i = 0; i < leagues.length; i++) {
    if (want && String(leagues[i]._id) !== want) continue;
    if (leagues[i].Invite_Code) return String(leagues[i].Invite_Code);
  }
  return '';
}

export function fetchBlitzInviteCode(leagueId, token, ctx) {
  const one = getBlitzLeague(leagueId, token, ctx);
  const oneData = field(one, 'getBlitzLeague');
  const fromOne = firstInvite(oneData && oneData.leagues, leagueId);
  if (fromOne) return fromOne;
  const list = getBlitzLeagues(token, ctx);
  const data = field(list, 'getBlitzLeagues');
  return firstInvite(data && data.leagues, leagueId);
}

export function findBlitzLeagueByOwnerAndInvite(email, inviteCode, token, ctx) {
  const wantEmail = String(email || '').trim().toLowerCase();
  const wantInvite = String(inviteCode || '').trim().toUpperCase();
  if (!wantInvite) return '';
  const list = getBlitzLeagues(token, ctx);
  const data = field(list, 'getBlitzLeagues');
  const leagues = (data && data.leagues) || [];
  for (let i = 0; i < leagues.length; i++) {
    if (!leagues[i]._id) continue;
    if (String(leagues[i].Invite_Code || '').toUpperCase() !== wantInvite) continue;
    if (wantEmail && String(leagues[i].Owner_Email || '').toLowerCase() !== wantEmail) continue;
    return String(leagues[i]._id);
  }
  return '';
}

export function createBlitzLineup(teamId, token, ctx) {
  const options = SUITE === 'blitz-update-lineup' ? { expectedErrorCodes: ['LINEUP_ALREADY_EXISTS'] } : {};
  return gql(Q_CREATE_BLITZ_LINEUP, { Team_ID: teamId }, token, 'createBlitzLineup', ctx, options);
}

export function createBlitzLineupOk(resp) {
  return payloadOk(resp, 'createBlitzLineup', (d) => !!d.Team_ID);
}

export function lineupAlreadyExists(resp) {
  return !!(resp && resp.gqlErr && resp.gqlErr.errorCode === 'LINEUP_ALREADY_EXISTS');
}

export function getNFLPlayersForBlitzTeamByPosition(teamId, position, token, ctx) {
  return gql(Q_GET_NFL_PLAYERS_FOR_BLITZ_TEAM_BY_POSITION, { Team_ID: teamId, Position: position }, token, 'getNFLPlayersForBlitzTeamByPosition', ctx);
}

export function getNFLTeamsForBlitzTeamByPosition(teamId, position, token, ctx) {
  return gql(Q_GET_NFL_TEAMS_FOR_BLITZ_TEAM_BY_POSITION, { Team_ID: teamId, Position: position }, token, 'getNFLTeamsForBlitzTeamByPosition', ctx);
}

export function updateBlitzLineupByPosition(teamId, position, valueId, token, ctx) {
  return gql(Q_UPDATE_BLITZ_LINEUP_BY_POSITION, { Team_ID: teamId, Position: position, Value_ID: valueId }, token, 'updateBlitzLineupByPosition', ctx);
}

export function getNFLPlayersForBlitzTeamByPositionOk(resp) {
  return payloadOk(resp, 'getNFLPlayersForBlitzTeamByPosition', (d) => Array.isArray(d.players));
}

export function getNFLTeamsForBlitzTeamByPositionOk(resp) {
  return payloadOk(resp, 'getNFLTeamsForBlitzTeamByPosition', (d) => Array.isArray(d.teams));
}

export function updateBlitzLineupByPositionOk(resp) {
  return payloadOk(resp, 'updateBlitzLineupByPosition', (d) => !!d.Position);
}

export function selectablePlayerIds(resp) {
  const data = field(resp, 'getNFLPlayersForBlitzTeamByPosition');
  return selectableIds(data && data.players, 'Player_ID');
}

export function selectableTeamIds(resp) {
  const data = field(resp, 'getNFLTeamsForBlitzTeamByPosition');
  return selectableIds(data && data.teams, 'Team_ID');
}

export function getBlitzTeams(token, ctx) {
  return gql(Q_GET_BLITZ_TEAMS, {}, token, 'getBlitzTeams', ctx);
}

export function getCurrentWeekBlitzLineup(teamId, token, ctx) {
  return gql(Q_GET_CURRENT_WEEK_BLITZ_LINEUP, { Team_ID: teamId }, token, 'getCurrentWeekBlitzLineup', ctx);
}

export function getBlitzTeamsOk(resp) {
  return payloadOk(resp, 'getBlitzTeams', (d) => Array.isArray(d.teams));
}

export function getCurrentWeekBlitzLineupOk(resp) {
  return payloadOk(resp, 'getCurrentWeekBlitzLineup', (d) => !!(d.Basic && d.Basic.Team_ID));
}

export function blitzTeamsList(resp) {
  const data = field(resp, 'getBlitzTeams');
  return (data && data.teams) || [];
}

export function pickBlitzTeam(teams, opts) {
  const rows = teams || [];
  const targetLeague = String((opts && opts.targetLeagueId) || '');
  const ownedTeamId = String((opts && opts.ownedTeamId) || '');
  const ownedLeagueId = String((opts && opts.ownedLeagueId) || '');

  function one(match) {
    const hit = [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i]._id && match(rows[i])) hit.push(rows[i]);
    }
    return hit.length === 1 ? hit[0] : null;
  }

  if (targetLeague) return one((t) => String(t.League_ID || '') === targetLeague);
  return (
    (ownedTeamId && one((t) => String(t._id) === ownedTeamId)) ||
    (ownedLeagueId && one((t) => String(t.League_ID || '') === ownedLeagueId)) ||
    one((t) => t.league_details && t.league_details.isMine === true)
  );
}

export function pickBlitzLeagueDetailsView(timeframe, members) {
  if (!timeframe) return null;
  const n = Number(members);
  const week = Number(timeframe.week);
  const seasonType = Number(timeframe.seasonType);
  const phase = String(timeframe.seasonPhase || '').toUpperCase();
  const isPost = seasonType === 3 || phase.indexOf('POST') >= 0;
  const isReg = seasonType === 1 || phase.indexOf('REGULAR') >= 0;
  if (members == null || String(members) === '' || isNaN(n) || isNaN(week)) return null;
  if (n <= 3) return isReg && week >= 1 && week <= 18 ? leagueDetailsView('getBlitzLeagueDetailsRegularSeason') : null;
  if (isPost || (isReg && week >= 19)) return leagueDetailsView('getBlitzLeagueDetailsChampionship');
  if (isReg && week >= 10 && week <= 18) return leagueDetailsView('getBlitzLeagueDetailsSecondHalf');
  if (isReg && week >= 1 && week <= 9) return leagueDetailsView('getBlitzLeagueDetailsFirstHalf');
  return null;
}

const Q_GET_LEAGUE_RESULTS_BY_WEEK = `query getLeagueResultsByWeek($League_ID: ID!, $Week: Int!) { getLeagueResultsByWeek(League_ID: $League_ID, Week: $Week) { statusCode message results { Week League_ID League_Name Teams { Team_ID Team_Name Rank Week_Wins Total_Week_Points Own_Team Qualified Lineup_Status Lineup { Players { Position Position_Status Player_ID Points } Teams { Position Position_Status Team_ID Points } } } } } }`;

export function getLeagueResultsByWeek(leagueId, week, token, ctx) {
  return gql(Q_GET_LEAGUE_RESULTS_BY_WEEK, { League_ID: leagueId, Week: week }, token, 'getLeagueResultsByWeek', ctx);
}

export function getLeagueResultsByWeekOk(resp) {
  return payloadOk(resp, 'getLeagueResultsByWeek', (d) => !!(d.results && d.results.League_ID && d.results.Week != null));
}

export function pickLeagueResultsWeek(timeframe) {
  if (!timeframe) return null;
  const week = Number(timeframe.week);
  const seasonType = Number(timeframe.seasonType);
  const phase = String(timeframe.seasonPhase || '').toUpperCase();
  const isPost = seasonType === 3 || phase.indexOf('POST') >= 0;
  const isReg = seasonType === 1 || phase.indexOf('REGULAR') >= 0;
  if (isNaN(week)) return null;
  if (isReg && week >= 1 && week <= 20) return week;
  if (isPost && week >= 1 && week <= 2) return 18 + week;
  if (isPost && week >= 19 && week <= 20) return week;
  return null;
}
