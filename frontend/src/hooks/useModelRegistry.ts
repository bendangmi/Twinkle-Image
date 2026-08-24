'use client';

import { useEffect, useState } from 'react';
import { MODEL_REGISTRY_UPDATED_EVENT } from '@/lib/nova-models';

export function useModelRegistryVersion(): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const handleRegistryUpdated = () => setVersion((current) => current + 1);
    window.addEventListener(MODEL_REGISTRY_UPDATED_EVENT, handleRegistryUpdated);
    return () => window.removeEventListener(MODEL_REGISTRY_UPDATED_EVENT, handleRegistryUpdated);
  }, []);

  return version;
}
