import { TenantShell } from '@/components/Shell/TenantShell';

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return <TenantShell>{children}</TenantShell>;
}