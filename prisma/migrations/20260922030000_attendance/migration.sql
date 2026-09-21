-- THE FINGERPRINT (additive)
--
-- A manager needs to know who came, when, and for how long — and the system
-- already half knew. Every claim, every status change and every login is
-- stamped with a moment; what was missing was a record of ARRIVING, and any
-- way to tell "present" apart from "working".
--
-- So two kinds of mark share one append-only table:
--
--   AUTO    the login. Signing in IS the fingerprint, and since an account
--           opens on one device at a time, it is a mark that cannot be
--           pressed from somebody else's phone.
--   MANUAL  the "استلمت" / "سلّمت" buttons, for the hours that leave no
--           trace in the order records: a meeting, a training, a shift
--           spent waiting for a queue that stayed empty.
--
-- Nothing derived is stored. Hours worked, lateness and the count of late
-- days are computed from these moments and the country's work hours, so a
-- change to the shift never leaves a stale number behind.
--
-- Append-only on purpose: a corrected attendance record is a new mark with
-- a note, never an edited one. The row that says when somebody arrived is
-- the kind of row people have reasons to change.

CREATE TABLE IF NOT EXISTS "attendance_marks" (
  "id"        TEXT NOT NULL,
  -- Null for a platform-level account, which belongs to no company.
  "companyId" TEXT,
  "userId"    TEXT NOT NULL,
  -- LOGIN | CHECK_IN | CHECK_OUT
  "kind"      TEXT NOT NULL,
  -- AUTO (the system saw it) | MANUAL (somebody pressed it)
  "source"    TEXT NOT NULL DEFAULT 'AUTO',
  "at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_marks_pkey" PRIMARY KEY ("id")
);

-- The one query this table exists to answer: this company's people over a
-- span of days, in order.
CREATE INDEX IF NOT EXISTS "attendance_marks_companyId_at_idx"
  ON "attendance_marks" ("companyId", "at");
CREATE INDEX IF NOT EXISTS "attendance_marks_userId_at_idx"
  ON "attendance_marks" ("userId", "at");

DO $$ BEGIN
  ALTER TABLE "attendance_marks"
    ADD CONSTRAINT "attendance_marks_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Restrict, not cascade: deleting a user must not quietly erase the record
-- of the days they worked.
DO $$ BEGIN
  ALTER TABLE "attendance_marks"
    ADD CONSTRAINT "attendance_marks_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
