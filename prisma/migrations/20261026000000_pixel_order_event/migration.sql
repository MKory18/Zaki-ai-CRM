-- «شو الهدف الي بدك التحويل عليه»: what an order is reported as on each pixel, and two events a seller may switch off.
-- Additive only, with defaults equal to today's behaviour (Purchase, both events sent) — no row changes meaning.
ALTER TABLE "tracking_pixels" ADD COLUMN "orderEvent" TEXT NOT NULL DEFAULT 'Purchase';
ALTER TABLE "tracking_pixels" ADD COLUMN "sendViewContent" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "tracking_pixels" ADD COLUMN "sendInitiateCheckout" BOOLEAN NOT NULL DEFAULT true;
