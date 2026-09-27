-- A PASSKEY: the fingerprint or the face on the device already in the hand.
--
-- It stands in for the six-digit code, never for the password. A phone that
-- is picked up is a second factor that is already lost, and the password is
-- what keeps a stolen phone from being an open account.
--
-- `publicKey` is the SPKI the browser itself hands over at registration —
-- there is no secret here to steal. A copy of this table lets somebody
-- VERIFY a signature; it never lets them produce one.
CREATE TABLE "passkeys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    -- The credential id the authenticator returns, base64url, as the browser
    -- sends it. Unique across the table: one physical key, one row.
    "credentialId" TEXT NOT NULL,
    -- SPKI DER, base64. Public by definition.
    "publicKey" TEXT NOT NULL,
    -- COSE algorithm the authenticator signed with (-7 = ES256, -257 = RS256).
    "algorithm" INTEGER NOT NULL,
    -- What the person will recognise it by: «آيفون العمل».
    "label" TEXT,
    -- The authenticator's own counter. A value that fails to advance is the
    -- signature a cloned key produces, and it is refused.
    "counter" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passkeys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "passkeys_credentialId_key" ON "passkeys"("credentialId");
CREATE INDEX "passkeys_userId_idx" ON "passkeys"("userId");

ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The challenge the server issued, and which ceremony it was for. A
-- signature over a challenge we did not issue is a replay, so the challenge
-- is stored, spent once, and expires.
CREATE TABLE "passkey_challenges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passkey_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "passkey_challenges_userId_kind_idx" ON "passkey_challenges"("userId", "kind");

ALTER TABLE "passkey_challenges" ADD CONSTRAINT "passkey_challenges_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
