-- «أظهِر في المتجر».
--
-- A landing page belongs to a store already (`storeId`), but belonging is
-- not the same as being shown: a seller keeps pages for one campaign, for
-- one audience, for a test. Listing every page a store owns would put the
-- half-finished ones in the shop window.
--
-- Default FALSE, and the page's own screen turns it on. A published page is
-- not automatically a shop page — being reachable by its link is exactly
-- what a campaign page is for.
ALTER TABLE "landing_pages"
  ADD COLUMN "showInStore" BOOLEAN NOT NULL DEFAULT false;

-- The storefront asks «this store's pages, shown, published» on every render
-- of a catalogue block.
CREATE INDEX "landing_pages_storeId_showInStore_idx"
  ON "landing_pages" ("storeId", "showInStore");
