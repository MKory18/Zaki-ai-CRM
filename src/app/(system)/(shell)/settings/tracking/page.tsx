import { guardRoute, requireShellContext } from '@/lib/page-guard';
import { TrackingPixelsSection } from '@/components/settings/TrackingPixelsSection';
import { AdAccountsCard } from '@/components/settings/AdAccountsCard';
import { CustomConversionsCard } from '@/components/settings/CustomConversionsCard';

export default async function Page() {
  await guardRoute('/settings/tracking');
  // Pixels are the company's; ad accounts are the selected store's. The
  // card says which store, because the header's store picker scoping it
  // silently is how a seller connects an account to the wrong shop.
  const { store } = await requireShellContext();
  return (
    <div className="space-y-4">
      <TrackingPixelsSection />
      {/*
        Directly under the pixels, because it is the same thought carried
        one step further: the pixel says what happened on the page, this
        says what happened afterwards — at the door, days later, where no
        browser could ever have watched.
      */}
      <CustomConversionsCard />
      {/*
        Beside the pixels, not on a screen of its own.

        A pixel reports what happened on the page and an ad account reports
        what the advert cost — two halves of the same question, and a seller
        setting up their advertising is thinking about both in the same five
        minutes. Splitting them across two screens means finding the second
        one later, which mostly means not finding it.
      */}
      <AdAccountsCard storeName={store.name} />
    </div>
  );
}
