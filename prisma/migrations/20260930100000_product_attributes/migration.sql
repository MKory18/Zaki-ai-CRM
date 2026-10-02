-- What kind of thing this is, written per category.
--
-- The questions on the category, the answers on the product. Both
-- nullable with no default: a category that describes nothing and a
-- product that answers nothing behave exactly as they do today.
-- Additive only — nothing is dropped and no stored value is rewritten.
ALTER TABLE "categories" ADD COLUMN "attributeSchema" TEXT;
ALTER TABLE "products" ADD COLUMN "attributes" TEXT;
