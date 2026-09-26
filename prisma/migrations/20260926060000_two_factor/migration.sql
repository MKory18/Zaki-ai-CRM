-- The second factor, for the roles that move money.
--
-- The secret is stored encrypted with the app key, like a courier's password:
-- a database copy alone must not hand somebody a working authenticator.
-- `totpLastStep` is the 30-second step most recently spent, so a code cannot
-- be replayed inside its own window.
ALTER TABLE "users" ADD COLUMN "totpSecretEnc" TEXT;
ALTER TABLE "users" ADD COLUMN "totpEnabledAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "totpLastStep" INTEGER;

-- One-time codes for a lost phone. Without them an authenticator on a broken
-- phone is an owner locked out of their own business — and that pressure is
-- how a second factor gets switched off for everyone.
CREATE TABLE "two_factor_recovery_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "two_factor_recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "two_factor_recovery_codes_userId_usedAt_idx" ON "two_factor_recovery_codes"("userId", "usedAt");

ALTER TABLE "two_factor_recovery_codes"
  ADD CONSTRAINT "two_factor_recovery_codes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
