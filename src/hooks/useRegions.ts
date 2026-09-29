'use client';

import { useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-client';

export interface RegionOption {
  id: string;
  name: string;
  /**
   * How long this governorate has ACTUALLY taken, measured from delivered
   * orders — null where too few have been delivered to say anything
   * honest. See src/lib/delivery-time.ts.
   */
  delivery?: { medianDays: number; slowDays: number; samples: number } | null;
  /** The same thing in the words a person says, or null. */
  deliveryAr?: string | null;
}

/**
 * Governorates of the country currently selected in the shell. Every order
 * form reads them from here: a hard-coded list belongs to one country only,
 * and the delivery fee table is keyed by region id.
 */
export function useRegions() {
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [countryName, setCountryName] = useState<string | null>(null);
  const [currency, setCurrency] = useState<{ code: string; minorUnit: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiJson<{
      country: { name: string; currencyCode?: string; minorUnit?: number };
      regions: RegionOption[];
    }>('/api/geo/regions')
      .then((data) => {
        if (cancelled) return;
        setRegions(data.regions);
        setCountryName(data.country.name);
        if (data.country.currencyCode) {
          setCurrency({ code: data.country.currencyCode, minorUnit: data.country.minorUnit ?? 2 });
        }
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return { regions, countryName, currency, loading };
}
