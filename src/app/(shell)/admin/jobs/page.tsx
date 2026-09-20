import { guardRoute } from '@/lib/page-guard';
import { JobsScreen } from '@/components/screens/JobsScreen';

export default async function Page() {
  await guardRoute('/admin/jobs');
  return <JobsScreen />;
}
