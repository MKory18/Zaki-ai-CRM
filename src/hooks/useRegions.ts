'use client';

import { useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-client';

export interface RegionOption {
  id: string;
  name: string;
}

/**
 * Governorates of the country currently selected in the shell. Every order
 * form reads them from here: a hard-coded list belongs to one country only,
 * and the delivery fee table is keyed by region id.
 */
export function useRegions() {
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [countryName, setCountryName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiJson<{ country: { name: string }; regions: RegionOption[] }>('/api/geo/regions')
      .then((data) => {
        if (cancelled) return;
        setRegions(data.regions);
        setCountryName(data.country.name);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return { regions, countryName, loading };
}
