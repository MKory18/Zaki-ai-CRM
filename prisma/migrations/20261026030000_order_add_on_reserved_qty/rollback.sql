-- Undo 20261026030000_order_add_on_reserved_qty. Add-ons go back to holding nothing on the shelf.
ALTER TABLE "order_add_ons" DROP COLUMN IF EXISTS "reservedQty";
