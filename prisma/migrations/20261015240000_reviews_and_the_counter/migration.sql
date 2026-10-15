-- THE REVIEWS AND THE COUNTER — owner decision D8, design docs/storefront/AUDIT.md §7.6.
--
-- Every piece of social proof and urgency has two sources, chosen per
-- product: يدوي · تلقائي · الاتنين. The seller starts manual, and automatic
-- takes over as real data arrives.
--
-- ── NOT ONE EXISTING ROW IS TOUCHED ──
--
-- One CREATE TABLE and one NULLABLE column with no default. An
-- `ADD COLUMN … DEFAULT 'manual'` would have written a value into every
-- product that exists; this writes into none, and NULL READS AS 'manual'
-- in `src/lib/product-reviews.ts` — which is the honest default, because a
-- product with no reviews has nothing automatic to show.
--
-- rollback.sql sits beside this file and undoes exactly these three
-- statements, in the reverse order.

-- ── #1 · product_reviews ──
--
-- No review or rating model existed anywhere in this schema's 66 tables.
--
-- WHY `order_id` IS NULLABLE AND UNIQUE AT THE SAME TIME. Two kinds of row
-- live here and the column is what tells them apart:
--
--   order_id IS NOT NULL  a VERIFIED review — one rating, from the person
--                         whose delivered order it is. It earns
--                         «مشتري مؤكَّد».
--   order_id IS NULL      a MANUAL item the seller transcribed from
--                         WhatsApp, a Facebook comment or a phone call. It
--                         can NEVER earn that badge, and the absence of an
--                         order is the enforcement — not a flag somebody
--                         could set.
--
-- So the uniqueness has to be PARTIAL. A plain `UNIQUE (order_id)` would
-- let every manual row through (Postgres counts each NULL as distinct) and
-- would therefore look like it did the job while doing it — but the
-- scoping matters the other way too: it is the whole of «a link works
-- once». The rating link carries no stored token; it is an HMAC over the
-- order id, and SINGLE USE IS THIS INDEX. A second submission with a
-- perfectly valid link hits a unique violation, which is a loud refusal
-- rather than a second opinion from one buyer.
--
-- `product_reviews_order_key` is NAMED in schema.prisma beside the model,
-- because `a-rule-the-schema-hides.test.ts` holds this repository to it:
-- a constraint the database keeps and the schema never mentions is a
-- constraint the next reader reasons their way around.
CREATE TABLE "product_reviews" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "store_id"      TEXT,
  "product_id"    TEXT NOT NULL,
  "order_id"      TEXT,
  "rating"        INTEGER NOT NULL,
  -- THE CUSTOMER'S OWN WORDS, AS TEXT AND ONLY EVER AS TEXT.
  --
  -- Not `rich_text`: every other free field on a page is the SELLER's and
  -- goes through src/lib/rich-text.ts, which keeps a small allowlist of
  -- tags. This column holds what a stranger typed into a public form, and
  -- the renderer puts it in as a React text child so the markup question
  -- never arises. It is DATA, never an instruction — not to a renderer and
  -- not to a model.
  "text"          TEXT,
  -- First name and city, and nothing else. There is nowhere here to put a
  -- phone, an address or a full name, which is how the privacy promise is
  -- kept: the column does not exist.
  "first_name"    TEXT,
  "city"          TEXT,
  -- WHERE IT CAME FROM: order | whatsapp | facebook | call | other
  "source"        TEXT NOT NULL,
  -- PENDING | PUBLISHED | HIDDEN
  "status"        TEXT NOT NULL DEFAULT 'PENDING',
  -- The tick on the rating page. A review with no consent is never shown,
  -- whatever its status says, and the two are kept apart on purpose: a
  -- moderator may publish, and may not consent on somebody's behalf.
  "consent"       BOOLEAN NOT NULL DEFAULT false,
  "published_at"  TIMESTAMP(3),
  -- Hiding is for abuse, personal data or off-topic — and it carries the
  -- reason, because «hidden» with no reason is a seller deleting a three
  -- star and calling it moderation.
  "hidden_reason" TEXT,
  "hidden_by_id"  TEXT,
  "hidden_at"     TIMESTAMP(3),
  -- An optional private proof image for a manual item (a screenshot of the
  -- WhatsApp message). NEVER rendered publicly — it is somebody's chat.
  "proof_image"   TEXT,
  "created_by_id" TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "product_reviews_pkey" PRIMARY KEY ("id"),
  -- One to five. A rating outside it is not an opinion, it is a bad caller.
  CONSTRAINT "product_reviews_rating_range" CHECK ("rating" >= 1 AND "rating" <= 5)
);

CREATE UNIQUE INDEX "product_reviews_order_key"
  ON "product_reviews" ("order_id")
  WHERE "order_id" IS NOT NULL;

CREATE INDEX "product_reviews_product_status_idx"
  ON "product_reviews" ("product_id", "status");

CREATE INDEX "product_reviews_company_status_idx"
  ON "product_reviews" ("companyId", "status");

CREATE INDEX "product_reviews_store_idx"
  ON "product_reviews" ("store_id");

ALTER TABLE "product_reviews"
  ADD CONSTRAINT "product_reviews_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_reviews"
  ADD CONSTRAINT "product_reviews_store_id_fkey"
  FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "product_reviews"
  ADD CONSTRAINT "product_reviews_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL and not CASCADE: an order removed from the system does not
-- retract a rating its customer gave. The row loses its badge — the badge
-- is bound to the order id — and keeps being a review somebody wrote.
ALTER TABLE "product_reviews"
  ADD CONSTRAINT "product_reviews_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "product_reviews"
  ADD CONSTRAINT "product_reviews_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "product_reviews"
  ADD CONSTRAINT "product_reviews_hidden_by_id_fkey"
  FOREIGN KEY ("hidden_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── #6 · the per-product mode ──
--
-- manual · auto · both, and NULL. The design puts it on the product
-- because the choice is about one product's evidence: a shop may have one
-- article with forty delivered orders and another launched this morning,
-- and a store-wide switch would make the second one lie on behalf of the
-- first.
ALTER TABLE "products" ADD COLUMN "review_mode" TEXT;
