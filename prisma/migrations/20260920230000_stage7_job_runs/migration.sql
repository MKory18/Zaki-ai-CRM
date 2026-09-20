-- Stage 7: the scheduler's run log.
--
-- One row per attempt, so a missed window is visible rather than silent: a
-- job that has not succeeded inside its interval can be seen as overdue, and
-- consecutive failures can be counted and alerted on. Nothing else in the
-- system changes; jobs call the services that already exist.

CREATE TABLE "job_runs" (
    "id"         TEXT NOT NULL,
    "jobName"    TEXT NOT NULL,
    "status"     TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "processed"  INTEGER NOT NULL DEFAULT 0,
    "detail"     TEXT,
    "error"      TEXT,
    "companyId"  TEXT,
    "countryId"  TEXT,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "job_runs_jobName_startedAt_idx" ON "job_runs"("jobName", "startedAt");
CREATE INDEX "job_runs_status_startedAt_idx" ON "job_runs"("status", "startedAt");
