# CrowdSpark Growth Center

A festival growth command center for **Challenge A: Attendee Growth**: a dashboard on the supplied attendee dataset, a campaign and task manager, a next-festival forecast, and an AI copilot (Google Gemini) that answers from the same calculations and turns insights into tasks.

## What's inside

| Page | What it does |
|---|---|
| **Dashboard** | KPIs vs the targets in force on any date (identified, registered, verified external visitors, spend vs budget, cost per visitor), progress charts, funnel, registration status, sortable campaign table, rule-based insights. Date picker = end of day IST; nothing later leaks in. |
| **Campaigns** | Plan status, owner, budget and notes per campaign, next to last cycle's performance. Add custom campaigns. Budget headroom vs the ₹3L ceiling and ₹35k gated reserve. |
| **Tasks** | Kanban of owned tasks with due dates; copilot-proposed tasks land here after you confirm them. |
| **Plan & forecast** | Capacity model (colleges × productivity, ambassadors × productivity, referrals per seed, capped paid, organic carry-over) × historical show-up. Edit and save inputs; see break-even and sensitivity. |
| **Data & rules** | Upload an edited copy of the workbook as **Working data** (the original stays untouched), see cleaning counts, calculation rules, and what the data cannot answer. |
| **Copilot panel** | Gemini with function calling over the metric engine; cites its source; says when data can't answer; proposes tasks/plan/campaign changes that you confirm. |

## How numbers are calculated (from the dataset's field guide)

1. A selected date = end of that day in IST; no later record appears.
2. Rows repeated with the same stable ID are counted once (2 daily rows, 4 history rows, 20 check-ins).
3. Attendance = distinct **external** people with an **admitted + verified** check-in (repeat entries counted once; denied, pending, unverified, internal/staff/test excluded).
4. Registration status = latest history version at the date.
5. Targets = version in force at the date (launch plan from 15 Jan; revised plan from 15 Mar).
6. Spend = net posted INR (credits negative).
7. Attribution = each person's fixed first campaign (association, not causal lift).

Final snapshot check: 3,625 identified · 2,800 registered · **2,050 verified visitors** (1,925 campaign + 125 walk-ins) vs 2,200 goal · ₹2,74,000 spent of ₹3,00,000 · 575 confirmed registrants without a verified admission.

## Deploy (about 15 minutes, all free)

### 1. Get a Gemini API key
1. Go to **https://aistudio.google.com/apikey** and sign in with a Google account.
2. Click **Create API key** → copy it (starts with `AIza…`). Keep it private.

### 2. Put the code on GitHub
1. Create a new repository at **https://github.com/new** (e.g. `crowdspark-growth-center`, Public or Private). Don't add a README.
2. On the empty repo page click **uploading an existing file**, then drag in **everything inside** the unzipped `crowdspark-growth-center` folder (the `app`, `components`, `lib`, `data`, `tests` folders and the files `package.json`, `package-lock.json`, `next.config.mjs`, `tsconfig.json`, `README.md`, `.gitignore`, `.env.example`). Commit.
   - Hidden files like `.gitignore` may not show in your file browser; that's fine.

### 3. Deploy on Vercel
1. Go to **https://vercel.com/new**, sign in with GitHub, and **Import** the repository. Framework: Next.js (auto-detected). Don't change build settings.
2. Before clicking Deploy, open **Environment Variables** and add:
   - `GEMINI_API_KEY` = your key
   - (optional) `GEMINI_MODEL` = `gemini-3.8-flash` (default). If Google retires it, set the current Flash model name from https://ai.google.dev/gemini-api/docs/models.
3. Click **Deploy**.

### 4. Add the database (so edits persist)
1. In the Vercel project, open **Storage** → **Create Database** → choose **Neon (Postgres)** → free plan → **Connect** to this project (all environments).
   This adds `DATABASE_URL` automatically. (Supabase also works: paste its connection string as `DATABASE_URL`.)
2. Go to **Deployments** → latest → **⋯ → Redeploy** so the app picks up the database.
3. Tables are created and seeded on first use. The yellow "running without a database" banner disappears.

### 5. Check it works
- Dashboard shows **2,050** verified external visitors at the Final date.
- Ask the copilot: "Which campaign drove the most verified attendance, and at what cost?"
- Ask: "Which college sent the most attendees?" → it should say the data has no college field and offer an alternative.
- Ask: "Create a task to recruit more ambassadors" → a proposal card appears → **Confirm** → it shows on Tasks.

## Run locally (optional)
```bash
npm install
cp .env.example .env.local   # add your GEMINI_API_KEY; DATABASE_URL optional
npm run dev                   # http://localhost:3000
npm test                      # 14 checks: metrics, leakage, changed data, plan, copilot tools, Gemini loop
```
Without `DATABASE_URL`, edits go to a temporary local file.

## Known limitations
- Free Gemini tier has rate limits; the copilot says so and asks you to retry.
- Uploaded workbooks must keep the original sheet and column names (max ~4.4 MB, Vercel's request limit).
- Forecasts use historical attributed rates; they are planning assumptions, not proof of incremental lift.
- The dataset is fictional (CampusFest 2025); no college/city, reason codes or unique cross-platform reach exist.
- The npm `xlsx` 0.18.5 package has a published advisory for untrusted files; acceptable for a reviewer demo (only trusted people upload). For production, install SheetJS from its CDN build.

## Tech
Next.js 15 (App Router) · TypeScript · Recharts · SheetJS (xlsx parsing) · Postgres (`postgres` driver; Neon/Supabase) · Google Gemini REST API with function calling.
