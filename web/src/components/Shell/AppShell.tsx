'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { PageLoader } from '@/components/ui/Spinner';
import { Shell } from '@/components/Shell/Shell';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading) return <PageLoader />;
  if (!user) return null;

  return <Shell>{children}</Shell>;
}
