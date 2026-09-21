import { Suspense } from 'react';
import { requireActiveUser } from '@/lib/page-guard';
import { EntryPicker } from '@/components/shell/EntryPicker';

/** Step 1 country, step 2 store. Auth is required; context is not (this is where it is chosen). */
export default async function EntryPage() {
  await requireActiveUser();
  return (
    <Suspense>
      <EntryPicker />
    </Suspense>
  );
}
