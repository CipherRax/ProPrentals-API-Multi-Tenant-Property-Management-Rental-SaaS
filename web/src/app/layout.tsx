import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppProviders } from '@/components/providers';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/lib/toast';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: {
    default: 'Habita',
    template: '%s — Habita',
  },
  description:
    'Habita is a happier way to manage your rentals — rent collection, receipts, maintenance, and tenant messaging in one calm, clear place.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#00A550',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <AppProviders>
          <AuthProvider>
            <ToastProvider>{children}</ToastProvider>
          </AuthProvider>
        </AppProviders>
      </body>
    </html>
  );
}
