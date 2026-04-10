import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface InventoryContext {
  season: string;
  day_name: string;
  day_type: string;
  generated_items: number;
}

interface InventoryItem {
  sku: string;
  name: string;
  category: string;
  image: string;
  price: number;
  discount_percent?: number;
  discounted_price?: number;
  delivery_charge?: number;
  estimated_delivery_days?: number;
  stock_units?: number;
  stock_status?: string;
  rating?: number;
  reviews?: number;
  features?: string[];
}

interface InventorySheetProps {
  open: boolean;
  onClose: () => void;
  managerLabel: string;
  context: InventoryContext;
  categories: [string, number][];
  activeCategory: string;
  onChangeCategory: (category: string) => void;
  items: InventoryItem[];
  selectedSku: string;
  formatCurrency: (value: unknown) => string;
  stockTone: (status: string) => string;
  onBookItem: (item: InventoryItem) => void;
}

const GRID_GAP = 14;
const CARD_BODY_ESTIMATE = 220;
const OVERSCAN_ROWS = 4;

function InventorySheet({
  open,
  onClose,
  managerLabel,
  context,
  categories,
  activeCategory,
  onChangeCategory,
  items,
  selectedSku,
  formatCurrency,
  stockTone,
  onBookItem,
}: InventorySheetProps) {
  const virtualGridRef = useRef<HTMLDivElement | null>(null);
  const bookingTimerRef = useRef<number | null>(null);
  const bookingFxTimerRef = useRef<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(980);
  const [viewportHeight, setViewportHeight] = useState(540);
  const [scrollTop, setScrollTop] = useState(0);
  const [bookingFxSku, setBookingFxSku] = useState('');
  const [pendingBookSku, setPendingBookSku] = useState('');

  useEffect(() => {
    if (!open || !virtualGridRef.current) {
      return;
    }
    virtualGridRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [open, activeCategory]);

  useEffect(() => {
    if (!virtualGridRef.current) {
      return;
    }
    const container = virtualGridRef.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setViewportWidth(Math.max(280, Math.floor(entry.contentRect.width)));
        setViewportHeight(Math.max(220, Math.floor(entry.contentRect.height)));
      }
    });
    observer.observe(container);
    setViewportWidth(Math.max(280, container.clientWidth));
    setViewportHeight(Math.max(220, container.clientHeight));
    return () => observer.disconnect();
  }, [open]);

  useEffect(
    () => () => {
      if (bookingTimerRef.current !== null) {
        window.clearTimeout(bookingTimerRef.current);
      }
      if (bookingFxTimerRef.current !== null) {
        window.clearTimeout(bookingFxTimerRef.current);
      }
    },
    [],
  );

  const columnCount = viewportWidth >= 980 ? 3 : viewportWidth >= 720 ? 2 : 1;
  const columnWidth = Math.max(
    220,
    Math.floor((viewportWidth - GRID_GAP * (columnCount - 1)) / columnCount),
  );
  const cardHeight = Math.max(
    286,
    Math.round(columnWidth * (9 / 16) + CARD_BODY_ESTIMATE),
  );
  const rowHeight = cardHeight + GRID_GAP;
  const totalRows = Math.max(1, Math.ceil(items.length / columnCount));
  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS);
  const visibleRows = Math.ceil(viewportHeight / rowHeight) + OVERSCAN_ROWS * 2;
  const endRow = Math.min(totalRows, startRow + visibleRows);
  const startIndex = startRow * columnCount;
  const endIndex = Math.min(items.length, endRow * columnCount);

  const virtualItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [items, startIndex, endIndex],
  );

  return (
    <div className={`inventory-overlay ${open ? 'is-open' : ''}`} onClick={onClose} aria-hidden={!open}>
      <section
        className={`inventory-sheet ${open ? 'is-open' : ''}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Inventory Catalog"
      >
        <span className="inventory-handle" aria-hidden="true" />
        <div className="inventory-sheet-head">
          <div>
            <p className="inventory-kicker">Managed By {managerLabel}</p>
            <h3>Live Inventory Catalog</h3>
          </div>
          <button type="button" className="button button-ghost inventory-close-btn" onClick={onClose} aria-label="Close inventory">
            <X size={16} />
          </button>
        </div>

        <p className="inventory-sheet-subtitle">
          Browse categorized inventory with dynamic discounts and delivery charges that adapt to current day and season.
        </p>

        <div className="inventory-toolbar">
          <div className="inventory-context-strip">
            <span className="inventory-context-pill">{context.generated_items} Items</span>
            <span className="inventory-context-pill">{context.season || 'Season'} Season</span>
            <span className="inventory-context-pill">{context.day_name || 'Day'} Pricing</span>
            <span className="inventory-context-pill">{context.day_type || 'Cycle'} Logistics</span>
          </div>
          <div className="inventory-category-tabs">
            {categories.map(([categoryName, count]) => (
              <button
                key={categoryName}
                type="button"
                className={`inventory-category-tab ${activeCategory === categoryName ? 'is-active' : ''}`}
                onClick={() => onChangeCategory(categoryName)}
              >
                {categoryName} <span>{count}</span>
              </button>
            ))}
          </div>
        </div>

        <div
          className="inventory-grid inventory-grid-virtual"
          ref={virtualGridRef}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <div
            className="inventory-virtual-spacer"
            style={{ height: `${Math.max(totalRows * rowHeight - GRID_GAP, 1)}px` }}
          >
            {virtualItems.map((item, localIndex) => {
              const absoluteIndex = startIndex + localIndex;
              const row = Math.floor(absoluteIndex / columnCount);
              const col = absoluteIndex % columnCount;
              const isSelected = selectedSku !== '' && item.sku === selectedSku;
              const units = Number(item.stock_units ?? 0);
              const stockStatus = String(item.stock_status ?? 'Unknown');
              const stockPercent = Math.max(8, Math.min(100, Math.round((units / 30) * 100)));
              const basePrice = Number(item.price ?? 0);
              const discountPrice = Number(item.discounted_price ?? basePrice);
              const discountPercent = Number(item.discount_percent ?? 0);
              const deliveryCharge = Number(item.delivery_charge ?? 0);
              const deliveryDays = Number(item.estimated_delivery_days ?? 0);
              const isBookingNow = bookingFxSku === item.sku;
              const isPending = pendingBookSku === item.sku;

              return (
                <article
                  key={item.sku}
                  className={`inventory-card inventory-card-virtual ${isSelected ? 'is-selected' : ''} ${isBookingNow ? 'is-booking' : ''}`}
                  style={{
                    top: `${row * rowHeight}px`,
                    left: `${col * (columnWidth + GRID_GAP)}px`,
                    width: `${columnWidth}px`,
                    height: `${cardHeight}px`,
                    animationDelay: `${(absoluteIndex % 10) * 35}ms`,
                  }}
                  onDoubleClick={() => {
                    onBookItem(item);
                    setPendingBookSku('');
                    setBookingFxSku(item.sku);
                  }}
                >
                  <div className="inventory-image-wrap">
                    <img src={item.image} alt={item.name} loading="lazy" />
                    {isSelected && <span className="inventory-current-chip">Current Order</span>}
                    <span className="inventory-discount-chip">{discountPercent}% OFF</span>
                  </div>

                  <div className="inventory-card-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <p className="inventory-category">{item.category}</p>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.2rem',
                          color: '#ffb074',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                        }}
                      >
                        ★ {item.rating?.toFixed(1) || '4.5'}{' '}
                        <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>({item.reviews || 0})</span>
                      </div>
                    </div>
                    <h4>{item.name}</h4>
                    <div
                      style={{
                        marginTop: '0.2rem',
                        marginBottom: '0.6rem',
                        display: 'flex',
                        gap: '0.35rem',
                        flexWrap: 'wrap',
                        maxHeight: '2.2rem',
                        overflow: 'hidden',
                      }}
                    >
                      {(item.features || []).map((feature) => (
                        <span
                          key={`${item.sku}-${feature}`}
                          style={{
                            fontSize: '0.65rem',
                            padding: '0.1rem 0.35rem',
                            background: 'rgba(255,255,255,0.06)',
                            borderRadius: '4px',
                            color: 'var(--text-soft)',
                          }}
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
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
                    <button
                      type="button"
                      className={`inventory-book-btn ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => {
                        setPendingBookSku(item.sku);
                        setBookingFxSku(item.sku);
                        if (bookingTimerRef.current !== null) {
                          window.clearTimeout(bookingTimerRef.current);
                        }
                        if (bookingFxTimerRef.current !== null) {
                          window.clearTimeout(bookingFxTimerRef.current);
                        }
                        bookingTimerRef.current = window.setTimeout(() => {
                          onBookItem(item);
                          setPendingBookSku('');
                        }, 240);
                        bookingFxTimerRef.current = window.setTimeout(() => {
                          setBookingFxSku('');
                        }, 880);
                      }}
                    >
                      {isPending ? 'Booking...' : isSelected ? 'Booked Item' : 'Book This Item'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="inventory-more-row">
          <p className="inventory-more-meta">
            Showing {items.length} catalog items | Rendering {virtualItems.length} cards in viewport
          </p>
        </div>
      </section>
    </div>
  );
}

export default InventorySheet;
