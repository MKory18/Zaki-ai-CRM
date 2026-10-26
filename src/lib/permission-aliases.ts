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
  'settings.manage': 'settings.edit',
  'analytics.view': 'reports.view',
};
