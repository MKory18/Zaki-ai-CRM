-- HOW A DIFFERENCE AT MATCHING WAS SETTLED.
--
-- «عند المطابقة في فرق… وزر ترحيل على اعتماد. ممكن عادي صار خصم، بس يعتمد
-- رقم الشركة. وإذا غير معتمد أنا رح أتواصل مع الشركة وخط اعتماد رقمنا، وهي
-- بتعتمد رقمنا. بس بضل الطلب معلّم.»
--
-- Until now a mismatched line was a red row and nothing else: nobody could
-- record WHY the courier's figure differed, so the same difference was
-- re-read and re-argued at every statement, and the commonest cause — an
-- agent agreed a discount on the phone and wrote it in the order's internal
-- notes — left no trace anywhere a finance screen could count.
--
-- Two resolutions, and the order stays marked under both. `resolvedById` and
-- `resolvedAt` already existed on this table and were never written by
-- anything; they are what this completes.
ALTER TABLE "settlement_matches" ADD COLUMN "resolution" TEXT;
ALTER TABLE "settlement_matches" ADD COLUMN "resolutionNote" TEXT;

-- Counting them per person is the point of recording them: «في إحصائيات على
-- هاد الشي». The index carries the company so a shop's own rows are one scan.
CREATE INDEX "settlement_matches_companyId_resolution_idx"
  ON "settlement_matches" ("companyId", "resolution");
