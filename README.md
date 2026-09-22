# EFF k6 Performance Framework

A single, reusable k6 project for load-testing the EFF / E3 AppSync GraphQL API. Never write a new script for a new test — add a **scenario**, name it in a **suite**, and run one command.

## How to run

Always run from this folder (`EFF Performance K6 Framework/`) so `reports/` and `data/users.json` resolve correctly.

**Option A — k6 command**

```powershell
cd "EFF Performance K6 Framework"
npx dotenv -- k6 run main.js -e SUITE=signup -e VUS=100 -e ITERATIONS=200
npx dotenv -- k6 run main.js -e SUITE=login -e VUS=100 -e ITERATIONS=200
npx dotenv -- k6 run main.js -e SUITE=delete-accounts -e VUS=100 -e ITERATIONS=200
npx dotenv -- k6 run main.js -e SUITE=full-lifecycle -e VUS=100 -e ITERATIONS=200
npx dotenv -- k6 run main.js -e SUITE=blitz-create-league -e VUS=100 -e ITERATIONS=200
npx dotenv -- k6 run main.js -e SUITE=blitz-create-team -e VUS=100 -e ITERATIONS=200
npx dotenv -- k6 run main.js -e SUITE=blitz-owner-setup -e VUS=100 -e ITERATIONS=200
npx dotenv -- k6 run main.js -e SUITE=blitz-join-league -e VUS=100 -e ITERATIONS=200
npx dotenv -- k6 run main.js -e SUITE=blitz-join-league -e JOIN_HOST_EMAIL="<host-email>" -e VUS=100 -e ITERATIONS=200
npx dotenv -- k6 run main.js -e SUITE=blitz-join-league -e JOIN_INVITE_CODE="<invite-code>" -e VUS=100 -e ITERATIONS=200
npx dotenv -- k6 run main.js -e SUITE=blitz-join-public-league -e VUS=100 -e ITERATIONS=200
npx dotenv -- k6 run main.js -e SUITE=blitz-public-lineup -e VUS=100 -e ITERATIONS=200
npx dotenv -- k6 run main.js -e SUITE=blitz-public-standings -e VUS=100 -e ITERATIONS=200
npx dotenv -- k6 run main.js -e SUITE=blitz-create-lineup -e VUS=100 -e ITERATIONS=200
npx dotenv -- k6 run main.js -e SUITE=blitz-create-lineup -e JOIN_HOST_EMAIL="<host-email>" -e JOIN_INVITE_CODE="<invite-code>" -e VUS=100 -e ITERATIONS=200
npx dotenv -- k6 run main.js -e SUITE=blitz-update-lineup -e VUS=100 -e ITERATIONS=200
npx dotenv -- k6 run main.js -e SUITE=blitz-update-lineup -e JOIN_HOST_EMAIL="<host-email>" -e JOIN_INVITE_CODE="<invite-code>" -e VUS=100 -e ITERATIONS=200
npx dotenv -- k6 run main.js -e SUITE=blitz-get-lineup -e VUS=100 -e ITERATIONS=200
npx dotenv -- k6 run main.js -e SUITE=blitz-get-lineup -e JOIN_HOST_EMAIL="<host-email>" -e JOIN_INVITE_CODE="<invite-code>" -e VUS=100 -e ITERATIONS=200
npx dotenv -- k6 run main.js -e SUITE=blitz-league-details -e VUS=100 -e ITERATIONS=200
npx dotenv -- k6 run main.js -e SUITE=blitz-league-details -e JOIN_HOST_EMAIL="<host-email>" -e JOIN_INVITE_CODE="93jdc9" -e VUS=100 -e ITERATIONS=200
npx dotenv -- k6 run main.js -e SUITE=blitz-league-results -e VUS=100 -e ITERATIONS=200
npx dotenv -- k6 run main.js -e SUITE=blitz-league-results -e JOIN_HOST_EMAIL="<host-email>" -e JOIN_INVITE_CODE="<invite-code>" -e VUS=100 -e ITERATIONS=200
```

**Option B — npm shortcuts** (canned commands, see `package.json`)

```powershell
npm run signup             # create 1 account
npm run login              # login 1 pool user
npm run delete             # login + delete 1 pool user
npm run lifecycle          # create + delete 1 account in one iteration
npm run blitz:league       # login + create private Blitz league (saves leagueId on the pool user)
npm run blitz:team         # login + create owner team in that user's existing private league
npm run blitz:owner        # login + new private league + owner team (for users without a league yet)
npm run blitz:join         # remaining pool users join a host league, then create a team there
npm run blitz:join-public  # pool users join the public Extreme Blitz league, then create a team there
npm run blitz:public-lineup  # those public-league teams: createBlitzLineup, then update all 9 slots
npm run blitz:public-standings  # public league: details (FirstHalf/SecondHalf/Championship) then getLeagueResultsByWeek
npm run blitz:lineup       # owned-team lineup; pass JOIN_HOST_EMAIL + JOIN_INVITE_CODE to target a host league
npm run blitz:update       # create lineup if needed, then fill all 9 slots from live eligible catalogs
npm run blitz:get-lineup   # login, getBlitzTeams, getCurrentWeekBlitzLineup for the pinned league team
npm run blitz:league-details  # login, getBlitzLeague, one standings API from setup getEFFTimeframe + league size
npm run blitz:league-results  # login, getLeagueResultsByWeek for the current EFF week from setup timeframe

npm run signup -- -e VUS=5 -e ITERATIONS=20    # pass extra args like this
```

The `login` and `delete-accounts` suites are `uniqueUsers: true` — `ITERATIONS` can't exceed how many rows are in `data/users.json`. If it does, the run aborts in `setup()` and tells you exactly how many more to create.

---

## Scenarios and suites (the important part)

A **scenario** is one atomic journey (`scenarios/<domain>/*.scenario.js`). A **suite** is a named list of scenarios (`config/suites.config.js`). Each k6 iteration runs the suite's scenarios as a **chain**: scenario 2 receives whatever scenario 1 produced.

```
signup ──► deleteAccounts
  ctx.data.token    uses ctx.data.token
  ctx.data.email    uses ctx.data.email
```

That is why combining features never needs a new file. The same `deleteAccounts` scenario serves two suites; only the scenario in front of it changes:

| Suite | Chain |
|---|---|
| `signup` | `signup` |
| `login` | `login` |
| `delete-accounts` | `login` → `deleteAccounts` |
| `full-lifecycle` | `signup` → `deleteAccounts` |
| `blitz-create-league` | `login` → `createBlitzLeague` |
| `blitz-create-team` | `login` → `createBlitzTeam` |
| `blitz-owner-setup` | `login` → `createBlitzLeague` → `createBlitzTeam` |
| `blitz-join-league` | `login` → `joinPrivateBlitzLeague` → `createBlitzTeam` |
| `blitz-join-public-league` | `login` → `joinPublicBlitzLeague` → `createBlitzTeam` |
| `blitz-public-lineup` | `login` → `createBlitzLineup` → `updateBlitzLineup` (public Extreme league team) |
| `blitz-public-standings` | `login` → `getBlitzLeagueDetails` → `getLeagueResultsByWeek` (public Extreme; FirstHalf/SecondHalf/Championship only) |
| `blitz-create-lineup` | `login` → `createBlitzLineup` |
| `blitz-update-lineup` | `login` → `createBlitzLineup` → `updateBlitzLineup` |
| `blitz-get-lineup` | `login` → `getCurrentWeekBlitzLineup` |
| `blitz-league-details` | `login` → `getBlitzLeagueDetails` |
| `blitz-league-results` | `login` → `getLeagueResultsByWeek` |

The whole chain reports as **one** user with globally numbered steps — `full-lifecycle` shows steps 1–5, not two separate 4-step and 1-step results. If any scenario fails, the rest of the chain is skipped and every remaining step is recorded as `SKIP`.

### What each scenario needs and gives

| Scenario | Needs | Gives |
|---|---|---|
| `signup` | nothing (creates its own identity) | `email`, `username`, `userId`, `token` |
| `login` | `ctx.user`, `ctx.password` | `email`, `username`, `userId`, `token` |
| `deleteAccounts` | `token`, `email` | `deleted` |
| `createBlitzLeague` | `token` | `blitzLeagueId`, `blitzLeagueName` |
| `createBlitzTeam` | `token`, `blitzLeagueId` | `blitzTeamId`, `blitzTeamName` |
| `joinPrivateBlitzLeague` | `token`, `blitzInviteCode` | `blitzLeagueId`, `blitzJoinedLeagueId` |
| `joinPublicBlitzLeague` | `token`, public Extreme league from `getPublicBlitzLeagues` | `getPublicBlitzLeagues` then join; `blitzLeagueId`, `blitzJoinedLeagueId` |
| `createBlitzLineup` | `token`, owned `teamId`, host-league team when email+invite are set, or public Extreme joined team | `blitzLineupWeek` |
| `updateBlitzLineup` | `token`, same team, existing weekly lineup | fills QB RB1 RB2 WR1 WR2 TE K OFF DEF from live catalogs |
| `getCurrentWeekBlitzLineup` | `token`, target league from email+invite or owned team | `getBlitzTeams` then current-week lineup |
| `getBlitzLeagueDetails` | `token`, target `League_ID`, `getEFFTimeframe` from setup | `getBlitzLeague` then one of RegularSeason (≤3 members) or FirstHalf / SecondHalf / Championship (4+ / public) |
| `getLeagueResultsByWeek` | `token`, target `League_ID`, current EFF week from setup | weekly standings for that week |

### Adding a new scenario

1. Add the GraphQL wrappers under `graphql/` (suffixed `.graphql.js`).
2. Add `scenarios/<domain>/<name>.scenario.js` exporting:
   - `steps` — ordered `{ key, label }` list (no numbers; `core/chain.runner.js` assigns them)
   - `run(ctx)` — returns `true` to continue the chain, `false` to stop it
3. Register it in the `SCENARIOS` map in `main.js` (one line).
4. Add or extend a suite in `config/suites.config.js`.

Inside `run(ctx)` you get:

| Field | Meaning |
|---|---|
| `ctx.flow` | the shared flow for this iteration — pass it to `recordStep` |
| `ctx.step(key)` | the numbered step definition for one of your `steps` |
| `ctx.user` | the pool user (`null` when the suite has `requirePool: false`) |
| `ctx.password` | the pool password |
| `ctx.data` | the bag that travels down the chain — read inputs, write outputs |

`createBlitzTeam` reads `ctx.data.token` and `ctx.data.blitzLeagueId`, then writes `ctx.data.blitzTeamId`.

### Adding a new combination

Only add a suite entry — no new files:

```js
'full-blitz': {
  name: 'full-blitz',
  scenarios: ['login', 'createBlitzLeague', 'createBlitzTeam', 'createBlitzLineup'],
  requirePool: true,
  uniqueUsers: true,
  writePool: false,
  removeFromPool: false,
  executor: 'shared-iterations',
},
```

---

## VUs and iterations

`VUS` is how many users hit the API **at the same time** — that is the real load number. `ITERATIONS` is the **total** number of journeys, shared across those VUs.

| Setting | What happens |
|---|---|
| `VUS=1 ITERATIONS=5` | one user, five journeys back to back |
| `VUS=10 ITERATIONS=10` | ten users at once, one journey each |
| `VUS=10 ITERATIONS=50` | ten at once, each doing five journeys |
| `VUS=10 ITERATIONS=1` | only one journey runs — nine VUs sit idle |

Keep `ITERATIONS` at or above `VUS`, otherwise some VUs never get work.

---

## Environment variables

Copy `.env.example` to `.env` and fill it in, or pass `-e KEY=value` on the command line — both work. The npm scripts use `dotenv-cli` to load `.env` before running k6 (k6 cannot read `.env` files by itself).

| Variable | Default | Meaning |
|---|---|---|
| `SUITE` | `login` | `signup`, `login`, `delete-accounts`, `full-lifecycle`, `blitz-create-league`, `blitz-create-team`, `blitz-owner-setup`, `blitz-join-league`, `blitz-join-public-league`, `blitz-public-lineup`, `blitz-public-standings`, `blitz-create-lineup`, `blitz-update-lineup`, `blitz-get-lineup`, `blitz-league-details`, `blitz-league-results` |
| `VUS` | `1` | concurrent virtual users |
| `ITERATIONS` | `1` | total journeys, shared across the VUs |
| `PASSWORD` | *(required)* | must meet the API's password rules |
| `GRAPHQL_URL` | *(required)* | test AppSync endpoint |
| `API_KEY` | *(required)* | test API key |
| `REPORT_DIR` | `reports` | root for HTML reports (`reports/auth`, `reports/blitz`, `reports/exchange`) |
| `EMAIL_PREFIX` | `szubair.alam` | plus-address local part used at signup |
| `EMAIL_DOMAIN` | `toptal.com` | signup email domain |
| `JOIN_HOST_EMAIL` | *(empty)* | join: pool host. lineup: pass with `JOIN_INVITE_CODE` to target that account's league (any email, not hardcoded) |
| `JOIN_INVITE_CODE` | *(empty)* | join: league if host is out of pool. lineup: required with host email when that account may own multiple leagues |

---

## Reports (written after every run)

Reports land under `reports/<domain>/`. JSON dumps are not written — the HTML already has the full user/step/error view.

| Path | Meaning |
|---|---|
| `reports/auth/<suite>-latest.html` | last auth run (signup, login, delete-accounts, full-lifecycle) |
| `reports/blitz/<suite>-latest.html` | last Blitz run (`create-league`, `public-lineup`, …) |
| `reports/exchange/<suite>-latest.html` | reserved for Exchange suites |
| `reports/<domain>/<suite>-<timestamp>.html` | dated copy of the same report |

`data/users.json` is the account pool, not a report — `signup` adds users, `delete-accounts` removes them, `blitz-create-league` stores `blitz.leagueId`, `blitz-create-team` stores `blitz.teamId`, `blitz-join-league` and `blitz-join-public-league` store `blitz.joinedLeagueId` / `blitz.joinedTeamId` without overwriting the user's own league, `blitz-create-lineup` / `blitz-public-lineup` store `blitz.lineupWeek`.

The HTML report shows, per user, every step's PASS/FAIL/SKIP status, the failure category (validation vs 5xx vs Lambda timeout vs network), and a plain-English "likely cause" — plus separate tables for 5xx errors vs business/API errors.
