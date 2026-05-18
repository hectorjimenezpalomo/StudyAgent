'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

type DocumentsPollingProps = {
  enabled: boolean;
};

export function DocumentsPolling({ enabled }: DocumentsPollingProps) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const intervalId = window.setInterval(() => {
      router.refresh();
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [enabled, router]);

  return null;
}
