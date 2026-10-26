/**
 * WHICH TELEGRAM MESSAGES BELONG TO THE STORE BEING LOOKED AT.
 *
 * Every Telegram source feeds one store, but the messages list and its retry
 * door read the whole company: a person working one store read another
 * store's raw messages — the customer's name, phone and address in the
 * text — and the orders made from them.
 *
 * The selected store's sources, then. A message whose source has no store
 * (or whose source was deleted) belongs to nobody yet: the manager's to
 * deal with, and nobody else's to read.
 */
export function telegramStoreWhere(storeId: string | null | undefined, mayManage: boolean) {
  const unplaced = [{ sourceId: null }, { source: { storeId: null } }];
  if (!storeId) return mayManage ? { OR: unplaced } : { id: { in: [] as string[] } };
  return { OR: [{ source: { storeId } }, ...(mayManage ? unplaced : [])] };
}
