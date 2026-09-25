-- EACH PERSON'S OWN HOURS.
--
-- Lateness was measured against the COUNTRY's work hours, so somebody whose
-- shift genuinely starts at noon read as three hours late every single day,
-- and every figure built on that was wrong in the same direction.
--
-- All three columns are NULL by default and NULL means "the country's" —
-- so nothing changes for anybody until somebody sets a shift on purpose.
ALTER TABLE "users" ADD COLUMN "shift_start" VARCHAR(5);
ALTER TABLE "users" ADD COLUMN "shift_end" VARCHAR(5);
-- Comma-separated weekday numbers (0 = Sunday … 6 = Saturday). Their rest
-- days, which are not always the country's: a night shift rests midweek.
ALTER TABLE "users" ADD COLUMN "rest_days" TEXT;
