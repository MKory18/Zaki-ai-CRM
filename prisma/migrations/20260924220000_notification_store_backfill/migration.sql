-- PERSONAL CHANGE-REQUEST NOTIFICATIONS FROM BEFORE STAGE 17 GET THEIR STORE.
--
-- Before stage 17 a raised change request was sent, one row per person, to
-- every admin, manager and confirmation supervisor in the company, with no
-- store on the row. The bell now shows a person's rows for the selected
-- store (or rows with no store), so those old rows appeared in every store
-- a store-limited supervisor opened — a store-B order number and its
-- requester's reason, in store A.
--
-- The title names the order («طلب تعديل على <orderNumber>»), and the order
-- knows its store. This fills that in; nothing else changes and nothing is
-- removed. Rows whose order cannot be found keep no store.
UPDATE "notifications" AS n
SET "storeId" = o."storeId"
FROM "orders" AS o
WHERE n."userId" IS NOT NULL
  AND n."storeId" IS NULL
  AND n."title" LIKE 'طلب تعديل على %'
  AND o."companyId" = n."companyId"
  AND o."storeId" IS NOT NULL
  AND o."orderNumber" = substring(n."title" FROM char_length('طلب تعديل على ') + 1);
