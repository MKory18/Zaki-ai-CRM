/**
 * Legacy key -> canonical new key. Transitional: routes still enforce legacy
 * keys until PHASE 3 migrates them; the engine resolves both to the same grant.
 *
 * In its own file, with no imports, so the browser's `userCan` reads the SAME
 * table the server's `can()` reads — a screen that resolved keys differently
 * from the server hid buttons the server allowed, and showed ones it refused.
 */
export const LEGACY_ALIAS: Readonly<Record<string, string>> = {
  'orders.update': 'orders.edit',
  'orders.update_own': 'orders.edit',
  'orders.confirmation_status': 'orders.confirm',
  'orders.shipping_status': 'orders.change_status',
  'orders.reassign': 'orders.assign',
  'orders.view_assigned': 'orders.view',
  'orders.view_own': 'orders.view',
  'customers.update': 'customers.edit',
  'customers.freeze': 'customers.edit',
  'customers.unfreeze': 'customers.edit',
  'products.update': 'products.edit',
  'products.manage': 'products.edit',
  'users.update': 'users.edit',
  /*
   * NOT HERE ANY MORE: 'settings.manage' → 'settings.edit'.
   *
   * «الإعدادات الحسّاسة» is its own box (the owner's ruling, 27/10, RV149).
   * Aliased, every holder of «تعديل إعدادات النظام» also read and changed
   * the courier credentials, the ad-account tokens and the AI provider's key,
   * and a «منع» on the sensitive box did nothing. The migration
   * 20261027000000_sensitive_settings_own_key gave settings.manage to every
   * role and person who held settings.edit, so nobody lost a door on the day.
   * Only a catalog key that is NOT a real box may stand on the left here.
   */
  'analytics.view': 'reports.view',
};
