import { format } from 'date-fns';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'outline';

interface LabelCfg {
  ar: string;
  en: string;
  variant: BadgeVariant;
}

export const DEAL_STAGES = ['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const;

export const stageLabels: Record<string, LabelCfg> = {
  NEW: { ar: 'جديد', en: 'New', variant: 'info' },
  QUALIFIED: { ar: 'مؤهل', en: 'Qualified', variant: 'purple' },
  PROPOSAL: { ar: 'عرض مقدم', en: 'Proposal', variant: 'warning' },
  NEGOTIATION: { ar: 'تفاوض', en: 'Negotiation', variant: 'info' },
  WON: { ar: 'تم الفوز', en: 'Won', variant: 'success' },
  LOST: { ar: 'خسارة', en: 'Lost', variant: 'danger' },
};

export const leadStatusLabels: Record<string, LabelCfg> = {
  NEW: { ar: 'جديد', en: 'New', variant: 'info' },
  CONTACTED: { ar: 'تم التواصل', en: 'Contacted', variant: 'purple' },
  QUALIFIED: { ar: 'مؤهل', en: 'Qualified', variant: 'success' },
  UNQUALIFIED: { ar: 'غير مؤهل', en: 'Unqualified', variant: 'danger' },
  CONVERTED: { ar: 'تم التحويل', en: 'Converted', variant: 'success' },
};

export const leadSourceLabels: Record<string, LabelCfg> = {
  MANUAL: { ar: 'يدوي', en: 'Manual', variant: 'default' },
  WEBSITE: { ar: 'الموقع', en: 'Website', variant: 'info' },
  REFERRAL: { ar: 'إحالة', en: 'Referral', variant: 'purple' },
  SOCIAL_MEDIA: { ar: 'تواصل اجتماعي', en: 'Social Media', variant: 'info' },
  CAMPAIGN: { ar: 'حملة', en: 'Campaign', variant: 'warning' },
  OTHER: { ar: 'أخرى', en: 'Other', variant: 'default' },
};

export const taskStatusLabels: Record<string, LabelCfg> = {
  TODO: { ar: 'قيد الانتظار', en: 'To Do', variant: 'default' },
  IN_PROGRESS: { ar: 'قيد التنفيذ', en: 'In Progress', variant: 'info' },
  DONE: { ar: 'منجز', en: 'Done', variant: 'success' },
  CANCELLED: { ar: 'ملغى', en: 'Cancelled', variant: 'danger' },
};

export const priorityLabels: Record<string, LabelCfg> = {
  LOW: { ar: 'منخفضة', en: 'Low', variant: 'default' },
  MEDIUM: { ar: 'متوسطة', en: 'Medium', variant: 'info' },
  HIGH: { ar: 'عالية', en: 'High', variant: 'warning' },
  URGENT: { ar: 'عاجلة', en: 'Urgent', variant: 'danger' },
};

export const companyStatusLabels: Record<string, LabelCfg> = {
  ACTIVE: { ar: 'نشطة', en: 'Active', variant: 'success' },
  INACTIVE: { ar: 'غير نشطة', en: 'Inactive', variant: 'danger' },
  PROSPECT: { ar: 'محتملة', en: 'Prospect', variant: 'info' },
};

export const companySizeLabels: Record<string, LabelCfg> = {
  SMALL: { ar: 'صغيرة', en: 'Small', variant: 'default' },
  MEDIUM: { ar: 'متوسطة', en: 'Medium', variant: 'info' },
  LARGE: { ar: 'كبيرة', en: 'Large', variant: 'purple' },
  ENTERPRISE: { ar: 'مؤسسة', en: 'Enterprise', variant: 'warning' },
};

export const invoiceStatusLabels: Record<string, LabelCfg> = {
  DRAFT: { ar: 'مسودة', en: 'Draft', variant: 'default' },
  SENT: { ar: 'مُرسلة', en: 'Sent', variant: 'info' },
  PAID: { ar: 'مدفوعة', en: 'Paid', variant: 'success' },
  PARTIALLY_PAID: { ar: 'مدفوعة جزئياً', en: 'Partially Paid', variant: 'warning' },
  OVERDUE: { ar: 'متأخرة', en: 'Overdue', variant: 'danger' },
  CANCELLED: { ar: 'ملغاة', en: 'Cancelled', variant: 'danger' },
};

export const activityTypeLabels: Record<string, LabelCfg> = {
  CALL: { ar: 'مكالمة', en: 'Call', variant: 'info' },
  EMAIL: { ar: 'بريد إلكتروني', en: 'Email', variant: 'purple' },
  MEETING: { ar: 'اجتماع', en: 'Meeting', variant: 'warning' },
  NOTE: { ar: 'ملاحظة', en: 'Note', variant: 'default' },
  STATUS_CHANGE: { ar: 'تغيير حالة', en: 'Status Change', variant: 'info' },
  DEAL_STAGE: { ar: 'مرحلة صفقة', en: 'Deal Stage', variant: 'purple' },
};

export const currencyOptions = [
  { value: 'USD', label: 'دولار أمريكي (USD)' },
  { value: 'SYP', label: 'ليرة سورية (SYP)' },
  { value: 'EUR', label: 'يورو (EUR)' },
];

export function formatCurrency(value: number | string | null | undefined, currency = 'USD') {
  const n = Number(value || 0);
  try {
    return new Intl.NumberFormat('ar', {
      style: 'currency',
      currency,
      maximumFractionDigits: n % 1 === 0 ? 0 : 2,
    }).format(n);
  } catch {
    return `${n.toLocaleString('ar')} ${currency}`;
  }
}

export function formatNumber(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString('ar');
}

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return '—';
  try {
    return format(new Date(d), 'yyyy/MM/dd');
  } catch {
    return '—';
  }
}

export function formatDateTime(d: string | Date | null | undefined) {
  if (!d) return '—';
  try {
    return format(new Date(d), 'yyyy/MM/dd HH:mm');
  } catch {
    return '—';
  }
}

export function isOverdue(d: string | Date | null | undefined) {
  if (!d) return false;
  return new Date(d).getTime() < Date.now();
}
