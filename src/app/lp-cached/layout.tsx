import { PublicLayout } from '@/components/public/PublicLayout';

/** The cached landing page wears the same public layout as `/lp` — it is the same page, reached through the cache. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PublicLayout>{children}</PublicLayout>;
}
