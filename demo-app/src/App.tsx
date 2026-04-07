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
  stock_units?: number;
  stock_status?: string;
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

const FALLBACK_INVENTORY_CATALOG: InventoryCatalogItem[] = [
  {
    sku: 'NVK-1001',
    name: 'MacBook Pro M3',
    category: 'Laptops',
    image: 'https://picsum.photos/seed/novakart-macbook/720/480',
    price: 1999.99,
  },
  {
    sku: 'NVK-1002',
    name: 'Samsung S24 Ultra',
    category: 'Mobiles',
    image: 'https://picsum.photos/seed/novakart-s24/720/480',
    price: 1199.99,
  },
  {
    sku: 'NVK-1003',
    name: 'Nike Air Max',
    category: 'Footwear',
    image: 'https://picsum.photos/seed/novakart-nike/720/480',
    price: 129.99,
  },
  {
    sku: 'NVK-1004',
    name: 'Sony WH-1000XM5',
    category: 'Audio',
    image: 'https://picsum.photos/seed/novakart-sony/720/480',
    price: 348,
  },
  {
    sku: 'NVK-1005',
    name: 'Nintendo Switch',
    category: 'Gaming',
    image: 'https://picsum.photos/seed/novakart-switch/720/480',
    price: 299,
  },
  {
    sku: 'NVK-1006',
    name: 'Dyson V15 Detect',
    category: 'Home',
    image: 'https://picsum.photos/seed/novakart-dyson/720/480',
    price: 699.99,
  },
  {
    sku: 'NVK-1007',
    name: 'Amazon Echo Dot',
    category: 'Smart Home',
    image: 'https://picsum.photos/seed/novakart-echo/720/480',
    price: 49.99,
  },
  {
    sku: 'NVK-1008',
    name: 'Apple Watch Series 9',
    category: 'Wearables',
    image: 'https://picsum.photos/seed/novakart-watch/720/480',
    price: 399,
  },
  {
    sku: 'NVK-1009',
    name: 'LG C3 OLED TV',
    category: 'TVs',
    image: 'https://picsum.photos/seed/novakart-lg-tv/720/480',
    price: 1499.99,
  },
  {
    sku: 'NVK-1010',
    name: 'Kindle Paperwhite',
    category: 'E-Readers',
    image: 'https://picsum.photos/seed/novakart-kindle/720/480',
    price: 139.99,
  },
];

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
    const fallbackSelectedSku =
      FALLBACK_INVENTORY_CATALOG[Math.max(0, Number(orderId || '1') - 1)]?.sku ?? 'NVK-1001';

    const mockFlow: Array<{ agent: string; state: AgentState; payload: Record<string, any> }> = [
      { agent: 'System', state: 'IDLE', payload: { status: 'initialized', seed } },
      {
        agent: 'OrderAgent',
        state: 'ORDER_PLACED',
        payload: { customer: 'John Doe', item: 'MacBook Pro', amount: 1999.99 },
      },
      {
        agent: 'InventoryAgent',
        state: 'VERIFIED',
        payload: {
          stock_status: 'In Stock',
          confidence: 0.85,
          selected_sku: fallbackSelectedSku,
          inventory_catalog: FALLBACK_INVENTORY_CATALOG.map((item, index) => ({
            ...item,
            stock_units: 6 + ((index * 3) % 14),
            stock_status: index % 3 === 0 ? 'Low Stock' : 'In Stock',
          })),
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
      return FALLBACK_INVENTORY_CATALOG;
    }

    return rawCatalog.map((item: any, index: number) => ({
      sku: String(item.sku ?? `NVK-X${index}`),
      name: String(item.name ?? 'Unknown Item'),
      category: String(item.category ?? 'General'),
      image: String(item.image ?? `https://picsum.photos/seed/novakart-${index}/720/480`),
      price: Number(item.price ?? 0),
      stock_units: Number(item.stock_units ?? 0),
      stock_status: String(item.stock_status ?? 'Unknown'),
    }));
  }, [inventoryData]);

  const selectedInventorySku = useMemo(() => {
    if (typeof inventoryData.selected_sku === 'string' && inventoryData.selected_sku.trim().length > 0) {
      return inventoryData.selected_sku;
    }
    const orderedItemName = String(orderData.item_name ?? orderData.item ?? '').toLowerCase();
    const matched = inventoryCatalog.find((item) => item.name.toLowerCase() === orderedItemName);
    return matched?.sku ?? '';
  }, [inventoryCatalog, inventoryData, orderData]);

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
      return;
    }

    if (activeAgent === 'InventoryAgent' && currentState === 'VERIFIED') {
      setInventoryOpen(true);
    }
  }, [activeAgent, currentState, view]);

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
                <option value="1">1 - MacBook Pro M3</option>
                <option value="2">2 - Samsung S24 Ultra</option>
                <option value="3">3 - Nike Air Max</option>
                <option value="4">4 - Sony WH-1000XM5</option>
                <option value="5">5 - Nintendo Switch</option>
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
                <span className={stateClass(currentState)}>{currentBadgeLabel}</span>
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
                              <strong>{inventoryCatalog.length}</strong>
                            </p>
                            <p>
                              <span>Agent Action</span>
                              <button
                                type="button"
                                className="button button-ghost inventory-open-btn"
                                onClick={() => setInventoryOpen(true)}
                              >
                                Open Live Inventory
                              </button>
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
            Real-time stock signals, catalog images, and SKU health controlled by the inventory stage.
          </p>

          <div className="inventory-grid">
            {inventoryCatalog.map((item, index) => {
              const isSelected = selectedInventorySku !== '' && item.sku === selectedInventorySku;
              const units = Number(item.stock_units ?? 0);
              const stockStatus = String(item.stock_status ?? 'Unknown');
              const stockPercent = Math.max(8, Math.min(100, Math.round((units / 30) * 100)));

              return (
                <article
                  key={item.sku}
                  className={`inventory-card ${isSelected ? 'is-selected' : ''}`}
                  style={{ animationDelay: `${index * 65}ms` }}
                >
                  <div className="inventory-image-wrap">
                    <img src={item.image} alt={item.name} loading="lazy" />
                    {isSelected && <span className="inventory-current-chip">Current Order</span>}
                  </div>

                  <div className="inventory-card-body">
                    <p className="inventory-category">{item.category}</p>
                    <h4>{item.name}</h4>
                    <div className="inventory-meta-row">
                      <strong>{formatCurrency(item.price)}</strong>
                      <span className={`inventory-stock-badge ${stockTone(stockStatus)}`}>{stockStatus}</span>
                    </div>
                    <div className="inventory-stock-bar">
                      <span style={{ width: `${stockPercent}%` }} />
                    </div>
                    <p className="inventory-units">{units} units available</p>
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
