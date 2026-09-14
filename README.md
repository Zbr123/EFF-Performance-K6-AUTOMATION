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
```

**Option B — npm shortcuts** (canned commands, see `package.json`)

```powershell
npm run signup             # create 1 account
npm run login              # login 1 pool user
npm run delete             # login + delete 1 pool user
npm run lifecycle          # create + delete 1 account in one iteration

npm run signup -- -e VUS=5 -e ITERATIONS=20    # pass extra args like this
```

The `login` and `delete-accounts` suites are `uniqueUsers: true` — `ITERATIONS` can't exceed how many rows are in `data/users.json`. If it does, the run aborts in `setup()` and tells you exactly how many more to create.

---

## Scenarios and suites (the important part)

A **scenario** is one atomic journey (`scenarios/*.scenario.js`). A **suite** is a named list of scenarios (`config/suites.config.js`). Each k6 iteration runs the suite's scenarios as a **chain**: scenario 2 receives whatever scenario 1 produced.

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

The whole chain reports as **one** user with globally numbered steps — `full-lifecycle` shows steps 1–5, not two separate 4-step and 1-step results. If any scenario fails, the rest of the chain is skipped and every remaining step is recorded as `SKIP`.

### What each scenario needs and gives

| Scenario | Needs | Gives |
|---|---|---|
| `signup` | nothing (creates its own identity) | `email`, `username`, `userId`, `token` |
| `login` | `ctx.user`, `ctx.password` | `email`, `username`, `userId`, `token` |
| `deleteAccounts` | `token`, `email` | `deleted` |

### Adding a new scenario

1. Add the GraphQL wrappers under `graphql/` (suffixed `.graphql.js`).
2. Add `scenarios/<name>.scenario.js` exporting:
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

A future `createTeam` would read `ctx.data.token` and `ctx.data.leagueId`, then write `ctx.data.teamId` for whatever comes next.

### Adding a new combination

Only add a suite entry — no new files:

```js
'full-blitz': {
  name: 'full-blitz',
  scenarios: ['login', 'createLeague', 'createTeam', 'setLineup'],
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
| `SUITE` | `login` | `signup`, `login`, `delete-accounts`, `full-lifecycle` |
| `VUS` | `1` | concurrent virtual users |
| `ITERATIONS` | `1` | total journeys, shared across the VUs |
| `PASSWORD` | *(required)* | must meet the API's password rules |
| `GRAPHQL_URL` | *(required)* | test AppSync endpoint |
| `API_KEY` | *(required)* | test API key |
| `REPORT_DIR` | `reports` | where the HTML/JSON output goes |
| `EMAIL_PREFIX` | `szubair.alam` | plus-address local part used at signup |
| `EMAIL_DOMAIN` | `toptal.com` | signup email domain |

---

## Reports (written after every run)

- `reports/<suite>-report-latest.html` — open this one for a quick look
- `reports/<suite>-report-<timestamp>.html` — a permanent copy of the same report
- `reports/<suite>-users-<timestamp>.json` — the same data as structured JSON
- `data/users.json` — `signup` adds users, `delete-accounts` removes them

The HTML report shows, per user, every step's PASS/FAIL/SKIP status, the failure category (validation vs 5xx vs Lambda timeout vs network), and a plain-English "likely cause" — plus separate tables for 5xx errors vs business/API errors.
