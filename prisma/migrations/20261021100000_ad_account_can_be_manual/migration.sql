-- ── AN AD ACCOUNT THAT HAS NOTHING CONNECTED TO IT ──
--
-- «الحساب الاعلاني سواء ع فيس تكتوك سناب … اوتوماتيك او ادخال يدوي بالكامل.
-- اريد الخيارين» — the owner, 21/10.
--
-- An ad account could only exist as a CONNECTION: `token_encrypted` was NOT
-- NULL, so a seller who did not want to hand a token over had campaigns and
-- typed spend but no account to put them under. A MANUAL account is the same
-- row with no token: a platform, a name, optionally the platform's own id.
--
-- TWO STATEMENTS, AND NEITHER WRITES A ROW.
--
--   1. DROP NOT NULL — relaxes a constraint. Every existing row holds a
--      token and keeps it.
--   2. A CHECK that pairs the token with the status:
--
--          ("status" = 'MANUAL') = ("token_encrypted" IS NULL)
--
--      so a manual account cannot be holding a stale secret nobody remembers
--      to rotate, and a connected one cannot be missing the token the nightly
--      sync is about to decrypt. It holds for every row that exists today
--      (status is CONNECTED or ERROR, the token is present: false = false),
--      so adding it validates and changes nothing. Prisma has no syntax for a
--      CHECK, so it lives only here — like the partial unique indexes.
--
-- Reversible by dropping the constraint and, only if no row is MANUAL,
-- `ALTER TABLE "ad_accounts" ALTER COLUMN "token_encrypted" SET NOT NULL;`
-- — on an explicit instruction, since by then manual accounts may exist.
--
-- Hand-written and applied with `prisma db execute`, then recorded with
-- `prisma migrate resolve --applied` — never `prisma migrate dev`.
ALTER TABLE "ad_accounts" ALTER COLUMN "token_encrypted" DROP NOT NULL;

ALTER TABLE "ad_accounts"
  ADD CONSTRAINT "ad_accounts_manual_iff_no_token"
  CHECK (("status" = 'MANUAL') = ("token_encrypted" IS NULL));
