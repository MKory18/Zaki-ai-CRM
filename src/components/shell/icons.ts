import {
  AlertTriangle, ArrowLeftRight, BadgePercent, Ban, Blocks, Bot, Boxes, CalendarClock,
  CircleUser, ClipboardList, Factory, FilePen, FileSpreadsheet, Gauge, GitCompare, Globe,
  Inbox, LayoutDashboard, LayoutGrid, Lightbulb, Lock, MapPin, Megaphone, MessageCircle,
  Package, PackageCheck, PackagePlus, PanelsTopLeft, Percent, Printer, Radar, Receipt,
  Repeat, ScrollText, Send, Settings, ShieldCheck, ShoppingCart, Store, Tag, TrendingUp,
  Timer, Truck, Undo2, UserCog, Users, Wallet,
  type LucideIcon,
} from 'lucide-react';

/** Icon names used by the route registry (src/lib/route-registry.ts). */
export const ICONS: Record<string, LucideIcon> = {
  AlertTriangle, ArrowLeftRight, BadgePercent, Ban, Blocks, Bot, Boxes, CalendarClock,
  CircleUser, ClipboardList, Factory, FilePen, FileSpreadsheet, Gauge, GitCompare, Globe,
  Inbox, LayoutDashboard, LayoutGrid, Lightbulb, Lock, MapPin, Megaphone, MessageCircle,
  Package, PackageCheck, PackagePlus, PanelsTopLeft, Percent, Printer, Radar, Receipt,
  Repeat, ScrollText, Send, Settings, ShieldCheck, ShoppingCart, Store, Tag, TrendingUp,
  Timer, Truck, Undo2, UserCog, Users, Wallet,
};

export function iconFor(name: string): LucideIcon {
  return ICONS[name] ?? Package;
}
