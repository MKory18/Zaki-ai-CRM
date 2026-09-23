-- Typefaces a seller uploaded, scoped to the store that owns them.
--
-- Per store and not per company: a font is licensed to a brand and often to
-- a domain, and a licence bought for one storefront is not a licence for
-- the next. The same isolation rule every other store-owned table follows.
CREATE TABLE IF NOT EXISTS "store_fonts" (
    "id"          TEXT NOT NULL,
    "company_id"  TEXT NOT NULL,
    "store_id"    TEXT NOT NULL,
    "key"         TEXT NOT NULL,
    "label"       TEXT NOT NULL,
    "family"      TEXT NOT NULL,
    "weight"      INTEGER NOT NULL DEFAULT 400,
    "italic"      BOOLEAN NOT NULL DEFAULT false,
    "storage_key" TEXT NOT NULL,
    "size_bytes"  INTEGER NOT NULL,
    "format"      TEXT NOT NULL,
    -- The licence text the designer embedded in the font file, so the panel
    -- can show the seller what it says before they publish with it.
    "notice"      TEXT,
    "restricted"  BOOLEAN NOT NULL DEFAULT false,
    "attested_by" TEXT,
    "attested_at" TIMESTAMP(3),
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_fonts_pkey" PRIMARY KEY ("id")
);

-- One file per weight per style per family per store. A second upload of
-- the same weight replaces it rather than quietly shadowing it in CSS.
CREATE UNIQUE INDEX IF NOT EXISTS "store_fonts_company_store_key_weight_italic_key"
    ON "store_fonts"("company_id", "store_id", "key", "weight", "italic");

CREATE INDEX IF NOT EXISTS "store_fonts_company_store_idx"
    ON "store_fonts"("company_id", "store_id");

ALTER TABLE "store_fonts" ADD CONSTRAINT "store_fonts_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "store_fonts" ADD CONSTRAINT "store_fonts_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
