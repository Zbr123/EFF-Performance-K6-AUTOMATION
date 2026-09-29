# EFF k6 Performance Framework

Load tests for the EFF AppSync GraphQL API, built on Grafana k6. Each run executes a **suite** (an ordered chain of scenarios) as one user flow. If a scenario fails, the rest of that flow is marked `SKIP`.

## Setup

```powershell
cd "EFF Performance K6 Framework"
npm install
```

Copy `.env.example` to `.env` and fill in `GRAPHQL_URL`, `API_KEY`, `PASSWORD`. Every command below accepts `-e VUS=` (concurrent users) and `-e ITERATIONS=` (total runs):

```powershell
npm run <command> -- -e VUS=10 -e ITERATIONS=50
```

## Auth

| Command | Flow | Purpose |
|---|---|---|
| `npm run signup` | `signup` | Create verified accounts, append to `data/users.json` |
| `npm run login` | `login` | Validate pool email/password + token |
| `npm run refresh` | `login → refreshSession` | Validate session, rotate via refreshToken, validate again |
| `npm run delete` | `login → deleteAccounts` | Delete pool accounts, remove from pool |
| `npm run lifecycle` | `signup → deleteAccounts` | Temp account created + deleted, pool untouched |

## Blitz Private

Host creates a league first, then guests join it. The host needs `blitz:league` + `blitz:team` (or `blitz:owner` for both at once).

| Command | Flow | Purpose |
|---|---|---|
| `npm run blitz:league` | `login → createBlitzLeague` | Host creates a private league |
| `npm run blitz:team` | `login → createBlitzTeam` | Host creates owner team in its league |
| `npm run blitz:owner` | `login → createBlitzLeague → createBlitzTeam` | League + owner team in one run |
| `npm run blitz:join` | `login → joinPrivateBlitzLeague → createBlitzTeam` | Guests join host league + create teams (needs host email + invite code) |
| `npm run blitz:lineup` | `login → createBlitzLineup` | Create current-week lineup |
| `npm run blitz:update` | `login → createBlitzLineup → updateBlitzLineup` | Fill all 9 slots (QB, RB1, RB2, WR1, WR2, TE, K, OFF, DEF) |
| `npm run blitz:get-lineup` | `login → getCurrentWeekBlitzLineup` | Read current-week lineup |
| `npm run blitz:league-details` | `login → getBlitzLeagueDetails` | League metadata + standings view |
| `npm run blitz:league-results` | `login → getLeagueResultsByWeek` | Weekly results for current EFF week |

Guest/host-league runs add `-e JOIN_HOST_EMAIL="<host>" -e JOIN_INVITE_CODE="<code>"`, e.g.:

```powershell
npm run blitz:join -- -e JOIN_HOST_EMAIL="<host>" -e JOIN_INVITE_CODE="<code>" -e VUS=100 -e ITERATIONS=100
```

## Blitz Public (Extreme)

Separate flow for the public Extreme league. No invite code needed.

| Command | Flow | Purpose |
|---|---|---|
| `npm run blitz:join-public` | `login → joinPublicBlitzLeague → createBlitzTeam` | Join public Extreme league + create team |
| `npm run blitz:public-lineup` | `login → createBlitzLineup → updateBlitzLineup` | Create + fill public lineups |
| `npm run blitz:public-standings` | `login → getBlitzLeagueDetails → getLeagueResultsByWeek` | Public standings + weekly results |

## Exchange Private

Same host/guest model as Blitz. Host needs `exchange:league` + `exchange:team` (or `exchange:owner`).

| Command | Flow | Purpose |
|---|---|---|
| `npm run exchange:league` | `login → createExchangeLeague` | Host creates a private league |
| `npm run exchange:team` | `login → createExchangeTeam` | Host creates owner team in its league |
| `npm run exchange:owner` | `login → createExchangeLeague → createExchangeTeam` | League + owner team in one run |
| `npm run exchange:join` | `login → joinPrivateExchangeLeague → createExchangeTeam` | Guests join host league + create teams (needs host email + invite code) |
| `npm run exchange:portfolio` | `login → getExchangePortfolio` | Read cash, asset/total value, transaction counters |
| `npm run exchange:buy` | `login → buyExchangeAsset` | Buy 1 affordable asset, verify portfolio |
| `npm run exchange:sell` | `login → sellExchangeAsset` | Sell 1 owned asset, verify removal |
| `npm run exchange:league-details` | `login → getExchangeLeagueDetails` | League metadata + portfolio standings |
| `npm run exchange:transactions` | `login → getExchangeTransactions` | Portfolio transaction history |

`portfolio / buy / sell / league-details / transactions` use the owned team by default, or the host league with `-e JOIN_HOST_EMAIL="<host>" -e JOIN_INVITE_CODE="<code>"`. Buy/sell mutate real portfolios — test environment only.

## Exchange Public (Extreme)

| Command | Flow | Purpose |
|---|---|---|
| `npm run exchange:join-public` | `login → joinPublicExchangeLeague → createExchangeTeam` | Join public Extreme league + create team |
| `npm run exchange:public-trade` | `login → tradeExchangeAssets` | Buy 2 assets, sell 1, verifying with portfolio reads |
| `npm run exchange:public-standings` | `login → getExchangeLeagueDetails → getExchangeTransactions` | Public standings + transaction history |

## Run order

```text
signup → login → (blitz:owner | exchange:owner)
  → blitz:join / exchange:join (100 guests into 1 host league)
  → lineup / update / portfolio / buy / sell / details / transactions
```

Private joins resolve the host by logging in as `JOIN_HOST_EMAIL`, so the host does not need to be in `data/users.json` (same `PASSWORD` required). Suites needing more unique pool users than available abort with the exact signup command to close the gap.

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `SUITE` | `login` | Suite to run |
| `VUS` / `ITERATIONS` | `1` / `1` | Concurrency / total runs |
| `PASSWORD`, `GRAPHQL_URL`, `API_KEY` | required | Test accounts + endpoint |
| `JOIN_HOST_EMAIL`, `JOIN_INVITE_CODE` | empty | Host league targeting |
| `EMAIL_PREFIX`, `EMAIL_DOMAIN` | `szubair.alam`, `toptal.com` | Signup address |
| `REPORT_DIR` | `reports` | Report output |
| `LOG_RESPONSE_BODIES` | `false` | Log full response bodies (debug only) |

Thresholds every run: `checks > 90%`, `http_req_failed < 10%`, `server_errors_5xx == 0`, `maxDuration 60m`.

## Reports and pool

HTML reports go to `reports/<auth|blitz|exchange>/` with per-user step tables (each step shows its response time in ms), plus Backend Errors (HTTP/GraphQL faults) and Business Errors (intentional skips like exhausted limits) tabs. `data/users.json` is the account pool: league/team/join IDs persist there; read-only and buy/sell suites leave it untouched.
