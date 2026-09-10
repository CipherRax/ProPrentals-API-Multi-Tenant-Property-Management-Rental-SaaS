'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Home, Search, MapPin, BedDouble, Bath, Ruler, Filter } from 'lucide-react';
import { api, formatMoney, titleCase, resolveAssetUrl } from '@/lib/api';
import { PageLoader } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import type { Listing, PaginationMeta } from '@/types';

export default function PublicPage() {
  const { user } = useAuth();
  const { error, success } = useToast();

  const [items, setItems] = useState<Listing[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [county, setCounty] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [selected, setSelected] = useState<Listing | null>(null);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [inquiry, setInquiry] = useState({ name: '', email: '', phone: '', message: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.getList<Listing>('/public/listings', {
        search: search || undefined,
        county: county || undefined,
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        limit: 12,
      });
      setItems(d.items);
      setMeta(d.meta);
    } catch (e) {
      error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, county, minPrice, maxPrice, error]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPhotoIdx(0);
  }, [selected]);

  const submitInquiry = async () => {
    if (!selected) return;
    setSending(true);
    try {
      await api.post('/inquiries/public', {
        ...inquiry,
        propertyId: selected.property?.id,
        unitId: selected.id,
      });
      success('Inquiry sent. The landlord will get in touch.');
      setInquiryOpen(false);
      setInquiry({ name: '', email: '', phone: '', message: '' });
    } catch (e) {
      error((e as Error).message);
    } finally {
      setSending(false);
    }
  };
  const [photoIdx, setPhotoIdx] = useState(0);

  const listingImages = (l: Listing) =>
    l.images?.length ? l.images : (l.property?.images ?? []);

  const currency = 'KES';

  const showFilters = search || county || minPrice || maxPrice;

  return (
    <div className="min-h-screen bg-paper-50">
      <header className="sticky top-0 z-20 border-b border-paper-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/public" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-white">
              <Home className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-paper-900">ProPrentals</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs text-paper-400">Browse available rentals</span>
            {user ? (
              <Link href="/dashboard" className="btn-primary py-1.5">
                Go to dashboard
              </Link>
            ) : (
              <Link href="/login" className="btn-secondary py-1.5">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="bg-brand-800">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Find your next rental
          </h1>
          <p className="mt-2 max-w-xl text-brand-100">
            Browse verified units from landlords across Kenya. Filter by type, location, and budget.
          </p>
          <div className="mt-6 flex max-w-2xl flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
              <input
                className="input py-2.5 pl-9"
                placeholder="Search by city, county, or neighborhood…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && load()}
              />
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
                <input
                  className="input py-2.5 pl-9 sm:w-36"
                  placeholder="County"
                  value={county}
                  onChange={(e) => setCounty(e.target.value)}
                />
              </div>
              <button className="btn-primary py-2.5" onClick={load}>
                Search
              </button>
            </div>
          </div>
          <div className="mt-3 flex max-w-2xl gap-3">
            <input
              className="input py-2 sm:w-36"
              placeholder="Min rent"
              type="number"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
            />
            <input
              className="input py-2 sm:w-36"
              placeholder="Max rent"
              type="number"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
            />
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {showFilters && (
          <button
            className="mb-4 text-sm font-medium text-brand-700 hover:text-brand-800"
            onClick={() => {
              setSearch('');
              setCounty('');
              setMinPrice('');
              setMaxPrice('');
              setTimeout(load, 0);
            }}
          >
            Clear filters
          </button>
        )}

        {loading && items.length === 0 ? (
          <PageLoader />
        ) : items.length === 0 ? (
          <div className="surface px-6 py-16 text-center">
            <div className="text-4xl">🏠</div>
            <h2 className="mt-3 text-base font-semibold text-paper-800">No listings found</h2>
            <p className="mt-1 text-sm text-paper-500">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((l) => (
              <button
                key={l.id}
                onClick={() => setSelected(l)}
                className="surface overflow-hidden text-left transition-shadow hover:shadow-card-hover"
              >
                <div className="relative flex h-40 items-center justify-center bg-paper-100">
                  {listingImages(l)[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveAssetUrl(listingImages(l)[0].url)}
                      alt={l.unitNumber}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Home className="h-10 w-10 text-paper-300" />
                  )}
                  {listingImages(l).length > 1 && (
                    <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
                      {listingImages(l).length} photos
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-semibold text-paper-900">
                      {formatMoney(l.baseRent, currency)}
                      <span className="text-xs font-normal text-paper-400">/mo</span>
                    </span>
                    <span className="badge bg-paper-100 text-paper-600">{titleCase(l.unitType)}</span>
                  </div>
                  <div className="mt-1 text-sm">
                    <span className="font-medium text-paper-700">{l.unitNumber}</span>
                    {l.property && <span className="text-paper-500"> · {l.property.name}</span>}
                  </div>
                  {l.property && (l.property.city || l.property.county) && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-paper-400">
                      <MapPin className="h-3 w-3" />
                      {[l.property.city, l.property.county].filter(Boolean).join(', ')}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-4 text-xs text-paper-500">
                    {l.bedrooms ? (
                      <span className="flex items-center gap-1">
                        <BedDouble className="h-3.5 w-3.5" /> {l.bedrooms}
                      </span>
                    ) : null}
                    {l.bathrooms ? (
                      <span className="flex items-center gap-1">
                        <Bath className="h-3.5 w-3.5" /> {l.bathrooms}
                      </span>
                    ) : null}
                    {l.sizeSqm ? (
                      <span className="flex items-center gap-1">
                        <Ruler className="h-3.5 w-3.5" /> {l.sizeSqm} m²
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {meta && meta.totalPages > 1 && (
          <div className="mt-8 flex justify-center gap-2">
            <button
              className="btn-secondary"
              disabled={meta.page <= 1}
              onClick={() => {
                /* pagination handled via dedicated route in v2 */
              }}
            />
          </div>
        )}
      </main>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.unitNumber} · ${selected.property?.name ?? ''}` : ''}
        size="lg"
      >
        {selected && (
          <div className="space-y-4">
            {listingImages(selected).length > 0 && (
              <div>
                <div className="aspect-video w-full overflow-hidden rounded-lg bg-paper-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveAssetUrl(listingImages(selected)[photoIdx]?.url)}
                    alt={selected.unitNumber}
                    className="h-full w-full object-cover"
                  />
                </div>
                {listingImages(selected).length > 1 && (
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                    {listingImages(selected).map((img, i) => (
                      <button
                        key={`${img.url}-${i}`}
                        type="button"
                        onClick={() => setPhotoIdx(i)}
                        className={`h-14 w-20 shrink-0 overflow-hidden rounded-md border-2 transition ${
                          i === photoIdx ? 'border-brand-600' : 'border-transparent opacity-70 hover:opacity-100'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={resolveAssetUrl(img.url)} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-2xl font-semibold text-paper-900">
                {formatMoney(selected.baseRent, currency)}
                <span className="text-sm font-normal text-paper-400">/month</span>
              </div>
              <span className="badge bg-paper-100 text-paper-600">{titleCase(selected.unitType)}</span>
            </div>
            {selected.property && (
              <p className="flex items-center gap-1 text-sm text-paper-500">
                <MapPin className="h-4 w-4" />
                {[selected.property.city, selected.property.county, selected.property.neighborhood]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            )}
            <div className="grid grid-cols-3 gap-3 text-center">
              <DetailStat
                icon={<BedDouble className="h-4 w-4" />}
                label="Bedrooms"
                value={selected.bedrooms?.toString() ?? '—'}
              />
              <DetailStat
                icon={<Bath className="h-4 w-4" />}
                label="Bathrooms"
                value={selected.bathrooms?.toString() ?? '—'}
              />
              <DetailStat
                icon={<Ruler className="h-4 w-4" />}
                label="Size"
                value={selected.sizeSqm ? `${selected.sizeSqm} m²` : '—'}
              />
            </div>
            {selected.description && <p className="text-sm text-paper-600">{selected.description}</p>}
            {selected.depositAmount && (
              <p className="text-sm text-paper-500">
                Deposit: {formatMoney(selected.depositAmount, currency)}
              </p>
            )}
            <button className="btn-primary w-full" onClick={() => setInquiryOpen(true)}>
              Contact landlord
            </button>
          </div>
        )}
      </Modal>

      <Modal
        open={inquiryOpen}
        onClose={() => setInquiryOpen(false)}
        title="Contact the landlord"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setInquiryOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={submitInquiry}
              disabled={sending || !inquiry.name || !inquiry.email || !inquiry.message}
            >
              {sending ? 'Sending…' : 'Send inquiry'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Your name *</label>
            <input
              className="input"
              value={inquiry.name}
              onChange={(e) => setInquiry((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Email *</label>
              <input
                className="input"
                type="email"
                value={inquiry.email}
                onChange={(e) => setInquiry((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Phone</label>
              <input
                className="input"
                value={inquiry.phone}
                onChange={(e) => setInquiry((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="label">Message *</label>
            <textarea
              className="input h-24"
              value={inquiry.message}
              onChange={(e) => setInquiry((f) => ({ ...f, message: e.target.value }))}
              placeholder="I'm interested in this unit. When is it available?"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function DetailStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-paper-50/60 p-3">
      <div className="mx-auto mb-1 flex justify-center text-paper-400">{icon}</div>
      <div className="text-sm font-semibold text-paper-800">{value}</div>
      <div className="text-xs text-paper-400">{label}</div>
    </div>
  );
}
