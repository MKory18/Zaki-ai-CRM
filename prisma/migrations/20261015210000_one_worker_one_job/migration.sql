-- One live run per job, enforced by the database instead of by a check.
--
-- `src/lib/jobs/runner.ts` claimed a job by LOOKING for a RUNNING row and
-- then creating one. Two workers a millisecond apart both see no RUNNING
-- row and both create one, so the job runs twice; `job_runs` had no unique
-- index to refuse the second insert.
--
-- It never mattered while one container ran the worker. It starts mattering
-- the moment two do — which the rolling update introduces, because
-- `docker-entrypoint.sh` starts a worker in every container unless
-- RUN_WORKER=false, and during the overlap the new one is up before the old
-- one stops.
--
-- And twice is not harmless for `accrue-commission`,
-- `accrue-period-commission` and `propose-penalties` (they write money), or
-- for `deliver-conversions` and `deliver-app-events` (they report to Meta
-- and TikTok and deliver a signed webhook).

-- ── FIRST, MAKE THE INDEX CREATABLE ──
--
-- A production database may already hold two RUNNING rows for one job: a
-- container killed mid-run leaves its row behind, and the old code then
-- created a second one beside it. `CREATE UNIQUE INDEX` would fail on that,
-- and a migration that cannot apply is a deploy that stops.
--
-- So the stragglers are closed first — and only the stragglers. For each
-- job, every RUNNING row EXCEPT the newest is marked FAILED with the same
-- sentence the runner itself writes when it finds an abandoned row. No
-- business data is touched: `job_runs` is the scheduler's own bookkeeping,
-- and a row that says RUNNING for a process that is gone is already wrong.
UPDATE "job_runs" j
SET "status" = 'FAILED',
    "finishedAt" = NOW(),
    "error" = COALESCE(j."error", 'تُرك دون إنهاء — أُغلق عند تطبيق قيد «تشغيل واحد لكل وظيفة»')
WHERE j."status" = 'RUNNING'
  AND EXISTS (
    SELECT 1 FROM "job_runs" k
    WHERE k."jobName" = j."jobName"
      AND k."status" = 'RUNNING'
      AND (k."startedAt" > j."startedAt" OR (k."startedAt" = j."startedAt" AND k."id" > j."id"))
  );

-- ── THEN THE CLAIM ITSELF ──
--
-- Partial, because a job has many FINISHED runs and only ever one live one:
-- `UNIQUE (jobName)` would forbid the second run of anything, for ever.
CREATE UNIQUE INDEX "job_runs_one_running"
  ON "job_runs" ("jobName") WHERE "status" = 'RUNNING';
