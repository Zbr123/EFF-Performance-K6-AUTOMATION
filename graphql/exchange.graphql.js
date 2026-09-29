import { gql, httpOk, isSuccessCode } from '../core/http.client.js';
import { payloadOk, responseField as field } from '../core/graphql.util.js';
import { SUITE } from '../config/env.config.js';
import { suiteHasScenario } from '../config/suites.config.js';

const Q_CHECK_EXCHANGE_LEAGUE_NAME = `query CheckExchangeLeagueName($League_Name: String!) { checkExchangeLeagueName(League_Name: $League_Name) { statusCode message valid } }`;
const Q_CREATE_EXCHANGE_LEAGUE = `mutation CreateExchangeLeague($League_Name: String!, $League_Image: String) { createExchangeLeague(League_Name: $League_Name, League_Image: $League_Image) { statusCode message League_ID } }`;
const Q_CHECK_EXCHANGE_TEAM_NAME = `query CheckExchangeTeamName($League_ID: ID!, $Team_Name: String!) { checkExchangeTeamName(League_ID: $League_ID, Team_Name: $Team_Name) { statusCode message valid } }`;
const Q_CREATE_EXCHANGE_TEAM = `mutation CreateExchangeTeam($Team_Name: String!, $Team_Image: String, $League_ID: ID!) { createExchangeTeam(Team_Name: $Team_Name, Team_Image: $Team_Image, League_ID: $League_ID) { statusCode message Team_ID } }`;
const Q_GET_EXCHANGE_PORTFOLIO = `query GetExchangePortfolio($Team_ID: ID!) { getExchangePortfolio(Team_ID: $Team_ID) { statusCode message portfolio { Team_ID Week seasonEnd Number_of_Assets Team_Details { Team_Name Team_Image Cash_On_Hand Assets_Value Initial_Portfolio_Value Total_Value Transactions_Used Transactions_Remaining Transaction_Limit Preseason_Transactions Total_Transactions League_ID Rank } Assets { Players { Asset_ID AssetType Asset_Position Current_Price Player_Details { FullName } NFL_Team_Details { FullName ShortName } Eligibility { isSellable flags reasons } } Teams { Asset_ID AssetType Asset_Position Current_Price Team_Details { FullName ShortName } Eligibility { isSellable flags reasons } } } } } }`;
const Q_GET_EXCHANGE_ASSETS_FOR_EXCHANGE_TEAM = `query GetExchangeAssetsForExchangeTeam($Team_ID: ID!) { getExchangeAssetsForExchangeTeam(Team_ID: $Team_ID) { statusCode message Exchange_Assets { Exchange_Team_ID Week Team_Details { Team_Name Team_Image Cash_On_Hand Transactions_Used Transactions_Remaining Transaction_Limit Preseason_Transactions Total_Transactions } Number_of_Assets Assets { Players { Asset_ID AssetType Asset_Position Current_Price Player_Details { FullName Status } NFL_Team_Details { Team_ID FullName ShortName } Eligibility { isBuyable flags reasons } } Teams { Asset_ID AssetType Asset_Position Current_Price Team_Details { Team_ID FullName ShortName } Eligibility { isBuyable flags reasons } } } } } }`;
const Q_BUY_EXCHANGE_ASSET = `mutation BuyExchangeAsset($Team_ID: ID!, $Asset_ID: ID!, $Asset_Type: ExchangeAssetType!) { buyExchangeAsset(Team_ID: $Team_ID, Asset_ID: $Asset_ID, Asset_Type: $Asset_Type) { statusCode message Asset_ID Asset_Type Team_ID } }`;
const Q_SELL_EXCHANGE_ASSET = `mutation SellExchangeAsset($Team_ID: ID!, $Asset_ID: ID!, $Asset_Type: ExchangeAssetType!) { sellExchangeAsset(Team_ID: $Team_ID, Asset_ID: $Asset_ID, Asset_Type: $Asset_Type) { statusCode message Asset_ID Asset_Type Team_ID } }`;
const Q_JOIN_PRIVATE_EXCHANGE_LEAGUE = `mutation JoinPrivateExchangeLeague($Invite_Code: String!) { joinPrivateExchangeLeague(Invite_Code: $Invite_Code) { statusCode message League_ID } }`;
const Q_GET_PUBLIC_EXCHANGE_LEAGUES = `query GetPublicExchangeLeagues { getPublicExchangeLeagues { statusCode leagues { _id League_Name League_Type Invite_Code League_Image Members Owner_Email Owner_ID Public Game_Type Game_Week Locked isJoined hasTeam } } }`;
const Q_JOIN_PUBLIC_EXCHANGE_LEAGUE = `mutation JoinPublicExchangeLeague($League_ID: ID!) { joinPublicExchangeLeague(League_ID: $League_ID) { statusCode message League_ID } }`;
const Q_GET_EXCHANGE_LEAGUE = `query GetExchangeLeague($League_ID: ID!) { getExchangeLeague(League_ID: $League_ID) { statusCode leagues { _id League_Name League_Type Invite_Code League_Image Members Owner_Email Owner_ID Public Game_Type Game_Week Locked hasTeam } } }`;
const Q_GET_EXCHANGE_LEAGUE_DETAILS = `query GetExchangeLeagueDetails($League_ID: ID!) { getExchangeLeagueDetails(League_ID: $League_ID) { statusCode message details { League_ID Week seasonEnd League_Details { League_Name League_Image Game_Type League_Type Public Members Invite_Code Owner_ID Limit IsOwner } Owner_Details { username profile_picture first_name last_name } isJoined hasTeam Teams { Team_ID Team_Name Team_Image Rank Initial_Portfolio_Value Portfolio_Value Weekly_Portfolio_Value Current_Week_Value_Change Current_Week_Value_Change_Percentage Total_Transactions Own_Team Winner } } } }`;
const Q_GET_EXCHANGE_PORTFOLIO_TRANSACTIONS = `query GetExchangePortfolioTransactions($Team_ID: ID!) { getExchangePortfolio(Team_ID: $Team_ID) { statusCode message portfolio { Team_ID Week seasonEnd Number_of_Assets Team_Details { Team_Name Team_Image Cash_On_Hand Assets_Value Initial_Portfolio_Value Total_Value Weekly_Values Weekly_Values_Percentage_Changes Transactions_Used Transactions_Remaining Transaction_Limit Preseason_Transactions Total_Transactions League_ID Rank } Owner { id username first_name last_name profile_picture } League_Details { League_Name League_Image Game_Type League_Type Public Members } Assets { Players { Asset_ID AssetType Asset_Position Initial_Price Purchase_Price Purchase_Week Current_Price Current_Week_Price_Change Current_Week_Price_Change_Percentage Price_History Player_Details { FullName Status } NFL_Team_Details { Team_ID FullName ShortName } Eligibility { isSellable flags reasons } } Teams { Asset_ID AssetType Asset_Position Initial_Price Purchase_Price Purchase_Week Current_Price Current_Week_Price_Change Current_Week_Price_Change_Percentage Price_History Team_Details { Team_ID FullName ShortName } Eligibility { isSellable flags reasons } } } } } }`;
const Q_GET_EXCHANGE_LEAGUES = `query GetExchangeLeagues { getExchangeLeagues { statusCode leagues { _id League_Name League_Type Invite_Code League_Image Members Owner_Email Owner_ID Public Game_Type Game_Week Locked hasTeam } } }`;

export function checkExchangeLeagueName(leagueName, token, ctx) {
  return gql(Q_CHECK_EXCHANGE_LEAGUE_NAME, { League_Name: leagueName }, token, 'checkExchangeLeagueName', ctx);
}

export function createExchangeLeague(leagueName, token, ctx) {
  return gql(
    Q_CREATE_EXCHANGE_LEAGUE,
    { League_Name: leagueName, League_Image: 'icon_tiger' },
    token,
    'createExchangeLeague',
    ctx
  );
}

export function checkExchangeLeagueNameOk(resp) {
  const data = field(resp, 'checkExchangeLeagueName');
  return httpOk(resp) && !!(data && data.valid === true);
}

export function createExchangeLeagueOk(resp) {
  return payloadOk(resp, 'createExchangeLeague', (d) => !!d.League_ID);
}

export function checkExchangeTeamName(leagueId, teamName, token, ctx) {
  return gql(
    Q_CHECK_EXCHANGE_TEAM_NAME,
    { League_ID: leagueId, Team_Name: teamName },
    token,
    'checkExchangeTeamName',
    ctx
  );
}

export function createExchangeTeam(leagueId, teamName, token, ctx) {
  return gql(
    Q_CREATE_EXCHANGE_TEAM,
    { League_ID: leagueId, Team_Name: teamName, Team_Image: 'icon_pirate' },
    token,
    'createExchangeTeam',
    ctx
  );
}

export function checkExchangeTeamNameOk(resp) {
  const data = field(resp, 'checkExchangeTeamName');
  return httpOk(resp) && !!(data && data.valid === true);
}

export function createExchangeTeamOk(resp) {
  return payloadOk(resp, 'createExchangeTeam', (d) => !!d.Team_ID);
}

export function getExchangePortfolio(teamId, token, ctx) {
  return gql(Q_GET_EXCHANGE_PORTFOLIO, { Team_ID: teamId }, token, 'getExchangePortfolio', ctx);
}

export function getExchangePortfolioOk(resp) {
  const data = field(resp, 'getExchangePortfolio');
  return httpOk(resp) && isSuccessCode(data) && !!(data && data.portfolio && data.portfolio.Team_ID);
}

export function getExchangeAssetsForExchangeTeam(teamId, token, ctx) {
  return gql(Q_GET_EXCHANGE_ASSETS_FOR_EXCHANGE_TEAM, { Team_ID: teamId }, token, 'getExchangeAssetsForExchangeTeam', ctx);
}

export function getExchangeAssetsForExchangeTeamOk(resp) {
  const data = field(resp, 'getExchangeAssetsForExchangeTeam');
  return httpOk(resp) && isSuccessCode(data) && !!(data && data.Exchange_Assets && data.Exchange_Assets.Exchange_Team_ID);
}

export function buyExchangeAsset(teamId, assetId, assetType, token, ctx) {
  return gql(
    Q_BUY_EXCHANGE_ASSET,
    { Team_ID: teamId, Asset_ID: assetId, Asset_Type: assetType },
    token,
    'buyExchangeAsset',
    ctx
  );
}

export function buyExchangeAssetOk(resp) {
  return payloadOk(resp, 'buyExchangeAsset', (d) => !!d.Asset_ID && !!d.Asset_Type && !!d.Team_ID);
}

export function sellExchangeAsset(teamId, assetId, assetType, token, ctx) {
  return gql(
    Q_SELL_EXCHANGE_ASSET,
    { Team_ID: teamId, Asset_ID: assetId, Asset_Type: assetType },
    token,
    'sellExchangeAsset',
    ctx
  );
}

export function sellExchangeAssetOk(resp) {
  return payloadOk(resp, 'sellExchangeAsset', (d) => !!d.Asset_ID && !!d.Asset_Type && !!d.Team_ID);
}

export function joinPrivateExchangeLeague(inviteCode, token, ctx) {
  const options = suiteHasScenario(SUITE, 'joinPrivateExchangeLeague')
    ? { expectedErrorCodes: ['LEAGUE_MEMBERSHIP_ALREADY_EXISTS'] }
    : {};
  return gql(Q_JOIN_PRIVATE_EXCHANGE_LEAGUE, { Invite_Code: inviteCode }, token, 'joinPrivateExchangeLeague', ctx, options);
}

export function joinPrivateExchangeLeagueOk(resp) {
  return payloadOk(resp, 'joinPrivateExchangeLeague', (d) => !!d.League_ID);
}

export function getPublicExchangeLeagues(token, ctx) {
  return gql(Q_GET_PUBLIC_EXCHANGE_LEAGUES, {}, token, 'getPublicExchangeLeagues', ctx);
}

export function getPublicExchangeLeaguesOk(resp) {
  return payloadOk(resp, 'getPublicExchangeLeagues', (d) => Array.isArray(d.leagues));
}

export function pickPublicExchangeLeague(leagues, targetLeagueId) {
  const rows = leagues || [];
  const target = String(targetLeagueId || '');
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row._id) continue;
    if (target && String(row._id) !== target) continue;
    if (row.Public !== true && String(row.Public) !== 'true') continue;
    if (String(row.Game_Type || '').toUpperCase() !== 'EXTREME') continue;
    const week = Number(row.Game_Week);
    if (!isNaN(week) && week !== 0) continue;
    return row;
  }
  return null;
}

export function joinPublicExchangeLeague(leagueId, token, ctx) {
  const options = suiteHasScenario(SUITE, 'joinPublicExchangeLeague')
    ? { expectedErrorCodes: ['LEAGUE_MEMBERSHIP_ALREADY_EXISTS'] }
    : {};
  return gql(Q_JOIN_PUBLIC_EXCHANGE_LEAGUE, { League_ID: leagueId }, token, 'joinPublicExchangeLeague', ctx, options);
}

export function joinPublicExchangeLeagueOk(resp) {
  return payloadOk(resp, 'joinPublicExchangeLeague', (d) => !!d.League_ID);
}

export function publicExchangeJoinAlreadyMember(resp) {
  return !!(resp && resp.gqlErr && resp.gqlErr.errorCode === 'LEAGUE_MEMBERSHIP_ALREADY_EXISTS');
}

export function getExchangeLeagues(token, ctx) {
  return gql(Q_GET_EXCHANGE_LEAGUES, {}, token, 'getExchangeLeagues', ctx);
}

export function getExchangeLeaguesOk(resp) {
  return payloadOk(resp, 'getExchangeLeagues', (d) => Array.isArray(d.leagues));
}

export function getExchangeLeague(leagueId, token, ctx) {
  return gql(Q_GET_EXCHANGE_LEAGUE, { League_ID: leagueId }, token, 'getExchangeLeague', ctx);
}

export function getExchangeLeagueOk(resp) {
  return payloadOk(resp, 'getExchangeLeague', (d) => Array.isArray(d.leagues) && d.leagues.length > 0);
}

export function pickExchangeLeague(resp, leagueId) {
  const data = field(resp, 'getExchangeLeague');
  const rows = (data && data.leagues) || [];
  const want = String(leagueId || '');
  if (want) {
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i]._id) === want) return rows[i];
    }
  }
  return rows[0] || null;
}

export function getExchangeLeagueDetails(leagueId, token, ctx) {
  return gql(Q_GET_EXCHANGE_LEAGUE_DETAILS, { League_ID: leagueId }, token, 'getExchangeLeagueDetails', ctx);
}

export function getExchangeLeagueDetailsOk(resp) {
  const data = field(resp, 'getExchangeLeagueDetails');
  return httpOk(resp) && isSuccessCode(data) && !!(data && data.details && data.details.League_ID);
}

function exchangeLeagueDetailsTeams(resp) {
  const data = field(resp, 'getExchangeLeagueDetails');
  const details = (data && data.details) || {};
  return Array.isArray(details.Teams) ? details.Teams : [];
}

export function pickExchangeDetailsTopTeam(resp) {
  const teams = exchangeLeagueDetailsTeams(resp);
  let top = null;
  for (let i = 0; i < teams.length; i++) {
    const value = Number(teams[i] && teams[i].Portfolio_Value);
    if (!isFinite(value)) continue;
    if (!top || value > Number(top.Portfolio_Value)) top = teams[i];
  }
  return top;
}

export function pickExchangeDetailsOwnTeam(resp, teamId) {
  const teams = exchangeLeagueDetailsTeams(resp);
  const want = String(teamId || '');
  if (!want) return null;
  for (let i = 0; i < teams.length; i++) {
    if (String(teams[i] && teams[i].Team_ID) === want) return teams[i];
  }
  return null;
}

export function getExchangePortfolioTransactions(teamId, token, ctx) {
  return gql(Q_GET_EXCHANGE_PORTFOLIO_TRANSACTIONS, { Team_ID: teamId }, token, 'getExchangePortfolioTransactions', ctx);
}

export function getExchangePortfolioTransactionsOk(resp) {
  const data = field(resp, 'getExchangePortfolio');
  return httpOk(resp) && isSuccessCode(data) && !!(data && data.portfolio && data.portfolio.Team_ID);
}

export function findExchangeLeagueByName(resp, leagueName) {
  const data = field(resp, 'getExchangeLeagues');
  const rows = (data && data.leagues) || [];
  const want = String(leagueName || '');
  if (!want) return null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && String(rows[i].League_Name || '') === want) return rows[i];
  }
  return null;
}

export function findExchangeLeagueByInvite(resp, inviteCode) {
  const data = field(resp, 'getExchangeLeagues');
  const rows = (data && data.leagues) || [];
  const want = String(inviteCode || '').trim().toUpperCase();
  if (!want) return null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row._id) continue;
    if (String(row.Invite_Code || '').trim().toUpperCase() !== want) continue;
    return row;
  }
  return null;
}

export function findExchangeLeagueByOwnerAndInvite(email, inviteCode, token, ctx) {
  const wantEmail = String(email || '').trim().toLowerCase();
  const wantInvite = String(inviteCode || '').trim().toUpperCase();
  if (!wantInvite) return '';
  const list = getExchangeLeagues(token, ctx);
  const data = field(list, 'getExchangeLeagues');
  const leagues = (data && data.leagues) || [];
  for (let i = 0; i < leagues.length; i++) {
    if (!leagues[i]._id) continue;
    if (String(leagues[i].Invite_Code || '').toUpperCase() !== wantInvite) continue;
    if (wantEmail && String(leagues[i].Owner_Email || '').toLowerCase() !== wantEmail) continue;
    return String(leagues[i]._id);
  }
  return '';
}
