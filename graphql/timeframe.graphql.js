import { gql, httpOk, isSuccessCode } from '../core/http.client.js';

export const Q_GET_EFF_TIMEFRAME = `query GetEFFTimeframe { getEFFTimeframe { statusCode message current_timeframe { Season SeasonType Week SeasonPhase LastCompletedWeek UpcomingWeek } } }`;

export function getEFFTimeframe(token, ctx) {
  return gql(Q_GET_EFF_TIMEFRAME, {}, token, 'getEFFTimeframe', ctx);
}

export function getEFFTimeframeOk(resp) {
  const data = resp.body && resp.body.getEFFTimeframe;
  const tf = data && data.current_timeframe;
  return httpOk(resp) && isSuccessCode(data) && !!tf && tf.Week != null;
}

export function parseEffTimeframe(resp) {
  const tf = resp && resp.body && resp.body.getEFFTimeframe && resp.body.getEFFTimeframe.current_timeframe;
  if (!tf) return null;
  return {
    season: tf.Season == null ? '' : String(tf.Season),
    seasonType: tf.SeasonType == null ? '' : String(tf.SeasonType),
    week: tf.Week == null ? '' : String(tf.Week),
    seasonPhase: tf.SeasonPhase == null ? '' : String(tf.SeasonPhase),
  };
}
