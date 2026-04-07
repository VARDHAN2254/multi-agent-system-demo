import { useEffect, useMemo, useRef, useState } from 'react';
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
  Square,
  Truck,
  X,
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

type ViewMode = 'tracking' | 'system';

type StageAccent = 'order' | 'inventory' | 'payment' | 'delivery';

interface StageConfig {
  id: AgentState;
  agent: string;
  icon: LucideIcon;
  title: string;
  role: string;
  accent: StageAccent;
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

const STAGES: StageConfig[] = [
  {
    id: 'ORDER_PLACED',
    agent: 'OrderAgent',
    icon: Network,
    title: 'Order Agent',
    role: 'Captures customer order and generates the order reference.',
    accent: 'order',
  },
  {
    id: 'VERIFIED',
    agent: 'InventoryAgent',
    icon: Package,
    title: 'Inventory Agent',
    role: 'Checks stock confidence and validates fulfillment readiness.',
    accent: 'inventory',
  },
  {
    id: 'PACKED',
    agent: 'PaymentAgent',
    icon: CreditCard,
    title: 'Payment Agent',
    role: 'Authorizes payment and handles fraud risk retries.',
    accent: 'payment',
  },
  {
    id: 'SHIPPED',
    agent: 'DeliveryAgent',
    icon: Truck,
    title: 'Delivery Agent',
    role: 'Assigns courier partner and confirms shipping progression.',
    accent: 'delivery',
  },
];

const TERMINAL_STATES = new Set<AgentState>(['DELIVERED', 'FAILED']);

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
];

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

      catalog.push({
        sku: `NVK-${blueprint.slug}-${String(itemIndex + 1).padStart(4, '0')}`,
        name,
        category: blueprint.category,
        image: `https://picsum.photos/seed/novakart-${blueprint.slug.toLowerCase()}-${itemIndex + 1}/720/480`,
        price,
        discount_percent: discountPercent,
        discounted_price: discountedPrice,
        delivery_charge: deliveryCharge,
        estimated_delivery_days: estimatedDeliveryDays,
        stock_units: stockUnits,
        stock_status: stockStatus,
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
      category_breakdown: {
        Laptops: 220,
        Mobiles: 220,
        Footwear: 220,
      },
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
  return {};
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
  const [inventoryCategory, setInventoryCategory] = useState<string>('Laptops');
  const [handoff, setHandoff] = useState<HandoffTransition | null>(null);
  const [isSystemEntering, setIsSystemEntering] = useState(false);

  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const previousActiveStageRef = useRef(-1);
  const previousViewRef = useRef<ViewMode>('tracking');

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
    setInventoryOpen(false);
    setHandoff(null);
  };

  const triggerSimulatedRun = () => {
    let step = 0;
    setLogs([]);
    setCurrentState('IDLE');
    const mockOrderLabels: Record<string, string> = {
      '1': 'AstraBook Pro 100',
      '2': 'Vertex One 100',
      '3': 'Stride Runner 100',
      '4': 'NovaBook Air 101',
      '5': 'Nova Pro 101',
      '6': 'Aero Street 101',
      '7': 'ZenBook Max 102',
      '8': 'Astra Max 102',
      '9': 'Flex Sport 102',
      '10': 'TitanBook Ultra 103',
    };
    const mockItemName = mockOrderLabels[orderId] ?? 'AstraBook Pro 100';
    const fallbackPack = generateFallbackInventory(seed, new Date());
    const fallbackCatalog = fallbackPack.catalog;
    const fallbackContext = fallbackPack.context;
    const fallbackSelectedSku = fallbackCatalog[Math.max(0, Number(orderId || '1') - 1)]?.sku ?? 'NVK-LAP-0001';

    const mockFlow: Array<{ agent: string; state: AgentState; payload: Record<string, any> }> = [
      { agent: 'System', state: 'IDLE', payload: { status: 'initialized', seed } },
      {
        agent: 'OrderAgent',
        state: 'ORDER_PLACED',
        payload: { customer: 'John Doe', item: mockItemName, amount: 1999.99 },
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
          order_id: orderId,
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
      const res = await fetch(`${API_BASE}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, seed }),
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
        const res = await fetch(`${API_BASE}/logs/${activeRunId}`);
        const data = await res.json();

        if (!data.history || data.history.length === 0) {
          return;
        }

        const parsedLogs: LogMessage[] = data.history.map((log: any, idx: number) => {
          let payload: unknown = log.payload;
          if (typeof payload === 'string') {
            try {
              payload = JSON.parse(payload);
            } catch {
              payload = log.payload;
            }
          }

          return {
            id: idx,
            run_id: log.run_id,
            agent: log.agent,
            state: log.state,
            order_id: log.order_id,
            payload,
            timestamp: log.timestamp,
          };
        });

        setLogs(parsedLogs);
        const lastLog = parsedLogs[parsedLogs.length - 1];
        setCurrentState(lastLog.state);
        setActiveAgent(lastLog.agent);

        if (TERMINAL_STATES.has(lastLog.state)) {
          clearInterval(interval);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeRunId]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, view]);

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

  const inventoryCatalog = useMemo<InventoryCatalogItem[]>(() => {
    const rawCatalog = inventoryData.inventory_catalog;
    if (!Array.isArray(rawCatalog) || rawCatalog.length === 0) {
      return generateFallbackInventory(seed, new Date()).catalog;
    }

    return rawCatalog.map((item: any, index: number) => ({
      sku: String(item.sku ?? `NVK-X${index}`),
      name: String(item.name ?? 'Unknown Item'),
      category: String(item.category ?? 'General'),
      image: String(item.image ?? `https://picsum.photos/seed/novakart-${index}/720/480`),
      price: Number(item.price ?? 0),
      discount_percent: Number(item.discount_percent ?? 0),
      discounted_price: Number(item.discounted_price ?? item.price ?? 0),
      delivery_charge: Number(item.delivery_charge ?? 0),
      estimated_delivery_days: Number(item.estimated_delivery_days ?? 0),
      season: String(item.season ?? ''),
      day_name: String(item.day_name ?? ''),
      stock_units: Number(item.stock_units ?? 0),
      stock_status: String(item.stock_status ?? 'Unknown'),
    }));
  }, [inventoryData, seed]);

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

    const inferredSeason = inventoryCatalog[0]?.season ?? seasonFromMonth(new Date().getMonth());
    const inferredDay = inventoryCatalog[0]?.day_name ?? new Date().toLocaleDateString('en-US', { weekday: 'long' });
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
  }, [inventoryCatalog, inventoryData]);

  const selectedInventorySku = useMemo(() => {
    if (typeof inventoryData.selected_sku === 'string' && inventoryData.selected_sku.trim().length > 0) {
      return inventoryData.selected_sku;
    }
    const orderedItemName = String(orderData.item_name ?? orderData.item ?? '').toLowerCase();
    const matched = inventoryCatalog.find((item) => item.name.toLowerCase() === orderedItemName);
    return matched?.sku ?? '';
  }, [inventoryCatalog, inventoryData, orderData]);

  const inventoryCategories = useMemo(() => {
    return Object.entries(
      inventoryCatalog.reduce<Record<string, number>>((acc, item) => {
        acc[item.category] = (acc[item.category] ?? 0) + 1;
        return acc;
      }, {}),
    ).sort((a, b) => a[0].localeCompare(b[0]));
  }, [inventoryCatalog]);

  const filteredInventoryCatalog = useMemo(() => {
    if (inventoryCategory === 'All') {
      return inventoryCatalog;
    }
    return inventoryCatalog.filter((item) => item.category === inventoryCategory);
  }, [inventoryCatalog, inventoryCategory]);

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

  const currentBadgeLabel = currentState.replace('_', ' ');

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

  return (
    <div className={`app-shell ${inventoryOpen ? 'inventory-focus' : ''}`}>
      <div className="ambient ambient-top" aria-hidden="true" />
      <div className="ambient ambient-bottom" aria-hidden="true" />

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
              <span className="active-agent-tag">{activeAgent}</span>
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
          </div>
        </header>

        <section className="surface controls-panel">
          <div className="controls-grid">
            <label className="field">
              <span className="field-label">Dataset Order Selection</span>
              <select
                className="input-field"
                value={orderId}
                onChange={(event) => setOrderId(event.target.value)}
              >
                <option value="1">1 - AstraBook Pro 100</option>
                <option value="2">2 - Vertex One 100</option>
                <option value="3">3 - Stride Runner 100</option>
                <option value="4">4 - NovaBook Air 101</option>
                <option value="5">5 - Nova Pro 101</option>
                <option value="6">6 - Aero Street 101</option>
                <option value="7">7 - ZenBook Max 102</option>
                <option value="8">8 - Astra Max 102</option>
                <option value="9">9 - Flex Sport 102</option>
                <option value="10">10 - TitanBook Ultra 103</option>
              </select>
            </label>

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
                          <span className="stage-icon-wrap">
                            <Icon size={16} />
                          </span>
                        </div>
                        <div>
                          <h3>{stage.title}</h3>
                          <p>{stage.role}</p>
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
                  {logs.map((log, idx) => (
                    <div className="trace-item" key={`${log.id}-${log.timestamp}`} style={{ animationDelay: `${idx * 70}ms` }}>
                      <span className={stateClass(log.state)}>{log.state.replace('_', ' ')}</span>
                      <p>{log.agent} transitioned payload.</p>
                    </div>
                  ))}
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
        ) : (
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
                  {logs.map((log, idx) => (
                    <div className="trace-item" key={`${log.id}-${log.agent}-${idx}`} style={{ animationDelay: `${idx * 70}ms` }}>
                      <span className={stateClass(log.state)}>{log.state.replace('_', ' ')}</span>
                      <p>{log.agent} transitioned payload.</p>
                    </div>
                  ))}
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
                {logs.map((log, index) => (
                  <article
                    key={`${log.id}-${log.timestamp}-${index}`}
                    className="log-message"
                    style={{ animationDelay: `${index * 80}ms` }}
                  >
                    <div className="log-meta">
                      <span>{log.agent}</span>
                      <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <pre className="log-json">{`{\n  "run_id": "${log.run_id}",\n  "agent": "${log.agent}",\n  "state": "${log.state}",\n  "order_id": "${log.order_id}",\n  "payload": ${JSON.stringify(log.payload, null, 2)}\n}`}</pre>
                  </article>
                ))}

                {isRunning && <p className="placeholder">Awaiting next transition...</p>}
                {logs.length === 0 && <p className="placeholder">No protocol messages yet.</p>}
              </div>
            </div>
          </section>
        )}
      </main>

      <div
        className={`inventory-overlay ${inventoryOpen ? 'is-open' : ''}`}
        onClick={() => setInventoryOpen(false)}
        aria-hidden={!inventoryOpen}
      >
        <section
          className={`inventory-sheet ${inventoryOpen ? 'is-open' : ''}`}
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Inventory Catalog"
        >
          <span className="inventory-handle" aria-hidden="true" />
          <div className="inventory-sheet-head">
            <div>
              <p className="inventory-kicker">Managed By Inventory Agent</p>
              <h3>Live Inventory Catalog</h3>
            </div>
            <button
              type="button"
              className="button button-ghost inventory-close-btn"
              onClick={() => setInventoryOpen(false)}
              aria-label="Close inventory"
            >
              <X size={16} />
            </button>
          </div>

          <p className="inventory-sheet-subtitle">
            Browse categorized inventory with dynamic discounts and delivery charges that adapt to current day and season.
          </p>

          <div className="inventory-toolbar">
            <div className="inventory-context-strip">
              <span className="inventory-context-pill">{inventoryContext.generated_items} Items</span>
              <span className="inventory-context-pill">{inventoryContext.season || 'Season'} Season</span>
              <span className="inventory-context-pill">{inventoryContext.day_name || 'Day'} Pricing</span>
              <span className="inventory-context-pill">{inventoryContext.day_type || 'Cycle'} Logistics</span>
            </div>
            <div className="inventory-category-tabs">
              {inventoryCategories.map(([categoryName, count]) => (
                <button
                  key={categoryName}
                  type="button"
                  className={`inventory-category-tab ${inventoryCategory === categoryName ? 'is-active' : ''}`}
                  onClick={() => setInventoryCategory(categoryName)}
                >
                  {categoryName} <span>{count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="inventory-grid">
            {filteredInventoryCatalog.map((item, index) => {
              const isSelected = selectedInventorySku !== '' && item.sku === selectedInventorySku;
              const units = Number(item.stock_units ?? 0);
              const stockStatus = String(item.stock_status ?? 'Unknown');
              const stockPercent = Math.max(8, Math.min(100, Math.round((units / 30) * 100)));
              const basePrice = Number(item.price ?? 0);
              const discountPrice = Number(item.discounted_price ?? basePrice);
              const discountPercent = Number(item.discount_percent ?? 0);
              const deliveryCharge = Number(item.delivery_charge ?? 0);
              const deliveryDays = Number(item.estimated_delivery_days ?? 0);

              return (
                <article
                  key={item.sku}
                  className={`inventory-card ${isSelected ? 'is-selected' : ''}`}
                  style={{ animationDelay: `${(index % 12) * 45}ms` }}
                >
                  <div className="inventory-image-wrap">
                    <img src={item.image} alt={item.name} loading="lazy" />
                    {isSelected && <span className="inventory-current-chip">Current Order</span>}
                    <span className="inventory-discount-chip">{discountPercent}% OFF</span>
                  </div>

                  <div className="inventory-card-body">
                    <p className="inventory-category">{item.category}</p>
                    <h4>{item.name}</h4>
                    <div className="inventory-meta-row">
                      <div className="inventory-price-stack">
                        <strong>{formatCurrency(discountPrice)}</strong>
                        <span className="inventory-mrp">MRP {formatCurrency(basePrice)}</span>
                      </div>
                      <span className={`inventory-stock-badge ${stockTone(stockStatus)}`}>{stockStatus}</span>
                    </div>
                    <div className="inventory-stock-bar">
                      <span style={{ width: `${stockPercent}%` }} />
                    </div>
                    <p className="inventory-units">{units} units available</p>
                    <p className="inventory-delivery-line">
                      Delivery: {formatCurrency(deliveryCharge)} | ETA: {deliveryDays} day{deliveryDays === 1 ? '' : 's'}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

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
