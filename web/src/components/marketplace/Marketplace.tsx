'use client';

import { useCallback, useEffect, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react';
import Link from 'next/link';
import {
  Home,
  Search,
  MapPin,
  BedDouble,
  Bath,
  Ruler,
  SlidersHorizontal,
  Heart,
  ShieldCheck,
  ChevronDown,
  MessageSquare,
  Wallet,
  ReceiptText,
  ArrowRight,
  Users,
  Eye,
  Sparkles,
  X,
  Loader2,
} from 'lucide-react';
import { api, formatMoney, resolveAssetUrl } from '@/lib/api';
import { PageLoader } from '@/components/ui/Spinner';
import { PageTitle } from '@/components/ui/PageTitle';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { initials } from '@/lib/utils';
import type { Listing, PaginationMeta, MarketSummary, AiParsedSearch } from '@/types';

const UNIT_TYPE_LABELS: Record<string, string> = {
  APARTMENT: 'Apartment',
  BEDSITTER: 'Bedsitter',
  SINGLE_ROOM: 'Single room',
  ONE_BEDROOM: '1 bedroom',
  TWO_BEDROOM: '2 bedroom',
  THREE_BEDROOM: '3 bedroom',
  MAISONETTE: 'Maisonette',
  HOUSE: 'House',
  BUNGALOW: 'Bungalow',
  STUDIO: 'Studio',
  SHOP: 'Shop',
  OFFICE: 'Office',
  PARKING_SPACE: 'Parking space',
  OTHER: 'Other',
};

const FURNISHING_OPTIONS: Record<string, string> = {
  UNFURNISHED: 'Unfurnished',
  SEMI_FURNISHED: 'Semi-furnished',
  FULLY_FURNISHED: 'Fully furnished',
};

const WATER_OPTIONS: Record<string, string> = {
  BOREHOLE: 'Borehole',
  PIPED: 'Piped',
  TWENTY_FOUR_HOUR: '24-hour supply',
  NONE: 'No water',
};

const SECURITY_OPTIONS = ['Gated', 'CCTV', '24/7 guards', 'Boarded', 'Watchman'];

const PROXIMITY_OPTIONS = ['School', 'Matatu stage', 'Shopping center', 'Hospital', 'Church', 'Supermarket'];

const UTILITIES_OPTIONS = ['Water', 'WiFi', 'Electricity', 'Garbage collection', 'Sewer'];

const AMENITY_OPTIONS = [
  'Parking',
  '24/7 Security',
  'Water included',
  'Borehole water',
  'Kitchen',
  'Furnished',
  'WiFi',
  'Lift/Elevator',
];

const FAVORITES_KEY = 'habita:favorites';

export function Marketplace() {
  const { user, organizations, isTenant } = useAuth();
  const { error, success } = useToast();

  const [items, setItems] = useState<Listing[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<MarketSummary | null>(null);

  const [search, setSearch] = useState('');
  const [county, setCounty] = useState('');
  const [city, setCity] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [unitType, setUnitType] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [amenities, setAmenities] = useState<string[]>([]);
  const [furnished, setFurnished] = useState<string[]>([]);
  const [water, setWater] = useState<string[]>([]);
  const [securityFeatures, setSecurityFeatures] = useState<string[]>([]);
  const [utilitiesIncluded, setUtilitiesIncluded] = useState<string[]>([]);
  const [proximityTags, setProximityTags] = useState<string[]>([]);
  const [parking, setParking] = useState('');
  const [petFriendly, setPetFriendly] = useState('');
  const [availableFrom, setAvailableFrom] = useState('');
  const [aiQuery, setAiQuery] = useState('');
  const [aiChips, setAiChips] = useState<AiParsedSearch['understood']>([]);
  const [aiParsing, setAiParsing] = useState(false);
  const [sort, setSort] = useState<'asc' | 'desc'>('asc');
  const [includeUnavailable, setIncludeUnavailable] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const toggleChip = (
    setter: Dispatch<SetStateAction<string[]>>,
    value: string,
  ) =>
    setter((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]));

  const [selected, setSelected] = useState<Listing | null>(null);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [inquiry, setInquiry] = useState({ name: '', email: '', phone: '', message: '' });
  const [photoIdx, setPhotoIdx] = useState(0);
  const [favorites, setFavorites] = useState<string[]>([]);

  const currency = 'KES';

  const loadWith = useCallback(async (params: Record<string, unknown>) => {
    setLoading(true);
    try {
      const d = await api.getList<Listing>('/public/listings', params);
      setItems(d.items);
      setMeta(d.meta);
    } catch (e) {
      error((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const load = useCallback(
    async (overridePage?: number) => {
      await loadWith({
        search: search || undefined,
        county: county || undefined,
        city: city || undefined,
        neighborhood: neighborhood || undefined,
        unitType: unitType || undefined,
        bedrooms: bedrooms ? Number(bedrooms) : undefined,
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        amenities: amenities.length ? amenities : undefined,
        furnished: furnished.length ? furnished : undefined,
        water: water.length ? water : undefined,
        securityFeatures: securityFeatures.length ? securityFeatures : undefined,
        utilitiesIncluded: utilitiesIncluded.length ? utilitiesIncluded : undefined,
        proximityTags: proximityTags.length ? proximityTags : undefined,
        parking: parking ? parking === 'yes' : undefined,
        petFriendly: petFriendly ? petFriendly === 'yes' : undefined,
        availableFrom: availableFrom || undefined,
        includeUnavailable,
        sortOrder: sort,
        page: overridePage ?? 1,
        limit: 12,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, county, city, neighborhood, unitType, bedrooms, minPrice, maxPrice, sort, amenities, furnished, water, securityFeatures, utilitiesIncluded, proximityTags, parking, petFriendly, availableFrom, includeUnavailable, loadWith],
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api
      .get<MarketSummary>('/public/listings/summary')
      .then(setSummary)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setPhotoIdx(0);
  }, [selected]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      if (raw) setFavorites(JSON.parse(raw));
    } catch {
      /* ignore corrupted storage */
    }
  }, []);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {
        /* ignore storage quota errors */
      }
      return next;
    });
  };

  const toggleAmenity = (a: string) =>
    setAmenities((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));

  const clearFilters = () => {
    setSearch('');
    setCounty('');
    setCity('');
    setNeighborhood('');
    setUnitType('');
    setBedrooms('');
    setMinPrice('');
    setMaxPrice('');
    setAmenities([]);
    setFurnished([]);
    setWater([]);
    setSecurityFeatures([]);
    setUtilitiesIncluded([]);
    setProximityTags([]);
    setParking('');
    setPetFriendly('');
    setAvailableFrom('');
    setAiChips([]);
    setAiQuery('');
    setIncludeUnavailable(false);
    setSort('asc');
    load(1);
  };

  const applyAiSearch = async (raw: string) => {
    if (!raw.trim() || aiParsing) return;
    setAiParsing(true);
    try {
      const parsed = await api.post<{ query: string; filters: Record<string, unknown>; keyword?: string; understood: AiParsedSearch['understood'] }>(
        '/public/listings/ai/parse',
        { query: raw },
      );
      const f = parsed.filters ?? {};
      if (f.unitType) setUnitType(String(f.unitType));
      if (f.bedrooms != null) setBedrooms(String(f.bedrooms));
      if (f.minPrice != null) setMinPrice(String(f.minPrice));
      if (f.maxPrice != null) setMaxPrice(String(f.maxPrice));
      if (f.county) setCounty(String(f.county));
      if (f.city) setCity(String(f.city));
      if (f.neighborhood) setNeighborhood(String(f.neighborhood));
      if (f.availableFrom) setAvailableFrom(String(f.availableFrom));
      if (Array.isArray(f.furnished)) setFurnished(f.furnished.map(String));
      if (Array.isArray(f.water)) setWater(f.water.map(String));
      if (Array.isArray(f.securityFeatures)) setSecurityFeatures(f.securityFeatures.map(String));
      if (Array.isArray(f.utilitiesIncluded)) setUtilitiesIncluded(f.utilitiesIncluded.map(String));
      if (Array.isArray(f.amenities)) setAmenities(f.amenities.map(String));
      if (typeof f.parking === 'boolean') setParking(f.parking ? 'yes' : 'no');
      if (typeof f.petFriendly === 'boolean') setPetFriendly(f.petFriendly ? 'yes' : 'no');
      setSearch(parsed.keyword ?? '');
      setAiChips(parsed.understood ?? []);
      await load(1);
    } catch (e) {
      error((e as Error).message);
    } finally {
      setAiParsing(false);
    }
  };

  const removeAiChip = async (chip: AiParsedSearch['understood'][number]) => {
    const nextChips = aiChips.filter((c) => c.id !== chip.id);
    setAiChips(nextChips);
    const s = {
      search: chip.filter === 'keyword' ? '' : search,
      county: chip.filter === 'county' ? '' : county,
      city: chip.filter === 'city' ? '' : city,
      neighborhood: chip.filter === 'neighborhood' ? '' : neighborhood,
      unitType: chip.filter === 'unitType' ? '' : unitType,
      bedrooms: chip.filter === 'bedrooms' ? '' : bedrooms,
      minPrice: chip.filter === 'minPrice' ? '' : minPrice,
      maxPrice: chip.filter === 'maxPrice' ? '' : maxPrice,
      parking: chip.filter === 'parking' ? '' : parking,
      petFriendly: chip.filter === 'petFriendly' ? '' : petFriendly,
      availableFrom: chip.filter === 'availableFrom' ? '' : availableFrom,
    };
    await loadWith({
      search: s.search || undefined,
      county: s.county || undefined,
      city: s.city || undefined,
      neighborhood: s.neighborhood || undefined,
      unitType: s.unitType || undefined,
      bedrooms: s.bedrooms ? Number(s.bedrooms) : undefined,
      minPrice: s.minPrice ? Number(s.minPrice) : undefined,
      maxPrice: s.maxPrice ? Number(s.maxPrice) : undefined,
      amenities: chip.filter === 'amenities' ? undefined : amenities.length ? amenities : undefined,
      furnished: chip.filter === 'furnished' ? undefined : furnished.length ? furnished : undefined,
      water: chip.filter === 'water' ? undefined : water.length ? water : undefined,
      securityFeatures: chip.filter === 'securityFeatures' ? undefined : securityFeatures.length ? securityFeatures : undefined,
      utilitiesIncluded: chip.filter === 'utilitiesIncluded' ? undefined : utilitiesIncluded.length ? utilitiesIncluded : undefined,
      proximityTags: proximityTags.length ? proximityTags : undefined,
      parking: s.parking ? s.parking === 'yes' : undefined,
      petFriendly: s.petFriendly ? s.petFriendly === 'yes' : undefined,
      availableFrom: s.availableFrom || undefined,
      includeUnavailable,
      sortOrder: sort,
      page: 1,
      limit: 12,
    });
  };

  const submitInquiry = async () => {
    if (!selected) return;
    setSending(true);
    try {
      await api.post('/inquiries/public', {
        ...inquiry,
        propertyId: selected.property?.id,
        unitTypeId: selected.id,
      });
      success('Inquiry sent — the landlord will be in touch.');
      setInquiryOpen(false);
      setInquiry({ name: '', email: '', phone: '', message: '' });
    } catch (e) {
      error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const listingImages = (l: Listing) => {
    if (l.images?.length) return l.images;
    if (l.representativeImage) return [{ url: l.representativeImage }];
    return l.property?.images ?? [];
  };

  const showFilters =
    search || county || city || neighborhood || unitType || bedrooms || minPrice || maxPrice || amenities.length ||
    furnished.length || water.length || securityFeatures.length || utilitiesIncluded.length ||
    proximityTags.length || parking || petFriendly || availableFrom || includeUnavailable || aiChips.length;

  const homeHref = !user
    ? null
    : user.platformRole === 'SUPER_ADMIN' || user.platformRole === 'SUPPORT_ADMIN'
      ? '/admin'
      : isTenant && organizations.length === 0
        ? '/portal'
        : '/dashboard';

  const openInquiry = (l: Listing) => {
    setSelected(l);
    if (user) {
      setInquiry((f) =>
        f.name || f.email
          ? f
          : {
              ...f,
              name: `${user.firstName} ${user.lastName ?? ''}`.trim(),
              email: user.email ?? '',
            },
      );
    }
    setInquiryOpen(true);
  };

  return (
    <div className="marketplace-bg min-h-screen">
      <PageTitle title="Browse Rentals" />

      {/* ── Nav ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-paper-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-card bg-brand-500 text-white shadow-sm">
              <Home className="h-[18px] w-[18px]" />
            </div>
            <span className="text-base font-semibold tracking-tight text-paper-900">Habita</span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            <a
              href="#listings"
              className="rounded-control px-3 py-2 text-sm font-medium text-paper-600 transition-colors hover:bg-paper-100 hover:text-paper-900"
            >
              Browse
            </a>
            <a
              href="#for-landlords"
              className="rounded-control px-3 py-2 text-sm font-medium text-paper-600 transition-colors hover:bg-paper-100 hover:text-paper-900"
            >
              For Landlords
            </a>
          </nav>

          <div className="flex items-center gap-2">
            {user && homeHref ? (
              <Link
                href={homeHref}
                className="group flex items-center gap-2 rounded-panel border border-paper-200 bg-white py-1 pl-1 pr-2.5 transition-colors hover:border-brand-300"
              >
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveAssetUrl(user.avatarUrl)}
                    alt=""
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500/10 text-xs font-semibold text-brand-700">
                    {initials(`${user.firstName} ${user.lastName}`)}
                  </span>
                )}
                <span className="hidden max-w-[10rem] truncate text-sm font-medium text-paper-700 group-hover:text-brand-700 sm:inline">
                  {user.firstName}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-paper-400" />
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn-secondary hidden py-2 sm:inline-flex">
                  Sign in
                </Link>
                <Link href="/register" className="btn-primary py-2">
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero-marketplace.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-900/85 via-brand-900/55 to-brand-800/20" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-paper-50/90 to-transparent" />

        <div className="relative mx-auto flex max-w-7xl flex-col px-4 pt-20 pb-24 sm:px-6 sm:pt-24 sm:pb-28 lg:pt-28">
          <div className="flex items-center gap-2 text-brand-100">
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-white ring-1 ring-white/20">
              Listed directly by landlords
            </span>
          </div>
          <h1 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
            Find your next home, the easy way.
          </h1>
          <p className="mt-3 max-w-xl text-base text-brand-50/90 sm:text-lg">
            Real homes and apartments across Kenya — with real rent, real photos, and no agency fees.
          </p>

          {/* AI natural-language search */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              applyAiSearch(aiQuery);
            }}
            className="mt-10 w-full max-w-2xl rounded-card bg-gradient-to-r from-brand-600 via-brand-500 to-brand-600 p-[2px] shadow-card"
          >
            <div className="flex items-center gap-3 rounded-[calc(1rem-2px)] bg-white p-3">
              <Sparkles className="h-5 w-5 shrink-0 text-brand-600" />
              <input
                className="w-full bg-transparent text-sm text-paper-900 placeholder:text-paper-400 focus:outline-none"
                placeholder="Describe your home — '2 bedroom near CBD under 20k, pet friendly'"
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                aria-label="AI natural language search"
              />
              <button type="submit" className="btn-primary shrink-0 py-2" disabled={aiParsing}>
                {aiParsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                AI search
              </button>
            </div>
            <p className="px-3.5 pb-2 pt-1.5 text-[11px] text-white/85">
              Try &ldquo;2 bed near CBD under 20k&rdquo; · &ldquo;bedsitter in Ruiru with parking&rdquo; · &ldquo;maisonette, pet friendly, Westlands&rdquo;
            </p>
          </form>

          {/* Floating search card */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              load(1);
            }}
            className="mt-8 w-full max-w-2xl rounded-card border border-paper-100 bg-white p-4 shadow-card sm:p-5"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
              <label className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
                <input
                  className="input pl-9"
                  placeholder="City, county, or neighborhood…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <select
                className="input sm:w-44"
                value={unitType}
                onChange={(e) => setUnitType(e.target.value)}
                aria-label="Property type"
              >
                <option value="">Any type</option>
                {Object.entries(UNIT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-primary py-2.5 sm:px-8">
                <Search className="h-4 w-4" /> Search
              </button>
            </div>
          </form>

          {aiChips.length > 0 && (
            <div className="mt-4 flex max-w-2xl flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-100">
                <Sparkles className="h-3.5 w-3.5" /> Applied from your search:
              </span>
              {aiChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => removeAiChip(chip)}
                  title={`Remove ${chip.label}`}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-white/25"
                >
                  {chip.label}
                  <X className="h-3 w-3 text-brand-200 transition-colors group-hover:text-white" />
                </button>
              ))}
            </div>
          )}

          {summary && (
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-brand-50/90">
              <span className="flex items-center gap-1.5">
                <Home className="h-4 w-4 text-brand-200" />
                {summary.availableUnits.toLocaleString()} homes available now
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-brand-200" />
                {summary.counties.toLocaleString()} counties covered
              </span>
            </div>
          )}
        </div>
      </section>

      {/* ── Listings ─────────────────────────────────────────── */}
      <main id="listings" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-paper-900">
              Available homes
            </h2>
            {meta && (
              <p className="mt-0.5 text-sm text-paper-500">
                {meta.total.toLocaleString()} {meta.total === 1 ? 'home' : 'homes'}
                {showFilters ? ' matching your search' : ' right now'}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIncludeUnavailable((v) => !v)}
              aria-pressed={includeUnavailable}
              title="Show fully booked unit types (greyed out)"
              className={`inline-flex items-center gap-1.5 rounded-control border px-3 py-2 text-sm font-medium transition-colors ${
                includeUnavailable
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-paper-200 bg-white text-paper-600 hover:border-brand-300 hover:text-brand-700'
              }`}
            >
              <Eye className="h-4 w-4" />
              <span className="hidden sm:inline">Show fully booked</span>
            </button>
            <button
              className="btn-secondary lg:hidden"
              onClick={() => setFiltersOpen((o) => !o)}
              aria-label="Toggle filters"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {showFilters && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white">
                  {[
                    search,
                    county,
                    unitType,
                    bedrooms,
                    minPrice,
                    maxPrice,
                    furnished.join(','),
                    water.join(','),
                    securityFeatures.join(','),
                    utilitiesIncluded.join(','),
                    proximityTags.join(','),
                    parking,
                    petFriendly,
                    availableFrom,
                  ].filter(Boolean).length + amenities.length}
                </span>
              )}
            </button>
            <select
              className="input w-auto py-2"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as 'asc' | 'desc');
              }}
              aria-label="Sort listings"
            >
              <option value="asc">Rent: low to high</option>
              <option value="desc">Rent: high to low</option>
            </select>
          </div>
        </div>

        {/* Filter bar */}
        <div
          className={`mt-5 ${filtersOpen || showFilters || moreOpen ? 'block' : 'hidden'} ${
            filtersOpen || showFilters ? 'lg:block' : 'lg:block'
          }`}
        >
          {/* Always-visible filters: type, price, bedrooms, location */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="relative sm:col-span-2 lg:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
              <input
                className="input pl-9"
                placeholder="Location"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
              <input
                className="input pl-9"
                placeholder="County"
                value={county}
                onChange={(e) => setCounty(e.target.value)}
              />
            </label>
            <select
              className="input"
              value={unitType}
              onChange={(e) => setUnitType(e.target.value)}
              aria-label="Unit type"
            >
              <option value="">Any type</option>
              {Object.entries(UNIT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              className="input"
              value={bedrooms}
              onChange={(e) => setBedrooms(e.target.value)}
              aria-label="Bedrooms"
            >
              <option value="">Any bedrooms</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} bed{n > 1 ? 's' : ''}
                </option>
              ))}
            </select>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
              <input
                className="input"
                placeholder="Min rent"
                type="number"
                min={0}
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
              />
              <input
                className="input"
                placeholder="Max rent"
                type="number"
                min={0}
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
              />
            </div>
          </div>

          {/* Expandable advanced filters */}
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-800"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            More filters
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {moreOpen && (
            <div className="mt-3 space-y-4 rounded-lg border border-paper-200 bg-paper-50/50 p-4">
              <div>
                <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-paper-400">
                  Furnishing
                </span>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(FURNISHING_OPTIONS).map(([value, label]) => {
                    const on = furnished.includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => toggleChip(setFurnished, value)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                          on
                            ? 'border-brand-500 bg-brand-500 text-white'
                            : 'border-paper-200 bg-white text-paper-600 hover:border-brand-300 hover:text-brand-700'
                        }`}
                      >
                        {on && <CheckIcon />}
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-paper-400">
                  Water supply
                </span>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(WATER_OPTIONS).map(([value, label]) => {
                    const on = water.includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => toggleChip(setWater, value)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                          on
                            ? 'border-brand-500 bg-brand-500 text-white'
                            : 'border-paper-200 bg-white text-paper-600 hover:border-brand-300 hover:text-brand-700'
                        }`}
                      >
                        {on && <CheckIcon />}
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-paper-400">
                  Security
                </span>
                <div className="flex flex-wrap gap-2">
                  {SECURITY_OPTIONS.map((s) => {
                    const on = securityFeatures.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleChip(setSecurityFeatures, s)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                          on
                            ? 'border-brand-500 bg-brand-500 text-white'
                            : 'border-paper-200 bg-white text-paper-600 hover:border-brand-300 hover:text-brand-700'
                        }`}
                      >
                        {on && <CheckIcon />}
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-paper-400">
                  Nearby
                </span>
                <div className="flex flex-wrap gap-2">
                  {PROXIMITY_OPTIONS.map((p) => {
                    const on = proximityTags.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => toggleChip(setProximityTags, p)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                          on
                            ? 'border-brand-500 bg-brand-500 text-white'
                            : 'border-paper-200 bg-white text-paper-600 hover:border-brand-300 hover:text-brand-700'
                        }`}
                      >
                        {on && <CheckIcon />}
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-paper-400">
                  Utilities included
                </span>
                <div className="flex flex-wrap gap-2">
                  {UTILITIES_OPTIONS.map((u) => {
                    const on = utilitiesIncluded.includes(u);
                    return (
                      <button
                        key={u}
                        type="button"
                        onClick={() => toggleChip(setUtilitiesIncluded, u)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                          on
                            ? 'border-brand-500 bg-brand-500 text-white'
                            : 'border-paper-200 bg-white text-paper-600 hover:border-brand-300 hover:text-brand-700'
                        }`}
                      >
                        {on && <CheckIcon />}
                        {u}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="label">Parking</label>
                  <select
                    className="input"
                    value={parking}
                    onChange={(e) => setParking(e.target.value)}
                  >
                    <option value="">Any</option>
                    <option value="yes">Parking available</option>
                    <option value="no">No parking</option>
                  </select>
                </div>
                <div>
                  <label className="label">Pets</label>
                  <select
                    className="input"
                    value={petFriendly}
                    onChange={(e) => setPetFriendly(e.target.value)}
                  >
                    <option value="">Any</option>
                    <option value="yes">Pets allowed</option>
                    <option value="no">No pets</option>
                  </select>
                </div>
                <div>
                  <label className="label">Available from</label>
                  <input
                    className="input"
                    type="date"
                    value={availableFrom}
                    onChange={(e) => setAvailableFrom(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-paper-400">
                  Amenities
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-paper-400" />
                  {AMENITY_OPTIONS.map((a) => {
                    const on = amenities.includes(a);
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() => toggleAmenity(a)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                          on
                            ? 'border-brand-500 bg-brand-500 text-white'
                            : 'border-paper-200 bg-white text-paper-600 hover:border-brand-300 hover:text-brand-700'
                        }`}
                      >
                        {on && <CheckIcon />}
                        {a}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-primary py-2" onClick={() => load(1)}>
              <SlidersHorizontal className="h-4 w-4" /> Apply filters
            </button>
            {showFilters && (
              <button className="btn-ghost py-2" onClick={clearFilters}>
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        {loading && items.length === 0 ? (
          <MarketplaceSkeleton />
        ) : items.length === 0 ? (
          <div className="mt-8 rounded-card border border-dashed border-paper-200 bg-white/70 px-6 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Search className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-paper-800">
              No homes match your search yet
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-paper-500">
              Try widening your filters or clearing a few, then search again — new homes are added
              all the time.
            </p>
            {showFilters && (
              <button className="btn-secondary mt-5" onClick={clearFilters}>
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((l) => (
              <ListingCard
                key={l.id}
                listing={l}
                currency={currency}
                favorite={favorites.includes(l.id)}
                onToggleFavorite={() => toggleFavorite(l.id)}
                onOpen={() => setSelected(l)}
              />
            ))}
          </div>
        )}

        {meta && meta.totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-3">
            <button
              className="btn-secondary"
              disabled={meta.page <= 1}
              onClick={() => load(meta.page - 1)}
            >
              Previous
            </button>
            <span className="text-sm text-paper-500">
              Page {meta.page} of {meta.totalPages}
            </span>
            <button
              className="btn-secondary"
              disabled={meta.page >= meta.totalPages}
              onClick={() => load(meta.page + 1)}
            >
              Next
            </button>
          </div>
        )}
      </main>

      {/* ── For Landlords ────────────────────────────────────── */}
      <section id="for-landlords" className="mx-auto max-w-7xl scroll-mt-20 px-4 pb-4 sm:px-6">
        <div className="relative overflow-hidden rounded-card border border-brand-100 bg-white px-6 py-12 sm:px-12 sm:py-16">
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-50 blur-2xl" />
          <div className="pointer-events-none absolute bottom-0 right-1/3 h-48 w-48 rounded-full bg-brand-100/40 blur-3xl" />

          <div className="relative grid grid-cols-1 gap-10 lg:grid-cols-2">
            <div>
              <span className="badge bg-brand-50 text-brand-700">For landlords</span>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-paper-900 sm:text-3xl">
                Own property? List it on Habita.
              </h2>
              <p className="mt-3 max-w-lg text-paper-600">
                Stop juggling spreadsheets. Habita handles your rent, receipts, maintenance, and
                tenant messaging — and your vacant units get discovered by thousands of home hunters
                every month.
              </p>
              <ul className="mt-6 space-y-3">
                <FeatureRow icon={<Wallet className="h-4 w-4" />} text="Automated monthly rent and instant receipts" />
                <FeatureRow icon={<MessageSquare className="h-4 w-4" />} text="Built-in messaging with tenants and staff" />
                <FeatureRow icon={<ReceiptText className="h-4 w-4" />} text="Payments via M-PESA, tracked to the shilling" />
                <FeatureRow icon={<Users className="h-4 w-4" />} text="Clear reports on what you&apos;ve earned" />
              </ul>
            </div>

            <div className="flex flex-col justify-center rounded-panel border border-brand-100 bg-brand-50/40 p-6">
              <h3 className="text-lg font-semibold text-paper-900">List your property today</h3>
              <p className="mt-1 text-sm text-paper-600">
                It&apos;s free to start — no credit card required. Registration is for landlords and
                property owners who want to list and manage their properties.
              </p>
              <Link href="/register" className="btn-primary mt-5 w-full py-3">
                Register as a landlord <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="mt-3 text-xs text-paper-500">
                Tenants don&apos;t self-register — you&apos;ll get an invite link from your landlord once
                they&apos;ve added you to a property.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-paper-200 bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
                <Home className="h-4 w-4" />
              </div>
              <span className="text-base font-semibold tracking-tight text-paper-900">Habita</span>
            </div>
            <p className="mt-3 text-sm text-paper-500">
              A happier way to manage your rentals — and a friendlier way to find your next home.
            </p>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-paper-500">Explore</h4>
            <ul className="mt-3 space-y-2 text-sm text-paper-600">
              <li>
                <a href="#listings" className="hover:text-brand-700">Browse homes</a>
              </li>
              <li>
                <a href="#for-landlords" className="hover:text-brand-700">How it works</a>
              </li>
              <li>
                <a href="#for-landlords" className="hover:text-brand-700">For landlords</a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-paper-500">Company</h4>
            <ul className="mt-3 space-y-2 text-sm text-paper-600">
              <li>
                <a href="mailto:support@habita.app" className="hover:text-brand-700">Contact & support</a>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-brand-700">Privacy policy</Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-brand-700">Terms of service</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-paper-500">Browse by type</h4>
            <ul className="mt-3 space-y-2 text-sm text-paper-600">
              {['Bedsitters', 'Apartments', '1 bedroom', '2 bedroom', '3 bedroom', 'Maisonettes'].map(
                (t) => (
                  <li key={t}>
                    <button
                      className="hover:text-brand-700"
                      onClick={() => {
                        setUnitType(mapTypeLabel(t));
                        setFiltersOpen(true);
                        load(1);
                      }}
                    >
                      {t}
                    </button>
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>
        <div className="border-t border-paper-100 px-4 py-6 sm:px-6">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 text-xs text-paper-400 sm:flex-row">
            <span>© {new Date().getFullYear()} Habita · All rights reserved</span>
            <span>Real homes · Real landlords · No agency fees</span>
          </div>
        </div>
      </footer>

      {/* ── Listing detail modal ─────────────────────────────── */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.typeName} · ${selected.property?.name ?? ''}` : ''}
        size="lg"
      >
        {selected && (
          <div className="space-y-4">
            {listingImages(selected).length > 0 && (
              <div>
                <div className="aspect-video w-full overflow-hidden rounded-card bg-paper-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveAssetUrl(listingImages(selected)[photoIdx]?.url)}
                    alt={selected.typeName}
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
                        className={`h-14 w-20 shrink-0 overflow-hidden rounded-card border-2 transition ${
                          i === photoIdx
                            ? 'border-brand-500'
                            : 'border-transparent opacity-70 hover:opacity-100'
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
              <div className="flex items-center gap-2">
                {selected.property?.verificationStatus === 'VERIFIED' && (
                  <span className="badge bg-brand-50 text-brand-700">
                    <ShieldCheck className="h-3 w-3" /> Verified property
                  </span>
                )}
                {selected.vacantCount !== undefined && selected.totalCount ? (
                  selected.vacantCount > 0 ? (
                    <span className="badge bg-emerald-50 text-emerald-700">
                      {selected.vacantCount} of {selected.totalCount} available
                    </span>
                  ) : (
                    <span className="badge bg-paper-100 text-paper-500">Fully booked</span>
                  )
                ) : null}
              </div>
            </div>
            {selected.property && (
              <p className="flex items-center gap-1 text-sm text-paper-500">
                <MapPin className="h-4 w-4" />
                {[selected.property.city, selected.property.county, selected.property.neighborhood]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            )}
            <div className="grid grid-cols-4 gap-3 text-center">
              <DetailStat icon={<BedDouble className="h-4 w-4" />} label="Beds" value={selected.bedrooms?.toString() ?? '—'} />
              <DetailStat icon={<Bath className="h-4 w-4" />} label="Baths" value={selected.bathrooms?.toString() ?? '—'} />
              <DetailStat icon={<Ruler className="h-4 w-4" />} label="Size" value={selected.sizeSqm ? `${selected.sizeSqm} m²` : '—'} />
              <DetailStat
                icon={<Wallet className="h-4 w-4" />}
                label="Deposit"
                value={selected.depositAmount ? formatMoney(selected.depositAmount, currency) : '—'}
              />
            </div>
            {selected.description && (
              <p className="text-sm leading-relaxed text-paper-600">{selected.description}</p>
            )}
            {selected.amenities.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selected.amenities.map((a) => (
                  <span key={a} className="badge bg-paper-100 text-paper-600">
                    {a}
                  </span>
                ))}
              </div>
            )}
            <button className="btn-primary w-full" onClick={() => openInquiry(selected)}>
              Contact the landlord
            </button>
          </div>
        )}
      </Modal>

      {/* ── Inquiry modal ────────────────────────────────────── */}
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
              placeholder="Hi, I&apos;m interested in this unit. When is it available?"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ListingCard({
  listing: l,
  currency,
  favorite,
  onToggleFavorite,
  onOpen,
}: {
  listing: Listing;
  currency: string;
  favorite: boolean;
  onToggleFavorite: () => void;
  onOpen: () => void;
}) {
  const images = l.representativeImage
    ? [{ url: l.representativeImage }]
    : l.images?.length
      ? l.images
      : (l.property?.images ?? []);
  const location = [l.property?.city, l.property?.county, l.property?.neighborhood]
    .filter(Boolean)
    .join(', ');
  const fullyBooked = l.vacantCount !== undefined && l.vacantCount === 0;

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKey}
      className={`group cursor-pointer overflow-hidden rounded-card border border-paper-200 bg-white shadow-panel transition hover:-translate-y-0.5 hover:shadow-card-hover ${
        fullyBooked ? 'opacity-70 saturate-50' : ''
      }`}
    >
      <div className="relative h-44 overflow-hidden bg-paper-100">
        {images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveAssetUrl(images[0].url)}
            alt={l.typeName}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Home className="h-10 w-10 text-paper-300" />
          </div>
        )}
        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          <span className="rounded-panel bg-white/90 px-2.5 py-1 text-sm font-semibold text-paper-900 shadow-sm backdrop-blur">
            {formatMoney(l.baseRent, currency)}
            <span className="text-xs font-normal text-paper-500">/mo</span>
          </span>
        </div>
        {l.vacantCount !== undefined && l.totalCount !== undefined && (
          <span
            className={`absolute bottom-2 left-3 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm ${
              l.vacantCount > 0
                ? 'bg-emerald-500 text-white'
                : 'bg-paper-700/90 text-paper-100'
            }`}
          >
            {l.vacantCount > 0
              ? `${l.vacantCount} of ${l.totalCount} unit${l.totalCount > 1 ? 's' : ''} available`
              : 'Fully booked'}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          aria-label={favorite ? 'Remove from saved homes' : 'Save this home'}
          className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full shadow-sm transition ${
            favorite
              ? 'bg-brand-500 text-white'
              : 'bg-white/90 text-paper-500 backdrop-blur hover:text-brand-600'
          }`}
        >
          <Heart className={`h-4 w-4 ${favorite ? 'fill-current' : ''}`} />
        </button>
        {images.length > 1 && (
          <span className="absolute bottom-2 right-3 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white">
            {images.length} photos
          </span>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-paper-900">{l.typeName}</div>
            <div className="text-sm text-paper-500">{l.property?.name}</div>
          </div>
          {l.property?.verificationStatus === 'VERIFIED' && (
            <span className="badge shrink-0 bg-brand-50 text-brand-700">
              <ShieldCheck className="h-3 w-3" /> Verified
            </span>
          )}
        </div>
        {location && (
          <div className="mt-1.5 flex items-center gap-1 text-xs text-paper-400">
            <MapPin className="h-3 w-3" />
            {location}
          </div>
        )}
        <div className="mt-3 flex items-center gap-4 text-xs text-paper-500">
          <span className="flex items-center gap-1">
            <BedDouble className="h-3.5 w-3.5" />
            {l.bedrooms ? `${l.bedrooms} bed${l.bedrooms > 1 ? 's' : ''}` : '—'}
          </span>
          <span className="flex items-center gap-1">
            <Bath className="h-3.5 w-3.5" />
            {l.bathrooms ? `${l.bathrooms} bath${l.bathrooms > 1 ? 's' : ''}` : '—'}
          </span>
          {l.sizeSqm ? (
            <span className="flex items-center gap-1">
              <Ruler className="h-3.5 w-3.5" /> {l.sizeSqm} m²
            </span>
          ) : null}
        </div>
        {l.description && (
          <p className="mt-3 line-clamp-1 text-xs text-paper-500">{l.description}</p>
        )}
      </div>
    </div>
  );
}

function FeatureRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-3 text-sm text-paper-700">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-card bg-brand-50 text-brand-700">
        {icon}
      </span>
      {text}
    </li>
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
    <div className="rounded-panel bg-paper-50/60 p-3">
      <div className="mx-auto mb-1 flex justify-center text-paper-400">{icon}</div>
      <div className="text-sm font-semibold text-paper-800">{value}</div>
      <div className="text-xs text-paper-400">{label}</div>
    </div>
  );
}

function MarketplaceSkeleton() {
  return (
    <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-card border border-paper-200 bg-white">
          <div className="skeleton h-44 rounded-none" />
          <div className="space-y-3 p-4">
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton h-3 w-1/2" />
            <div className="skeleton h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M13.7 4.3a1 1 0 0 1 0 1.4l-6 6a1 1 0 0 1-1.4 0l-3-3a1 1 0 1 1 1.4-1.4L7 9.6l5.3-5.3a1 1 0 0 1 1.4 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function mapTypeLabel(label: string): string {
  const entry = Object.entries(UNIT_TYPE_LABELS).find(([, v]) => v === label);
  return entry ? entry[0] : '';
}