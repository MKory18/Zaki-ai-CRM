export type UserRole =
  | 'SUPER_ADMIN'
  | 'COMPANY_ADMIN'
  | 'MANAGER'
  | 'MODERATOR'
  | 'ACCOUNTANT'
  | 'DELIVERY_MANAGER'
  | 'PENDING_USER';

export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';

export type Permission =
  | 'orders.view'
  | 'orders.create'
  | 'orders.update'
  | 'orders.assign'
  | 'orders.delete'
  | 'customers.view'
  | 'customers.create'
  | 'customers.update'
  | 'products.manage'
  | 'production.manage'
  | 'offers.manage'
  | 'inventory.manage'
  | 'moderators.manage'
  | 'users.manage'
  | 'finance.view'
  | 'reports.view'
  | 'ai.use'
  | 'settings.manage'
  | 'audit.view';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: [
    'orders.view',
    'orders.create',
    'orders.update',
    'orders.assign',
    'orders.delete',
    'customers.view',
    'customers.create',
    'customers.update',
    'products.manage',
    'production.manage',
    'offers.manage',
    'inventory.manage',
    'moderators.manage',
    'users.manage',
    'finance.view',
    'reports.view',
    'ai.use',
    'settings.manage',
    'audit.view',
  ],
  COMPANY_ADMIN: [
    'orders.view',
    'orders.create',
    'orders.update',
    'orders.assign',
    'orders.delete',
    'customers.view',
    'customers.create',
    'customers.update',
    'products.manage',
    'production.manage',
    'offers.manage',
    'inventory.manage',
    'moderators.manage',
    'users.manage',
    'finance.view',
    'reports.view',
    'ai.use',
    'settings.manage',
    'audit.view',
  ],
  MANAGER: [
    'orders.view',
    'orders.create',
    'orders.update',
    'orders.assign',
    'customers.view',
    'customers.create',
    'customers.update',
    'products.manage',
    'production.manage',
    'offers.manage',
    'inventory.manage',
    'moderators.manage',
    'reports.view',
    'ai.use',
  ],
  MODERATOR: [
    'orders.view',
    'orders.create',
    'orders.update',
    'customers.view',
    'customers.create',
    'reports.view',
  ],
  ACCOUNTANT: [
    'orders.view',
    'finance.view',
    'reports.view',
    'ai.use',
  ],
  DELIVERY_MANAGER: [
    'orders.view',
    'orders.update',
    'inventory.manage',
    'reports.view',
  ],
  PENDING_USER: [],
};

/** Roles an administrator may assign. PENDING_USER included for reversion. */
export const ASSIGNABLE_ROLES: UserRole[] = [
  'PENDING_USER',
  'MODERATOR',
  'MANAGER',
  'ACCOUNTANT',
  'DELIVERY_MANAGER',
  'COMPANY_ADMIN',
  'SUPER_ADMIN',
];

export const USER_STATUSES: UserStatus[] = ['PENDING', 'ACTIVE', 'SUSPENDED', 'DISABLED'];

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  avatar?: string | null;
  companyId: string | null;
  companyName?: string;
  commissionRate?: number;
  permissions: Permission[];
}
