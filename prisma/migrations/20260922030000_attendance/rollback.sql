-- Undo the attendance marks. The table is additive and nothing else reads
-- it, so dropping it returns the schema exactly to where it was.
DROP TABLE IF EXISTS "attendance_marks";
