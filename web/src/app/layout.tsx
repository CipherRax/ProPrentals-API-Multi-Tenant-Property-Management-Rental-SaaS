import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProviders } from '@/components/providers';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/lib/toast';

export const metadata: Metadata = {
  title: {
    default: 'ProPrentals',
    template: '%s · ProPrentals',
  },
  description:
    'Property management and rental platform built for Kenyan landlords, property managers, and tenants.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#275355',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>
          <AuthProvider>
            <ToastProvider>{children}</ToastProvider>
          </AuthProvider>
        </AppProviders>
      </body>
    </html>
  );
}
