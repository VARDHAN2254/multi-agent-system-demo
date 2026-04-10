import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Network,
  Package,
  Play,
  RotateCcw,
  Server,
  BarChart,
  Square,
  Truck,
} from 'lucide-react';

type AgentState =
  | 'IDLE'
  | 'ORDER_PLACED'
  | 'VERIFIED'
  | 'PACKED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'FAILED';

interface LogMessage {
  id: number;
  run_id: string;
  agent: string;
  state: AgentState;
  order_id: string;
  payload: unknown;
  timestamp: string;
}

type ViewMode = 'tracking' | 'system' | 'eval';

type StageAccent = 'order' | 'inventory' | 'payment' | 'delivery';

interface StageConfig {
  id: AgentState;
  agent: string;
  icon: LucideIcon;
  title: string;
  avatar: string;
  role: string;
  accent: StageAccent;
}

interface AgentProfile {
  label: string;
  avatar: string;
  role: string;
}

interface InventoryCatalogItem {
  sku: string;
  name: string;
  category: string;
  image: string;
  price: number;
  discount_percent?: number;
  discounted_price?: number;
  delivery_charge?: number;
  estimated_delivery_days?: number;
  season?: string;
  day_name?: string;
  stock_units?: number;
  stock_status?: string;
  rating?: number;
  reviews?: number;
  features?: string[];
}

interface InventoryContext {
  season: string;
  day_name: string;
  day_type: string;
  generated_items: number;
  category_breakdown: Record<string, number>;
}

interface HandoffTransition {
  from: number;
  to: number;
  seq: number;
}

const API_BASE = 'http://localhost:8000/api';
const EvalPanel = lazy(() => import('./lazy/EvalPanel'));
const InventorySheet = lazy(() => import('./lazy/InventorySheet'));

const STAGES: StageConfig[] = [
  {
    id: 'ORDER_PLACED',
    agent: 'OrderAgent',
    icon: Network,
    title: 'Order Concierge',
    avatar: 'OC',
    role: 'Captures customer requests and confirms order intake.',
    accent: 'order',
  },
  {
    id: 'VERIFIED',
    agent: 'InventoryAgent',
    icon: Package,
    title: 'Inventory Steward',
    avatar: 'IS',
    role: 'Curates catalog health, stock confidence, and SKU routing.',
    accent: 'inventory',
  },
  {
    id: 'PACKED',
    agent: 'PaymentAgent',
    icon: CreditCard,
    title: 'Payment Sentinel',
    avatar: 'PS',
    role: 'Authorizes checkout and handles fraud-risk retry branches.',
    accent: 'payment',
  },
  {
    id: 'SHIPPED',
    agent: 'DeliveryAgent',
    icon: Truck,
    title: 'Delivery Navigator',
    avatar: 'DN',
    role: 'Assigns carriers and pushes doorstep delivery progression.',
    accent: 'delivery',
  },
];

const AGENT_PROFILES: Record<string, AgentProfile> = {
  System: {
    label: 'Control Tower',
    avatar: 'CT',
    role: 'Orchestrates run states, sequencing, and protocol telemetry.',
  },
  ...(Object.fromEntries(
    STAGES.map((stage) => [
      stage.agent,
      {
        label: stage.title,
        avatar: stage.avatar,
        role: stage.role,
      },
    ]),
  ) as Record<string, AgentProfile>),
};

const TERMINAL_STATES = new Set<AgentState>(['DELIVERED', 'FAILED']);

const FEATURED_PRODUCTS = [
  { id: '1', name: 'AstraBook Pro 100', category: 'laptops', price: 1299.99 },
  { id: '2', name: 'Vertex One 100', category: 'mobiles', price: 699.99 },
  { id: '3', name: 'Stride Runner 100', category: 'footwear', price: 129.50 },
  { id: '4', name: 'PulseFit Pro 100', category: 'wearables', price: 199.99 },
  { id: '5', name: 'HomeNova Smart 100', category: 'appliances', price: 349.00 },
  { id: '6', name: 'UrbanCarry Classic 100', category: 'accessories', price: 89.99 },
  { id: '7', name: 'NovaBook Air 101', category: 'laptops', price: 899.00 },
  { id: '8', name: 'Nova Pro 101', category: 'mobiles', price: 849.00 },
  { id: '9', name: 'Aero Street 101', category: 'footwear', price: 145.00 },
  { id: '10', name: 'ZenWear Sport 102', category: 'wearables', price: 249.50 },
];

const INVENTORY_BLUEPRINTS = [
  {
    slug: 'LAP',
    category: 'Laptops',
    count: 220,
    brands: ['AstraBook', 'NovaBook', 'ZenBook', 'TitanBook', 'OrbitBook', 'PulseBook', 'VertexBook', 'HaloBook'],
    lines: ['Pro', 'Air', 'Max', 'Ultra', 'Prime', 'Edge'],
    priceMin: 700,
    priceMax: 3200,
    baseDiscount: 14,
    baseDelivery: 69,
    baseDeliveryDays: 3,
  },
  {
    slug: 'MOB',
    category: 'Mobiles',
    count: 220,
    brands: ['Vertex', 'Nova', 'Astra', 'Zen', 'Pulse', 'Halo', 'Orbit', 'Titan'],
    lines: ['One', 'Pro', 'Max', 'Ultra', 'Lite', 'Edge'],
    priceMin: 220,
    priceMax: 1800,
    baseDiscount: 12,
    baseDelivery: 39,
    baseDeliveryDays: 2,
  },
  {
    slug: 'FTW',
    category: 'Footwear',
    count: 220,
    brands: ['Stride', 'Aero', 'Flex', 'Urban', 'Trail', 'Sprint', 'Pulse', 'Drift'],
    lines: ['Runner', 'Street', 'Sport', 'Active', 'Lite', 'Flow'],
    priceMin: 35,
    priceMax: 280,
    baseDiscount: 18,
    baseDelivery: 19,
    baseDeliveryDays: 2,
  },
  {
    slug: 'WRB',
    category: 'Wearables',
    count: 220,
    brands: ['PulseFit', 'NovaFit', 'ZenWear', 'TitanWear', 'OrbitWear', 'HaloFit', 'VertexFit', 'AstraFit'],
    lines: ['Pro', 'Lite', 'Sport', 'Active', 'Prime', 'Edge'],
    priceMin: 55,
    priceMax: 720,
    baseDiscount: 17,
    baseDelivery: 24,
    baseDeliveryDays: 2,
  },
  {
    slug: 'HOM',
    category: 'Home Appliances',
    count: 220,
    brands: ['HomeNova', 'AstraHome', 'ZenNest', 'TitanHome', 'OrbitHome', 'PulseHome', 'VertexHome', 'HaloHome'],
    lines: ['Smart', 'Plus', 'Prime', 'Ultra', 'Eco', 'Max'],
    priceMin: 120,
    priceMax: 2600,
    baseDiscount: 13,
    baseDelivery: 89,
    baseDeliveryDays: 4,
  },
  {
    slug: 'ACS',
    category: 'Accessories',
    count: 220,
    brands: ['UrbanCarry', 'TrailPack', 'MetroBag', 'SwiftGear', 'Voyage', 'AeroCarry', 'DriftPack', 'PulsePack'],
    lines: ['Classic', 'Pro', 'Lite', 'Travel', 'Active', 'Edge'],
    priceMin: 18,
    priceMax: 320,
    baseDiscount: 20,
    baseDelivery: 14,
    baseDeliveryDays: 2,
  },
];

const PRODUCT_DATA_MAP: Record<string, { images: string[]; features: string[][] }> = {
  Laptops: {
    images: [
      'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1531297172864-45d2604d44b4?fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1629131726692-1accd0c53ce0?fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?fit=crop&w=800&q=80'
    ],
    features: [
      ['16GB RAM', '512GB SSD', '14" Retina Display'],
      ['32GB RAM', '1TB NVMe', 'M2 Pro Chip'],
      ['8GB RAM', '256GB SSD', 'FHD Display'],
      ['64GB RAM', '2TB SSD', 'RTX 4090 GPU'],
    ]
  },
  Mobiles: {
    images: [
      'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1598327105666-5b89351cb315?fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1601784551446-20c9e07cd8fa?fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1592899677977-9c10ca588bb3?fit=crop&w=800&q=80'
    ],
    features: [
      ['128GB Storage', 'OLED Display', '5G Ready'],
      ['256GB Storage', '120Hz Refresh', 'Triple Camera'],
      ['512GB Storage', 'Ultra Wide Lens', 'Face ID'],
      ['1TB Storage', 'Snapdragon 8 Gen 3', 'Fast Charge'],
    ]
  },
  Footwear: {
    images: [
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1515955656352-a1fa3ffcd111?fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1460353581641-37baddab0fa2?fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1608231387042-66d1773070a5?fit=crop&w=800&q=80'
    ],
    features: [
      ['Breathable Mesh', 'Shock Absorbent', 'Lightweight'],
      ['Premium Leather', 'Slip Resistant', 'Memory Foam'],
      ['Waterproof', 'Trail Ready', 'Ankle Support'],
      ['Carbon Fiber Plate', 'Marathon Prep', 'Snug Fit'],
    ]
  },
  Wearables: {
    images: [
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1546868871-7041f2a55e12?fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1508685096538-4fa315053787?fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?fit=crop&w=800&q=80'
    ],
    features: [
      ['Heart Rate Monitor', '7-Day Battery', 'GPS Built-in'],
      ['ECG Sensor', 'Always-On Display', 'Water Resistant'],
      ['Sleep Tracking', 'OLED Screen', 'Wireless Charging'],
      ['Titanium Case', 'LTE Support', 'Sapphire Glass'],
    ]
  },
  'Home Appliances': {
    images: [
      'https://images.unsplash.com/photo-1556910103-1c02745aae4d?fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1585807963381-1b07ab68037a?fit=crop&w=800&q=80'
    ],
    features: [
      ['Energy Star Rated', 'Smart Connect', 'Silent Motor'],
      ['Wi-Fi Enabled', 'Voice Control', 'Premium Finish'],
      ['Eco Mode', '10-Year Warranty', 'Compact Design'],
    ]
  },
  Accessories: {
    images: [
      'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1491637639811-60e2756cc1c7?fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?fit=crop&w=800&q=80'
    ],
    features: [
      ['Water Repellent', 'Anti-Theft', 'USB Charging Port'],
      ['Genuine Leather', 'RFID Protection', 'Slim Profile'],
      ['Ergonomic Strap', '15" Laptop Sleeve', 'Multi-Compartment'],
    ]
  }
};
const EMPTY_PAYLOAD: Record<string, any> = Object.freeze({});

function fallbackAvatarLabel(agent: string): string {
  const normalized = agent
    .replace(/Agent$/u, '')
    .replace(/([a-z])([A-Z])/gu, '$1 $2')
    .trim();

  if (normalized.length === 0) {
    return 'AG';
  }

  const initials = normalized
    .split(/\s+/u)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (initials || normalized.slice(0, 2).toUpperCase()).slice(0, 2);
}

function getAgentProfile(agent: string): AgentProfile {
  return (
    AGENT_PROFILES[agent] ?? {
      label: agent,
      avatar: fallbackAvatarLabel(agent),
      role: 'Pipeline worker',
    }
  );
}

function seededRandomNumber(seed: number, salt: number): number {
  const x = Math.sin(seed * 9301 + salt * 49297 + 233280) * 10000;
  return x - Math.floor(x);
}

function seasonFromMonth(month: number): string {
  if (month === 11 || month === 0 || month === 1) return 'Winter';
  if (month >= 2 && month <= 4) return 'Summer';
  if (month >= 5 && month <= 8) return 'Monsoon';
  return 'Festive';
}

function seasonAdjustmentsValue(season: string): { discountAdj: number; chargeAdj: number; dayAdj: number } {
  const map: Record<string, { discountAdj: number; chargeAdj: number; dayAdj: number }> = {
    Winter: { discountAdj: 4, chargeAdj: 2, dayAdj: 1 },
    Summer: { discountAdj: 6, chargeAdj: 1, dayAdj: 0 },
    Monsoon: { discountAdj: 9, chargeAdj: 4, dayAdj: 2 },
    Festive: { discountAdj: 12, chargeAdj: 6, dayAdj: 1 },
  };
  return map[season] ?? { discountAdj: 5, chargeAdj: 2, dayAdj: 1 };
}

function dayAdjustmentsValue(dayName: string): { discountAdj: number; chargeAdj: number; dayAdj: number } {
  const map: Record<string, { discountAdj: number; chargeAdj: number; dayAdj: number }> = {
    Monday: { discountAdj: 5, chargeAdj: -2, dayAdj: 0 },
    Tuesday: { discountAdj: 4, chargeAdj: -1.5, dayAdj: 0 },
    Wednesday: { discountAdj: 3, chargeAdj: -1, dayAdj: 0 },
    Thursday: { discountAdj: 2, chargeAdj: 0, dayAdj: 0 },
    Friday: { discountAdj: 1, chargeAdj: 1.5, dayAdj: 0 },
    Saturday: { discountAdj: -2, chargeAdj: 3.5, dayAdj: 1 },
    Sunday: { discountAdj: -3, chargeAdj: 4, dayAdj: 1 },
  };
  return map[dayName] ?? { discountAdj: 0, chargeAdj: 0, dayAdj: 0 };
}

function generateFallbackInventory(seed: number, referenceDate: Date): { catalog: InventoryCatalogItem[]; context: InventoryContext } {
  const season = seasonFromMonth(referenceDate.getMonth());
  const dayName = referenceDate.toLocaleDateString('en-US', { weekday: 'long' });
  const dayType = dayName === 'Saturday' || dayName === 'Sunday' ? 'Weekend' : 'Weekday';

  const seasonAdj = seasonAdjustmentsValue(season);
  const dayAdj = dayAdjustmentsValue(dayName);

  const catalog: InventoryCatalogItem[] = [];
  let globalIndex = 0;

  for (const blueprint of INVENTORY_BLUEPRINTS) {
    for (let itemIndex = 0; itemIndex < blueprint.count; itemIndex += 1) {
      globalIndex += 1;
      const saltBase = globalIndex * 97 + seed * 13;
      const brand = blueprint.brands[itemIndex % blueprint.brands.length];
      const line = blueprint.lines[itemIndex % blueprint.lines.length];
      const modelNumber = 100 + itemIndex;
      const name = `${brand} ${line} ${modelNumber}`;

      const priceNoise = seededRandomNumber(seed, saltBase + 7);
      const price = Number((blueprint.priceMin + priceNoise * (blueprint.priceMax - blueprint.priceMin)).toFixed(2));

      const discountNoise = Math.floor(seededRandomNumber(seed, saltBase + 19) * 11);
      const discountPercent = Math.max(
        5,
        Math.min(65, blueprint.baseDiscount + seasonAdj.discountAdj + dayAdj.discountAdj + discountNoise - 4),
      );

      const discountedPrice = Number((price * (1 - discountPercent / 100)).toFixed(2));

      const deliveryNoise = Math.floor(seededRandomNumber(seed, saltBase + 31) * 8);
      const deliveryCharge = Number(
        Math.max(0, blueprint.baseDelivery + seasonAdj.chargeAdj + dayAdj.chargeAdj + deliveryNoise - 3).toFixed(2),
      );

      const estimatedDeliveryDays = Math.max(
        1,
        blueprint.baseDeliveryDays + seasonAdj.dayAdj + dayAdj.dayAdj + Math.floor(seededRandomNumber(seed, saltBase + 43) * 2),
      );

      const stockUnits = Math.floor(1 + seededRandomNumber(seed, saltBase + 59) * 95);
      const stockStatus = stockUnits > 28 ? 'In Stock' : stockUnits > 9 ? 'Low Stock' : 'Out of Stock';

      const catData = PRODUCT_DATA_MAP[blueprint.category] || PRODUCT_DATA_MAP['Laptops'];
      const imgTarget = catData.images[itemIndex % catData.images.length];
      const featsTarget = catData.features[itemIndex % catData.features.length];
      const ratingVal = Number((3.8 + seededRandomNumber(seed, saltBase + 99) * 1.1).toFixed(1));
      const reviewsVal = Math.floor(12 + seededRandomNumber(seed, saltBase + 101) * 1480);

      catalog.push({
        sku: `NVK-${blueprint.slug}-${String(itemIndex + 1).padStart(4, '0')}`,
        name,
        category: blueprint.category,
        image: imgTarget,
        price,
        discount_percent: discountPercent,
        discounted_price: discountedPrice,
        delivery_charge: deliveryCharge,
        estimated_delivery_days: estimatedDeliveryDays,
        stock_units: stockUnits,
        stock_status: stockStatus,
        rating: ratingVal,
        reviews: reviewsVal,
        features: featsTarget,
        season,
        day_name: dayName,
      });
    }
  }

  return {
    catalog,
    context: {
      season,
      day_name: dayName,
      day_type: dayType,
      generated_items: catalog.length,
      category_breakdown: Object.fromEntries(
        INVENTORY_BLUEPRINTS.map((blueprint) => [blueprint.category, blueprint.count]),
      ) as Record<string, number>,
    },
  };
}

function parsePayload(payload: unknown): Record<string, any> {
  if (payload && typeof payload === 'object') {
    return payload as Record<string, any>;
  }
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, any>;
      }
    } catch {
      return { value: payload };
    }
  }
  return EMPTY_PAYLOAD;
}

function compactPayloadForProtocol(payload: unknown): Record<string, unknown> {
  const parsed = parsePayload(payload);
  if (parsed === EMPTY_PAYLOAD || Object.keys(parsed).length === 0) {
    return { note: 'no payload yet' };
  }

  const compact: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (key === 'inventory_catalog' && Array.isArray(value)) {
      const categories = Array.from(
        new Set(
          value
            .map((entry) =>
              entry && typeof entry === 'object'
                ? String((entry as Record<string, unknown>).category ?? 'General')
                : 'General',
            )
            .slice(0, 200),
        ),
      );
      compact.inventory_catalog_items = value.length;
      compact.inventory_categories = categories;
      continue;
    }

    if (key === 'inventory_context' && value && typeof value === 'object') {
      const ctx = value as Record<string, unknown>;
      compact.inventory_context = {
        season: ctx.season ?? '-',
        day_name: ctx.day_name ?? '-',
        day_type: ctx.day_type ?? '-',
        generated_items: ctx.generated_items ?? 0,
      };
      continue;
    }

    if (Array.isArray(value)) {
      compact[key] = `${value.length} items`;
      continue;
    }

    if (value && typeof value === 'object') {
      compact[key] = `${Object.keys(value as Record<string, unknown>).length} fields`;
      continue;
    }

    compact[key] = value;
  }

  return compact;
}

function stateClass(state: AgentState): string {
  return `state-pill state-${state.toLowerCase().replace('_', '-')}`;
}

function formatCurrency(value: unknown): string {
  const numValue = Number(value);
  if (Number.isNaN(numValue)) {
    return '-';
  }
  return `$${numValue.toFixed(2)}`;
}

function stockTone(status: string): string {
  if (status === 'In Stock') return 'tone-success';
  if (status === 'Low Stock') return 'tone-warning';
  if (status === 'Out of Stock') return 'tone-danger';
  return '';
}

function App() {
  const [seed, setSeed] = useState(42);
  const [orderId, setOrderId] = useState('1');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [currentState, setCurrentState] = useState<AgentState>('IDLE');
  const [activeAgent, setActiveAgent] = useState<string>('System');
  const [view, setView] = useState<ViewMode>('tracking');
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inventoryCategory, setInventoryCategory] = useState<string>('All');
  const [bookedItem, setBookedItem] = useState<InventoryCatalogItem | null>(null);
  const [bookingTransitionActive, setBookingTransitionActive] = useState(false);
  const [handoff, setHandoff] = useState<HandoffTransition | null>(null);
  const [isSystemEntering, setIsSystemEntering] = useState(false);

  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFetchedLogIdRef = useRef<number | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const previousActiveStageRef = useRef(-1);
  const previousViewRef = useRef<ViewMode>('tracking');
  const bookingTransitionTimerRef = useRef<number | null>(null);

  const stopRun = () => {
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
      pollInterval.current = null;
    }
    setActiveRunId(null);
  };

  const resetRun = () => {
    stopRun();
    setLogs([]);
    setCurrentState('IDLE');
    setActiveAgent('System');
    lastFetchedLogIdRef.current = null;
    setInventoryOpen(false);
    setHandoff(null);
  };

  const triggerBookingTransition = () => {
    setBookingTransitionActive(true);
    if (bookingTransitionTimerRef.current !== null) {
      window.clearTimeout(bookingTransitionTimerRef.current);
    }
    bookingTransitionTimerRef.current = window.setTimeout(() => {
      setBookingTransitionActive(false);
    }, 1300);
  };

  const handleSelectInventoryItem = (item: InventoryCatalogItem) => {
    setBookedItem(item);
    const featuredMatch = FEATURED_PRODUCTS.find(
      (product) => product.name.toLowerCase() === item.name.toLowerCase(),
    );
    if (featuredMatch) {
      setOrderId(featuredMatch.id);
    }
    triggerBookingTransition();
  };

  const handleBookItem = (item: InventoryCatalogItem) => {
    handleSelectInventoryItem(item);
    window.setTimeout(() => {
      setInventoryOpen(false);
    }, 320);
  };

  const triggerSimulatedRun = () => {
    let step = 0;
    setLogs([]);
    setCurrentState('IDLE');
    const mockOrderLabels: Record<string, string> = {
      '1': 'AstraBook Pro 100',
      '2': 'Vertex One 100',
      '3': 'Stride Runner 100',
      '4': 'PulseFit Pro 100',
      '5': 'HomeNova Smart 100',
      '6': 'UrbanCarry Classic 100',
      '7': 'NovaBook Air 101',
      '8': 'Nova Pro 101',
      '9': 'Aero Street 101',
      '10': 'ZenWear Sport 102',
    };
    const mockItemName = bookedItem?.name ?? mockOrderLabels[orderId] ?? 'AstraBook Pro 100';
    const fallbackPack = generateFallbackInventory(seed, new Date());
    const fallbackCatalog = fallbackPack.catalog;
    const fallbackContext = fallbackPack.context;
    const fallbackSelectedSku =
      bookedItem?.sku ?? fallbackCatalog[Math.max(0, Number(orderId || '1') - 1)]?.sku ?? 'NVK-LAP-0001';
    const mockAmount = Number(bookedItem?.discounted_price ?? bookedItem?.price ?? 1999.99);

    const mockFlow: Array<{ agent: string; state: AgentState; payload: Record<string, any> }> = [
      { agent: 'System', state: 'IDLE', payload: { status: 'initialized', seed } },
      {
        agent: 'OrderAgent',
        state: 'ORDER_PLACED',
        payload: {
          customer: bookedItem ? 'Catalog Buyer' : 'John Doe',
          item: mockItemName,
          amount: mockAmount,
          selected_sku: fallbackSelectedSku,
          discount_percent: bookedItem?.discount_percent,
          rating: bookedItem?.rating,
          reviews: bookedItem?.reviews,
          features: bookedItem?.features ?? [],
        },
      },
      {
        agent: 'InventoryAgent',
        state: 'VERIFIED',
        payload: {
          stock_status: 'In Stock',
          confidence: 0.85,
          selected_sku: fallbackSelectedSku,
          inventory_context: fallbackContext,
          inventory_catalog: fallbackCatalog,
        },
      },
      {
        agent: 'PaymentAgent',
        state: 'PACKED',
        payload: { payment_status: 'Authorized', fraud_risk: 0.12 },
      },
      {
        agent: 'DeliveryAgent',
        state: 'SHIPPED',
        payload: {
          pass: true,
          stock_confidence: 0.85,
          fraud_risk: 0.12,
          delivery_days: 3,
          partner: 'FedEx',
        },
      },
      { agent: 'System', state: 'DELIVERED', payload: { execution_time_ms: 3200 } },
    ];

    pollInterval.current = setInterval(() => {
      if (step >= mockFlow.length) {
        if (pollInterval.current) {
          clearInterval(pollInterval.current);
          pollInterval.current = null;
        }
        return;
      }

      const currentItem = mockFlow[step];
      setLogs((prev) => [
        ...prev,
        {
          id: step,
          run_id: 'demo',
          agent: currentItem.agent,
          state: currentItem.state,
          order_id: bookedItem ? `BOOK-${fallbackSelectedSku}` : orderId,
          payload: currentItem.payload,
          timestamp: new Date().toISOString(),
        },
      ]);
      setCurrentState(currentItem.state);
      setActiveAgent(currentItem.agent);
      step += 1;
    }, 1000);
  };

  const startRun = async () => {
    resetRun();
    try {
      const requestBody: Record<string, unknown> = {
        order_id: bookedItem ? `BOOK-${bookedItem.sku}` : orderId,
        seed,
      };
      if (bookedItem) {
        requestBody.booked_item = {
          sku: bookedItem.sku,
          name: bookedItem.name,
          category: bookedItem.category,
          price: Number(bookedItem.price ?? 0),
          discounted_price: Number(bookedItem.discounted_price ?? bookedItem.price ?? 0),
          discount_percent: Number(bookedItem.discount_percent ?? 0),
          rating: Number(bookedItem.rating ?? 0),
          reviews: Number(bookedItem.reviews ?? 0),
          features: Array.isArray(bookedItem.features) ? bookedItem.features : [],
          quantity: 1,
        };
      }

      const res = await fetch(`${API_BASE}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        throw new Error('API Route Failed');
      }

      const data = await res.json();
      setActiveRunId(data.run_id);
    } catch (error) {
      console.error('Falling back to simulated run:', error);
      triggerSimulatedRun();
    }
  };

  useEffect(() => {
    if (!activeRunId) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const params = new URLSearchParams({
          limit: '500',
        });
        if (lastFetchedLogIdRef.current !== null) {
          params.set('since_id', String(lastFetchedLogIdRef.current));
        }

        const res = await fetch(`${API_BASE}/logs/${activeRunId}?${params.toString()}`);
        const data = await res.json();

        if (!data.history || data.history.length === 0) {
          return;
        }

        const parsedLogs: LogMessage[] = data.history.map((log: any) => {
          let payload: unknown = log.payload;
          if (typeof payload === 'string') {
            try {
              payload = JSON.parse(payload);
            } catch {
              payload = log.payload;
            }
          }

          return {
            id: Number(log.id ?? 0),
            run_id: log.run_id,
            agent: log.agent,
            state: log.state,
            order_id: log.order_id,
            payload,
            timestamp: log.timestamp,
          };
        });

        setLogs((prevLogs) => {
          const knownIds = new Set(prevLogs.map((entry) => entry.id));
          const nextLogs = [...prevLogs];
          for (const log of parsedLogs) {
            if (!knownIds.has(log.id)) {
              nextLogs.push(log);
            }
          }
          return nextLogs;
        });

        const latestLog = parsedLogs[parsedLogs.length - 1];
        lastFetchedLogIdRef.current = Number(data.last_id ?? latestLog.id);
        setCurrentState(latestLog.state);
        setActiveAgent(latestLog.agent);

        if (TERMINAL_STATES.has(latestLog.state)) {
          clearInterval(interval);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeRunId]);

  const metrics = useMemo(() => {
    let conf = 0;
    let fraud = 0;
    let days = 0;
    let time = 0;
    let pass = false;

    logs.forEach((log) => {
      const payload = parsePayload(log.payload);
      if (payload.stock_confidence !== undefined) conf = Number(payload.stock_confidence);
      if (payload.fraud_risk !== undefined) fraud = Number(payload.fraud_risk);
      if (payload.delivery_days !== undefined) days = Number(payload.delivery_days);
      if (payload.execution_time_ms !== undefined) time = Number(payload.execution_time_ms);
      if (payload.pass !== undefined) pass = Boolean(payload.pass);
    });

    return { conf, fraud, days, time, pass };
  }, [logs]);

  const orderData = useMemo(
    () => parsePayload(logs.find((log) => log.agent === 'OrderAgent')?.payload),
    [logs],
  );

  const inventoryData = useMemo(
    () => parsePayload([...logs].reverse().find((log) => log.agent === 'InventoryAgent')?.payload),
    [logs],
  );

  const paymentData = useMemo(
    () => parsePayload([...logs].reverse().find((log) => log.agent === 'PaymentAgent')?.payload),
    [logs],
  );

  const deliveryData = useMemo(
    () => parsePayload([...logs].reverse().find((log) => log.agent === 'DeliveryAgent')?.payload),
    [logs],
  );
  const fallbackInventoryPack = useMemo(() => generateFallbackInventory(seed, new Date()), [seed]);

  const inventoryCatalog = useMemo<InventoryCatalogItem[]>(() => {
    const rawCatalog = inventoryData.inventory_catalog;
    if (!Array.isArray(rawCatalog) || rawCatalog.length === 0) {
      return fallbackInventoryPack.catalog;
    }

    return rawCatalog.map((item: any, index: number) => {
      const cat = String(item.category ?? 'General');
      // Force lookup for high-res native Unsplash photography and realistic metadata
      const catData = PRODUCT_DATA_MAP[cat] || PRODUCT_DATA_MAP['Laptops'];
      const imgTarget = catData.images[index % catData.images.length];
      const featsTarget = catData.features[index % catData.features.length];
      const ratingVal = Number((3.8 + seededRandomNumber(seed, 99 + index) * 1.1).toFixed(1));
      const reviewsVal = Math.floor(12 + seededRandomNumber(seed, 101 + index) * 1480);

      return {
        sku: String(item.sku ?? `NVK-X${index}`),
        name: String(item.name ?? 'Unknown Item'),
        category: cat,
        image: imgTarget,
        price: Number(item.price ?? 0),
        discount_percent: Number(item.discount_percent ?? 0),
        discounted_price: Number(item.discounted_price ?? item.price ?? 0),
        delivery_charge: Number(item.delivery_charge ?? 0),
        estimated_delivery_days: Number(item.estimated_delivery_days ?? 0),
        season: String(item.season ?? ''),
        day_name: String(item.day_name ?? ''),
        stock_units: Number(item.stock_units ?? 0),
        stock_status: String(item.stock_status ?? 'Unknown'),
        rating: Number(item.rating ?? ratingVal),
        reviews: Number(item.reviews ?? reviewsVal),
        features: Array.isArray(item.features) ? item.features : featsTarget,
      };
    });
  }, [inventoryData, seed, fallbackInventoryPack]);

  const inventoryContext = useMemo<InventoryContext>(() => {
    const rawContext = inventoryData.inventory_context;
    if (rawContext && typeof rawContext === 'object') {
      const parsed = rawContext as Record<string, unknown>;
      return {
        season: String(parsed.season ?? ''),
        day_name: String(parsed.day_name ?? ''),
        day_type: String(parsed.day_type ?? ''),
        generated_items: Number(parsed.generated_items ?? inventoryCatalog.length),
        category_breakdown:
          typeof parsed.category_breakdown === 'object' && parsed.category_breakdown
            ? (parsed.category_breakdown as Record<string, number>)
            : {},
      };
    }

    const inferredSeason = inventoryCatalog[0]?.season ?? fallbackInventoryPack.context.season;
    const inferredDay = inventoryCatalog[0]?.day_name ?? fallbackInventoryPack.context.day_name;
    const breakdown = inventoryCatalog.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + 1;
      return acc;
    }, {});

    return {
      season: inferredSeason,
      day_name: inferredDay,
      day_type: inferredDay === 'Saturday' || inferredDay === 'Sunday' ? 'Weekend' : 'Weekday',
      generated_items: inventoryCatalog.length,
      category_breakdown: breakdown,
    };
  }, [inventoryCatalog, inventoryData, fallbackInventoryPack]);

  const selectedInventorySku = useMemo(() => {
    if (bookedItem?.sku) {
      return bookedItem.sku;
    }
    if (typeof inventoryData.selected_sku === 'string' && inventoryData.selected_sku.trim().length > 0) {
      return inventoryData.selected_sku;
    }
    const orderedItemName = String(orderData.item_name ?? orderData.item ?? '').toLowerCase();
    const matched = inventoryCatalog.find((item) => item.name.toLowerCase() === orderedItemName);
    return matched?.sku ?? '';
  }, [bookedItem, inventoryCatalog, inventoryData, orderData]);

  const inventoryCategories = useMemo<[string, number][]>(() => {
    const grouped = Object.entries(
      inventoryCatalog.reduce<Record<string, number>>((acc, item) => {
        acc[item.category] = (acc[item.category] ?? 0) + 1;
        return acc;
      }, {}),
    ).sort((a, b) => a[0].localeCompare(b[0]));

    return [['All', inventoryCatalog.length], ...grouped];
  }, [inventoryCatalog]);

  const filteredInventoryCatalog = useMemo(() => {
    if (inventoryCategory === 'All') {
      return inventoryCatalog;
    }
    return inventoryCatalog.filter((item) => item.category === inventoryCategory);
  }, [inventoryCatalog, inventoryCategory]);
  const protocolLogs = useMemo(() => logs.slice(-80), [logs]);

  const visitedStageIndices = STAGES.reduce<number[]>((acc, stage, index) => {
    if (logs.some((log) => log.agent === stage.agent)) {
      acc.push(index);
    }
    return acc;
  }, []);
  const highestVisited = visitedStageIndices.length > 0 ? Math.max(...visitedStageIndices) : -1;
  const activeStageIndex = STAGES.findIndex((stage) => stage.agent === activeAgent);

  const progressIndex =
    currentState === 'DELIVERED'
      ? STAGES.length - 1
      : Math.max(highestVisited, activeStageIndex, currentState === 'IDLE' ? -1 : 0);
  const handoffStart = handoff ? Math.min(handoff.from, handoff.to) : -1;
  const handoffEnd = handoff ? Math.max(handoff.from, handoff.to) : -1;

  useEffect(() => {
    if (activeStageIndex === -1) {
      previousActiveStageRef.current = -1;
      return;
    }

    const previousStageIndex = previousActiveStageRef.current;
    if (previousStageIndex !== -1 && previousStageIndex !== activeStageIndex) {
      setHandoff({
        from: previousStageIndex,
        to: activeStageIndex,
        seq: Date.now(),
      });
      const timeout = setTimeout(() => setHandoff(null), 920);
      previousActiveStageRef.current = activeStageIndex;
      return () => clearTimeout(timeout);
    }

    previousActiveStageRef.current = activeStageIndex;
    return;
  }, [activeStageIndex]);

  useEffect(() => {
    if (previousViewRef.current !== view && view === 'system') {
      setIsSystemEntering(true);
      const timeout = setTimeout(() => setIsSystemEntering(false), 900);
      previousViewRef.current = view;
      return () => clearTimeout(timeout);
    }
    if (view !== 'system') {
      setIsSystemEntering(false);
    }
    previousViewRef.current = view;
    return;
  }, [view]);

  useEffect(() => {
    if (view !== 'tracking') {
      setInventoryOpen(false);
    }
  }, [view]);

  useEffect(() => {
    if (inventoryCategories.length === 0) {
      setInventoryCategory('All');
      return;
    }

    const hasActive = inventoryCategories.some(([name]) => name === inventoryCategory);
    if (!hasActive) {
      setInventoryCategory(inventoryCategories[0][0]);
    }
  }, [inventoryCategories, inventoryCategory]);

  useEffect(() => {
    if (view !== 'system' || !logContainerRef.current) {
      return;
    }

    const panel = logContainerRef.current;
    const distanceFromBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight;
    const runActive = !TERMINAL_STATES.has(currentState) && currentState !== 'IDLE';

    if (!runActive || distanceFromBottom <= 88 || previousViewRef.current !== 'system' || panel.scrollTop === 0) {
      [10, 150, 450, 850].forEach(delay => {
        setTimeout(() => {
          if (panel) {
             panel.scrollTop = panel.scrollHeight;
          }
        }, delay);
      });
    }
  }, [logs, view, currentState]);

  useEffect(() => {
    if (!inventoryOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setInventoryOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inventoryOpen]);

  useEffect(
    () => () => {
      if (bookingTransitionTimerRef.current !== null) {
        window.clearTimeout(bookingTransitionTimerRef.current);
      }
    },
    [],
  );

  const currentBadgeLabel = currentState.replace('_', ' ');
  const activeAgentProfile = getAgentProfile(activeAgent);

  const isRunning = !TERMINAL_STATES.has(currentState) && currentState !== 'IDLE';
  const runVisualState =
    isRunning ? 'running' : currentState === 'DELIVERED' ? 'success' : currentState === 'FAILED' ? 'failed' : 'idle';
  const liveLabel =
    runVisualState === 'running'
      ? 'Live Processing'
      : runVisualState === 'success'
      ? 'Delivered'
      : runVisualState === 'failed'
      ? 'Run Failed'
      : 'Waiting';
  const progressPercent =
    currentState === 'IDLE'
      ? 0
      : currentState === 'DELIVERED'
      ? 100
      : Math.min(100, Math.max(8, ((Math.max(progressIndex, 0) + 0.35) / STAGES.length) * 100));

  const runHealth = [
    {
      label:
        currentState === 'FAILED' && metrics.conf <= 0.6
          ? 'Out of stock path triggered: order cancelled.'
          : 'Out of stock cancellation path not triggered.',
      tone: currentState === 'FAILED' && metrics.conf <= 0.6 ? 'danger' : 'neutral',
    },
    {
      label: logs.some((log) => parsePayload(log.payload).attempt > 1)
        ? 'Payment retry flow executed due to elevated risk.'
        : 'Payment retry path not triggered.',
      tone: logs.some((log) => parsePayload(log.payload).attempt > 1) ? 'warn' : 'neutral',
    },
    {
      label:
        currentState === 'FAILED' && metrics.conf > 0.6
          ? 'Delivery retry ceiling reached before completion.'
          : 'Delivery escalation path not triggered.',
      tone: currentState === 'FAILED' && metrics.conf > 0.6 ? 'danger' : 'neutral',
    },
  ];

  const bookedDiscountPercent = Math.max(0, Number(bookedItem?.discount_percent ?? 0));
  const bookedFeaturePreview = Array.isArray(bookedItem?.features) ? bookedItem!.features.slice(0, 3) : [];

  return (
    <div
      className={`app-shell ${inventoryOpen ? 'inventory-focus' : ''} ${
        bookingTransitionActive ? 'booking-transition-active' : ''
      }`}
    >
      <div className="ambient ambient-top" aria-hidden="true" />
      <div className="ambient ambient-bottom" aria-hidden="true" />
      <div className={`booking-warp ${bookingTransitionActive ? 'is-active' : ''}`} aria-hidden="true" />

      <main className="dashboard">
        <header className={`surface topbar topbar-${runVisualState}`}>
          <div>
            <p className="kicker">NovaKart Commerce Cloud</p>
            <h1>NovaKart</h1>
            <p className="subtitle">
              Fast, reliable delivery with live order updates from checkout to doorstep.
            </p>
            <div className="hero-status-row">
              <span className={`live-indicator status-${runVisualState}`}>{liveLabel}</span>
              <span className="transition-count">{logs.length} transition events</span>
              <span className="active-agent-tag">
                <span className="agent-inline-avatar">{activeAgentProfile.avatar}</span>
                {activeAgentProfile.label}
              </span>
            </div>
            <div className="hero-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPercent)}>
              <span style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
          <div
            className={`tab-switch ${view === 'tracking' ? 'tracking-active' : 'system-active'}`}
            role="tablist"
            aria-label="Dashboard view selector"
          >
            <button
              type="button"
              className={`tab-btn ${view === 'tracking' ? 'is-active' : ''}`}
              onClick={() => setView('tracking')}
              role="tab"
              aria-selected={view === 'tracking'}
            >
              <Package size={16} />
              Live Tracking
            </button>
            <button
              type="button"
              className={`tab-btn ${view === 'system' ? 'is-active' : ''}`}
              onClick={() => setView('system')}
              role="tab"
              aria-selected={view === 'system'}
            >
              <Server size={16} />
              System Console
            </button>
            <button
              type="button"
              className={`tab-btn ${view === 'eval' ? 'is-active' : ''}`}
              onClick={() => setView('eval')}
              role="tab"
              aria-selected={view === 'eval'}
            >
              <BarChart size={16} />
              Evaluation Benchmark
            </button>
          </div>
        </header>

        <section className="surface controls-panel">
          <div className="order-selection-carousel">
            <span className="field-label" style={{ marginBottom: "0.8rem", display: "inline-block" }}>
              Select Item to Purchase (Powered by Catalog Ratings)
            </span>
            <div className="product-scroll-track" style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem', scrollbarWidth: 'thin' }}>
              {FEATURED_PRODUCTS.map(product => {
                const pData = PRODUCT_DATA_MAP[product.category.replace(/^./, c => c.toUpperCase())] || PRODUCT_DATA_MAP['Laptops'];
                const thumbnail = pData.images[Number(product.id) % pData.images.length];
                
                return (
                <div
                  key={product.id}
                  className={`product-card ${orderId === product.id && bookedItem === null ? 'is-selected' : ''}`}
                  onClick={() => {
                    setOrderId(product.id);
                    setBookedItem(null);
                  }}
                >
                  <div className="product-image-container">
                    <img src={thumbnail} loading="lazy" alt={product.name} />
                  </div>
                  <div className="product-card-body">
                    <h4>{product.name}</h4>
                    <span className="price-tag">${product.price.toFixed(2)}</span>
                  </div>
                  {orderId === product.id && bookedItem === null && <div className="product-check"><CheckCircle2 size={16} /></div>}
                </div>
              )})}
            </div>
          </div>

          <div className="controls-grid" style={{ marginTop: '0.5rem', gridTemplateColumns: 'minmax(200px, 300px)' }}>
            <label className="field">
              <span className="field-label">PRNG Base Seed</span>
              <input
                type="number"
                className="input-field"
                value={seed}
                onChange={(event) => setSeed(Number(event.target.value))}
              />
            </label>
          </div>

          <div className={`booked-item-panel ${bookedItem ? 'is-active' : ''} ${bookingTransitionActive ? 'is-booking' : ''}`}>
            {bookedItem ? (
              <>
                <div className="booked-item-head">
                  <p className="booked-item-kicker">Booked From Inventory</p>
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => setInventoryOpen(true)}
                  >
                    Change Item
                  </button>
                </div>
                <div className="booked-item-grid">
                  <div className="booked-item-main">
                    <h4>{bookedItem.name}</h4>
                    <p className="booked-item-meta">
                      SKU {bookedItem.sku} • {bookedItem.category}
                    </p>
                    <div className="booked-item-features">
                      {bookedFeaturePreview.map((feature) => (
                        <span key={feature}>{feature}</span>
                      ))}
                    </div>
                  </div>
                  <div className="booked-item-stats">
                    <p>
                      <span>Rating</span>
                      <strong>
                        {bookedItem.rating?.toFixed(1) ?? '4.5'} ({bookedItem.reviews ?? 0})
                      </strong>
                    </p>
                    <p>
                      <span>Discount</span>
                      <strong>{bookedDiscountPercent > 0 ? `${bookedDiscountPercent}% OFF` : 'No active discount'}</strong>
                    </p>
                    <p>
                      <span>Checkout Price</span>
                      <strong>{formatCurrency(bookedItem.discounted_price ?? bookedItem.price)}</strong>
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="booked-item-empty">
                Open <strong>Inventory Vault</strong> and click <strong>Book This Item</strong> to place orders from the live catalog.
              </p>
            )}
          </div>

          <div className="desktop-actions">
            <button type="button" className="button button-primary" onClick={startRun}>
              <Play size={16} />
              Process Order
            </button>
            <button type="button" className="button button-ghost" onClick={stopRun} aria-label="Stop run">
              <Square size={16} />
            </button>
            <button type="button" className="button button-ghost" onClick={resetRun} aria-label="Reset run">
              <RotateCcw size={16} />
            </button>
          </div>
        </section>

        {view === 'tracking' ? (
          <section className={`tracking-layout ${handoff ? 'handoff-active' : ''}`}>
            <div className={`surface section-panel journey-panel ${isRunning ? 'is-running' : ''}`}>
              <div className="section-head">
                <div>
                  <p className="section-kicker">Step Progress Journey</p>
                  <h2>Live Order Pipeline</h2>
                </div>
                <div className="section-actions">
                  <span className={stateClass(currentState)}>{currentBadgeLabel}</span>
                  <button
                    type="button"
                    className="button inventory-vault-btn"
                    onClick={() => setInventoryOpen(true)}
                  >
                    Inventory Vault
                  </button>
                </div>
              </div>

              <div className="stage-list">
                {STAGES.map((stage, index) => {
                  const payload =
                    stage.agent === 'OrderAgent'
                      ? orderData
                      : stage.agent === 'InventoryAgent'
                      ? inventoryData
                      : stage.agent === 'PaymentAgent'
                      ? paymentData
                      : deliveryData;

                  const hasPayload = Object.keys(payload).length > 0;
                  const isActive = !TERMINAL_STATES.has(currentState) && index === activeStageIndex;
                  const isFailedStage = currentState === 'FAILED' && index === progressIndex;
                  const isComplete = currentState === 'DELIVERED' || index < progressIndex;
                  const isQueued = !isActive && !isComplete;
                  const connectorOn = index < progressIndex;
                  const isSource = handoff !== null && index === handoff.from;
                  const isTarget = handoff !== null && index === handoff.to;
                  const connectorHandoff =
                    handoff !== null && index >= handoffStart && index < handoffEnd;
                  const Icon = stage.icon;

                  return (
                    <article
                      key={stage.agent}
                      className={[
                        'stage-card',
                        `accent-${stage.accent}`,
                        isActive ? 'is-active' : '',
                        isComplete ? 'is-complete' : '',
                        isQueued && currentState !== 'IDLE' ? 'is-dim' : '',
                        isFailedStage ? 'is-failed' : '',
                        isSource ? 'is-source' : '',
                        isTarget ? 'is-target' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{ animationDelay: `${index * 90}ms` }}
                    >
                      <div className="stage-card-head">
                        <div className="stage-id-icon">
                          <span className="stage-id">{index + 1}</span>
                          <span className="stage-avatar">{stage.avatar}</span>
                          <span className="stage-icon-wrap">
                            <Icon size={16} />
                          </span>
                        </div>
                        <div>
                          <h3>{stage.title}</h3>
                          <p>{stage.role}</p>
                          <p className="stage-agent-code">{stage.agent}</p>
                        </div>
                        <span className="stage-chip">
                          {isActive
                            ? 'Active'
                            : isFailedStage
                            ? 'Failed'
                            : isComplete
                            ? 'Complete'
                            : 'Queued'}
                        </span>
                      </div>

                      <div className="stage-details">
                        {!hasPayload && <p className="placeholder">Awaiting stage payload...</p>}

                        {stage.agent === 'OrderAgent' && hasPayload && (
                          <div className="detail-grid">
                            <p>
                              <span>Order ID</span>
                              <strong>ORD-{logs[0]?.order_id || orderId}</strong>
                            </p>
                            <p>
                              <span>Customer</span>
                              <strong>{orderData.customer_name || orderData.customer || '-'}</strong>
                            </p>
                            <p>
                              <span>Product</span>
                              <strong>{orderData.item_name || orderData.item || '-'}</strong>
                            </p>
                            <p>
                              <span>Total</span>
                              <strong>{formatCurrency(orderData.total_amount || orderData.amount)}</strong>
                            </p>
                            <p>
                              <span>SKU</span>
                              <strong>{orderData.selected_sku || selectedInventorySku || '-'}</strong>
                            </p>
                            <p>
                              <span>Discount</span>
                              <strong>
                                {Number(orderData.discount_percent ?? bookedDiscountPercent) > 0
                                  ? `${Number(orderData.discount_percent ?? bookedDiscountPercent)}% OFF`
                                  : 'No active discount'}
                              </strong>
                            </p>
                            <p>
                              <span>Rating</span>
                              <strong>
                                {orderData.rating !== undefined || bookedItem
                                  ? `${Number(orderData.rating ?? bookedItem?.rating ?? 0).toFixed(1)} / 5`
                                  : '-'}
                              </strong>
                            </p>
                            <p style={{ gridColumn: '1 / -1' }}>
                              <span>Features</span>
                              <strong className="stage-feature-line">
                                {Array.isArray(orderData.features) && orderData.features.length > 0
                                  ? orderData.features.slice(0, 3).join(' • ')
                                  : bookedFeaturePreview.length > 0
                                  ? bookedFeaturePreview.join(' • ')
                                  : 'Feature data will appear after booking an item.'}
                              </strong>
                            </p>
                          </div>
                        )}

                        {stage.agent === 'InventoryAgent' && hasPayload && (
                          <div className="detail-grid">
                            <p>
                              <span>Status</span>
                              <strong className={stockTone(String(inventoryData.stock_status ?? ''))}>
                                {inventoryData.stock_status || '-'}
                              </strong>
                            </p>
                            <p>
                              <span>Confidence</span>
                              <strong>
                                {Math.round(
                                  Number(inventoryData.stock_confidence ?? inventoryData.confidence ?? 0) * 100,
                                )}
                                %
                              </strong>
                            </p>
                            <p>
                              <span>Tracked SKUs</span>
                              <strong>{inventoryContext.generated_items || inventoryCatalog.length}</strong>
                            </p>
                            <p>
                              <span>Dynamic Profile</span>
                              <strong>
                                {inventoryContext.day_name || '-'} / {inventoryContext.season || '-'}
                              </strong>
                            </p>
                            <p className="decision" style={{ gridColumn: '1 / -1' }}>
                              {(inventoryData.stock_status || '').toLowerCase() === 'low stock'
                                ? 'Decision: Out of stock, order cancellation branch engaged.'
                                : 'Decision: Stock verified, flow moved to payment.'}
                            </p>
                          </div>
                        )}

                        {stage.agent === 'PaymentAgent' && hasPayload && (
                          <div className="detail-grid">
                            <p>
                              <span>Transaction</span>
                              <strong
                                className={
                                  paymentData.payment_status === 'Authorized' ? 'tone-success' : 'tone-warning'
                                }
                              >
                                {paymentData.payment_status || '-'}
                              </strong>
                            </p>
                            <p>
                              <span>Fraud Risk</span>
                              <strong>{Math.round(Number(paymentData.fraud_risk ?? 0) * 100)}%</strong>
                            </p>
                            {(paymentData.attempt || 1) > 1 && (
                              <p className="decision tone-warning" style={{ gridColumn: '1 / -1' }}>
                                Retry flow active, attempt {paymentData.attempt} in progress.
                              </p>
                            )}
                          </div>
                        )}

                        {stage.agent === 'DeliveryAgent' && hasPayload && (
                          <div className="detail-grid">
                            <p>
                              <span>Courier</span>
                              <strong>
                                {deliveryData.shipping_partner && deliveryData.shipping_partner !== 'None'
                                  ? deliveryData.shipping_partner
                                  : deliveryData.partner || 'Unassigned'}
                              </strong>
                            </p>
                            <p>
                              <span>ETA</span>
                              <strong>{deliveryData.delivery_time_estimate || deliveryData.delivery_days || '-'} days</strong>
                            </p>
                            <p style={{ gridColumn: '1 / -1' }}>
                              <span>Status</span>
                              <strong
                                className={
                                  deliveryData.pass !== undefined
                                    ? deliveryData.pass
                                      ? 'tone-success'
                                      : 'tone-danger'
                                    : deliveryData.metrics?.pass_rate > 0
                                    ? 'tone-success'
                                    : 'tone-danger'
                                }
                              >
                                {(deliveryData.pass !== undefined
                                  ? Boolean(deliveryData.pass)
                                  : Number(deliveryData.metrics?.pass_rate ?? 0) > 0)
                                  ? 'Shipped successfully'
                                  : 'Delivery assignment failed'}
                              </strong>
                            </p>
                          </div>
                        )}
                      </div>

                      {index < STAGES.length - 1 && (
                        <span
                          className={[
                            'stage-connector',
                            connectorOn ? 'is-on' : '',
                            connectorHandoff ? 'is-handoff' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          aria-hidden="true"
                        />
                      )}
                    </article>
                  );
                })}
              </div>

              {currentState === 'DELIVERED' && (
                <div className="result-banner success">
                  <CheckCircle2 size={20} />
                  <span>Order pipeline completed successfully.</span>
                </div>
              )}

              {currentState === 'FAILED' && (
                <div className="result-banner danger">
                  <AlertTriangle size={20} />
                  <span>Pipeline halted due to delivery or validation constraints.</span>
                </div>
              )}
            </div>

            <aside className="tracking-side">
              <div className="surface section-panel">
                <div className="section-head compact">
                  <div>
                    <p className="section-kicker">Live Tracker</p>
                    <h3>State Machine Trace</h3>
                  </div>
                </div>
                <div className="trace-list">
                  {logs.map((log, idx) => {
                    const profile = getAgentProfile(log.agent);
                    return (
                      <div className="trace-item" key={`${log.id}-${log.timestamp}`} style={{ animationDelay: `${Math.min(idx, 8) * 30}ms` }}>
                        <span className={stateClass(log.state)}>{log.state.replace('_', ' ')}</span>
                        <p>
                          <span className="agent-inline-avatar">{profile.avatar}</span>
                          {profile.label} transitioned payload.
                        </p>
                      </div>
                    );
                  })}
                  {logs.length === 0 && <p className="placeholder">No transitions yet. Start a run to stream updates.</p>}
                </div>
              </div>

              <div className="surface section-panel">
                <div className="section-head compact">
                  <div>
                    <p className="section-kicker">Performance Snapshot</p>
                    <h3>Key Metrics</h3>
                  </div>
                </div>
                <div className="metrics-grid compact">
                  <div className="metric-box">
                    <p className="metric-value">{metrics.conf ? `${Math.round(metrics.conf * 100)}%` : '-'}</p>
                    <p className="metric-label">Inventory Accuracy</p>
                  </div>
                  <div className="metric-box">
                    <p className="metric-value">{`${Math.round(metrics.fraud * 100)}%`}</p>
                    <p className="metric-label">Payment Risk</p>
                  </div>
                  <div className="metric-box">
                    <p className="metric-value">{metrics.days ? `${metrics.days}d` : '-'}</p>
                    <p className="metric-label">Delivery Time</p>
                  </div>
                  <div className="metric-box">
                    <p className={`metric-value ${metrics.pass ? 'tone-success' : ''}`}>
                      {metrics.pass ? '100%' : currentState === 'FAILED' ? '0%' : '-'}
                    </p>
                    <p className="metric-label">Success Rate</p>
                  </div>
                </div>
              </div>
            </aside>
          </section>
        ) : view === 'system' ? (
          <section className={`system-layout ${isSystemEntering ? 'is-entering' : ''}`}>
            <div className={`system-left ${isSystemEntering ? 'is-entering' : ''}`}>
              <div className="surface section-panel">
                <div className="section-head compact">
                  <div>
                    <p className="section-kicker">State Timeline</p>
                    <h3>Transition Feed</h3>
                  </div>
                  <span className={stateClass(currentState)}>{currentBadgeLabel}</span>
                </div>

                <div className="trace-list">
                  {logs.map((log, idx) => {
                    const profile = getAgentProfile(log.agent);
                    return (
                      <div className="trace-item" key={`${log.id}-${log.agent}-${idx}`} style={{ animationDelay: `${Math.min(idx, 8) * 30}ms` }}>
                        <span className={stateClass(log.state)}>{log.state.replace('_', ' ')}</span>
                        <p>
                          <span className="agent-inline-avatar">{profile.avatar}</span>
                          {profile.label} transitioned payload.
                        </p>
                      </div>
                    );
                  })}
                  {logs.length === 0 && <p className="placeholder">No transitions yet. Start a run to stream updates.</p>}
                </div>
              </div>

              <div className="surface section-panel">
                <div className="section-head compact">
                  <div>
                    <p className="section-kicker">Quantitative Metrics</p>
                    <h3>Run Analytics</h3>
                  </div>
                  <Activity size={18} className="icon-muted" />
                </div>

                <div className="metrics-grid">
                  <div className="metric-box">
                    <p className="metric-value">{metrics.conf ? `${Math.round(metrics.conf * 100)}%` : '-'}</p>
                    <p className="metric-label">Inventory Accuracy (%)</p>
                  </div>
                  <div className="metric-box">
                    <p className="metric-value">{`${Math.round(metrics.fraud * 100)}%`}</p>
                    <p className="metric-label">Payment Failure Rate (%)</p>
                  </div>
                  <div className="metric-box">
                    <p className="metric-value">{metrics.days ? `${metrics.days} days` : '-'}</p>
                    <p className="metric-label">Delivery Time</p>
                  </div>
                  <div className="metric-box">
                    <p className={`metric-value ${metrics.pass ? 'tone-success' : ''}`}>
                      {metrics.pass ? '100%' : currentState === 'FAILED' ? '0%' : '-'}
                    </p>
                    <p className="metric-label">Order Success Rate (%)</p>
                  </div>
                </div>

                <div className="health-list">
                  <h4>Run Health Signals</h4>
                  {runHealth.map((item, index) => (
                    <p key={index} className={`health-item tone-${item.tone}`}>
                      {item.label}
                    </p>
                  ))}
                </div>
              </div>
            </div>

            <div className={`surface section-panel protocol-panel ${isSystemEntering ? 'is-entering' : ''}`}>
              <div className="section-head compact">
                <div>
                  <p className="section-kicker">Protocol Stream</p>
                  <h3>JSON Message Logs</h3>
                </div>
                <Server size={18} className="icon-muted" />
              </div>

              <div className={`log-panel ${isRunning ? 'is-running' : ''}`} ref={logContainerRef}>
                {protocolLogs.map((log, index) => {
                  const profile = getAgentProfile(log.agent);
                  const protocolPayload = compactPayloadForProtocol(log.payload);
                  return (
                    <article
                      key={`${log.id}-${log.timestamp}-${index}`}
                      className="log-message"
                      style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
                    >
                      <div className="log-meta">
                        <span className="log-agent-name">
                          <span className="agent-inline-avatar">{profile.avatar}</span>
                          {profile.label}
                        </span>
                        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <pre className="log-json">{`{\n  "run_id": "${log.run_id}",\n  "agent": "${log.agent}",\n  "state": "${log.state}",\n  "order_id": "${log.order_id}",\n  "payload": ${JSON.stringify(protocolPayload, null, 2)}\n}`}</pre>
                    </article>
                  );
                })}

                {isRunning && <p className="placeholder">Awaiting next transition...</p>}
                {logs.length === 0 && <p className="placeholder">No protocol messages yet.</p>}
              </div>
            </div>
          </section>
        ) : view === 'eval' ? (
          <Suspense
            fallback={
              <section className="surface section-panel" style={{ padding: '2rem' }}>
                <p className="placeholder">Loading benchmark view...</p>
              </section>
            }
          >
            <EvalPanel />
          </Suspense>
        ) : null}
      </main>

      <Suspense fallback={null}>
        <InventorySheet
          open={inventoryOpen}
          onClose={() => setInventoryOpen(false)}
          managerLabel={getAgentProfile('InventoryAgent').label}
          context={inventoryContext}
          categories={inventoryCategories}
          activeCategory={inventoryCategory}
          onChangeCategory={setInventoryCategory}
          items={filteredInventoryCatalog}
          selectedSku={selectedInventorySku}
          formatCurrency={formatCurrency}
          stockTone={stockTone}
          onSelectItem={handleSelectInventoryItem}
          onBookItem={handleBookItem}
        />
      </Suspense>

      <div className={`sticky-cta ${isRunning ? 'is-running' : ''}`} role="group" aria-label="Run controls">
        <button type="button" className="button button-primary" onClick={startRun}>
          <Play size={16} />
          Process Order
        </button>
        <button type="button" className="button button-ghost" onClick={stopRun} aria-label="Stop run">
          <Square size={16} />
        </button>
        <button type="button" className="button button-ghost" onClick={resetRun} aria-label="Reset run">
          <RotateCcw size={16} />
        </button>
      </div>
    </div>
  );
}

export default App;
