import React, { useState, useEffect, useRef } from 'react';
import { Network, Server, Play, Square, RotateCcw, Activity } from 'lucide-react';

type AgentState = "IDLE" | "ORDER_PLACED" | "VERIFIED" | "PACKED" | "SHIPPED" | "DELIVERED" | "FAILED";

interface LogMessage {
  id: number;
  run_id: string;
  agent: string;
  state: AgentState;
  order_id: string;
  payload: string; // JSON parsed
  timestamp: string;
}

const API_BASE = "http://localhost:8000/api";

function App() {
  const [seed, setSeed] = useState(42);
  const [orderId, setOrderId] = useState("1");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [currentState, setCurrentState] = useState<AgentState>("IDLE");
  const [activeAgent, setActiveAgent] = useState<string>("System");
  
  const pollInterval = useRef<any>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const startRun = async () => {
    resetRun();
    try {
      const res = await fetch(`${API_BASE}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, seed })
      });
      const data = await res.json();
      setActiveRunId(data.run_id); 
    } catch (e) {
      console.error(e);
      triggerSimulatedRun();
    }
  };

  const stopRun = () => {
    if (pollInterval.current) clearInterval(pollInterval.current);
    setActiveRunId(null);
  };

  const resetRun = () => {
    stopRun();
    setLogs([]);
    setCurrentState("IDLE");
    setActiveAgent("System");
    setActiveRunId(null);
  };

  const triggerSimulatedRun = () => {
     let step = 0;
     setLogs([]);
     setCurrentState("IDLE");
     
     const mockFlow = [
       { agent: "System", state: "IDLE", payload: `{"status":"initialized", "seed":${seed}}` },
       { agent: "OrderAgent", state: "ORDER_PLACED", payload: `{"customer": "John Doe", "item": "MacBook Pro", "amount": 1999.99}` },
       { agent: "InventoryAgent", state: "VERIFIED", payload: `{"stock_status": "In Stock", "confidence": 0.85}` },
       { agent: "PaymentAgent", state: "PACKED", payload: `{"payment_status": "Authorized", "fraud_risk": 0.12}` },
       { agent: "DeliveryAgent", state: "SHIPPED", payload: `{"pass": true, "stock_confidence": 0.85, "fraud_risk": 0.12, "delivery_days": 3, "partner": "FedEx"}` },
       { agent: "System", state: "DELIVERED", payload: `{"execution_time_ms": 3200}` }
     ];
     
     pollInterval.current = setInterval(() => {
       if (step >= mockFlow.length) {
         clearInterval(pollInterval.current);
         return;
       }
       const currentItem = mockFlow[step] as any;
       setLogs(prev => [...prev, {
         id: step, run_id: "demo", agent: currentItem.agent, state: currentItem.state, order_id: orderId, 
         payload: currentItem.payload, timestamp: new Date().toISOString()
       }]);
       setCurrentState(currentItem.state);
       setActiveAgent(currentItem.agent);
       step++;
     }, 1000);
  };

  useEffect(() => {
    if (!activeRunId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/logs/${activeRunId}`);
        const data = await res.json();
        
        if (data.history && data.history.length > 0) {
           const parsedLogs = data.history.map((log: any, idx: number) => ({
             id: idx,
             run_id: log.run_id,
             agent: log.agent,
             state: log.state,
             order_id: log.order_id,
             payload: JSON.stringify(log.payload),
             timestamp: log.timestamp
           }));
           setLogs(parsedLogs);
           
           const lastLog = parsedLogs[parsedLogs.length - 1];
           setCurrentState(lastLog.state as AgentState);
           setActiveAgent(lastLog.agent);
           
           if (lastLog.state === 'DELIVERED' || lastLog.state === 'FAILED') {
              clearInterval(interval);
           }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeRunId]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const extractMetrics = () => {
     let conf = 0, fraud = 0, days = 0, time = 0, pass = "false";
     logs.forEach(l => {
       try {
         const p = JSON.parse(l.payload);
         if (p.stock_confidence) conf = p.stock_confidence;
         if (p.fraud_risk !== undefined) fraud = p.fraud_risk;
         if (p.delivery_days) days = p.delivery_days;
         if (p.execution_time_ms) time = p.execution_time_ms;
         if (p.pass !== undefined) pass = p.pass ? "true" : "false";
       } catch (e) {}
     });
     return { conf, fraud, days, time, pass };
  };

  const metrics = extractMetrics();

  const getAgentClass = (name: string) => {
     if (activeAgent !== name) return "agent-node";
     const lookup: any = {
       "OrderAgent": "active-fetch",
       "InventoryAgent": "active-analyze",
       "PaymentAgent": "active-summarize",
       "DeliveryAgent": "active-evaluate"
     };
     return `agent-node active ${lookup[name] || ""}`;
  };

  return (
    <div className="dashboard">
      <div className="panel">
        <div className="panel-title"><Network size={18} /> Architecture Pipeline</div>
        <div className={getAgentClass("OrderAgent")}>
           <div className="agent-name">Order Agent</div>
           <div className="agent-role">Receives Order</div>
        </div>
        <div className={getAgentClass("InventoryAgent")}>
           <div className="agent-name">Inventory Agent</div>
           <div className="agent-role">Checks Stock</div>
        </div>
        <div className={getAgentClass("PaymentAgent")}>
           <div className="agent-name">Payment Agent</div>
           <div className="agent-role">Verifies Payment</div>
        </div>
        <div className={getAgentClass("DeliveryAgent")}>
           <div className="agent-name">Delivery Agent</div>
           <div className="agent-role">Assigns Shipment</div>
        </div>
      </div>

      <div className="panel" style={{ background: 'transparent', border: 'none', gap: '1.5rem', overflow: 'hidden' }}>
        <div className="panel" style={{ height: '35%' }}>
          <div className="panel-title"><Activity size={18} /> State Machine Trace</div>
          <div className="p-3 mb-2" style={{textAlign: 'center', marginTop: '1rem', marginBottom: '1rem'}}>
             <span className={`badge badge-${currentState.replace('_', '-')}`}>{currentState}</span>
          </div>
          <div className="transitions">
            {logs.map((log, i) => (
              <div key={i} className="transition-item">
                <span style={{color: 'var(--text-muted)'}}>↳</span> 
                <span className={`badge badge-${log.state.replace('_', '-')}`} style={{fontSize: '0.65rem'}}>{log.state}</span>
                <span>{log.agent} initialized payload.</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel" style={{ height: '65%' }}>
          <div className="panel-title"><Server size={18} /> JSON Message Protocol</div>
          <div className="log-panel" ref={logContainerRef}>
            {logs.map((log, i) => (
              <div key={i} className="log-message">
                <div className="log-meta">
                  <span style={{ color: 'var(--color-summarize-light)', fontWeight: 600 }}>{log.agent}</span>
                  <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="log-json">
                  {`{ "run_id": "${log.run_id}", "agent": "${log.agent}",\n  "state": "${log.state}", "order_id": "${log.order_id}",\n  "payload": ${log.payload} }`}
                </div>
              </div>
            ))}
            {currentState !== 'IDLE' && currentState !== 'DELIVERED' && currentState !== 'FAILED' && (
              <div className="text-center" style={{color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center'}}>Awaiting next transition...</div>
            )}
          </div>
        </div>
      </div>

      <div className="panel" style={{ background: 'transparent', border: 'none', gap: '1.5rem' }}>
        <div className="panel">
          <div className="panel-title"><Activity size={18} /> Quantitative Metrics</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '1rem' }}>
             <div className="metric-box">
                <div className="metric-val">{metrics.conf ? metrics.conf.toFixed(2) : '-'}</div>
                <div className="metric-label">Stock Confidence</div>
             </div>
             <div className="metric-box">
                <div className="metric-val">{metrics.fraud !== undefined ? metrics.fraud.toFixed(2) : '-'}</div>
                <div className="metric-label">Fraud Risk</div>
             </div>
             <div className="metric-box">
                <div className="metric-val">{metrics.days ? metrics.days : '-'}</div>
                <div className="metric-label">Est. Delivery (Days)</div>
             </div>
             <div className="metric-box">
                <div className="metric-val">{metrics.time ? `${Math.round(metrics.time)}ms` : '-'}</div>
                <div className="metric-label">Processed In</div>
             </div>
             <div className="metric-box" style={{ gridColumn: 'span 2' }}>
                <div className="metric-val" style={{ color: metrics.pass === 'true' ? 'var(--color-success-light)' : 'var(--text-main)'}}>{metrics.pass.toUpperCase()}</div>
                <div className="metric-label">Final Shipment Approved</div>
             </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-title"><Play size={18} /> Run Controls</div>
          <div className="controls-wrapper">
             <div>
               <label className="metric-label">Order ID (Dataset)</label>
               <select className="input-field mt-1" value={orderId} onChange={e => setOrderId(e.target.value)}>
                 <option value="1">1 - MacBook Pro M3</option>
                 <option value="2">2 - Samsung S24 Ultra</option>
                 <option value="3">3 - Nike Air Max</option>
                 <option value="4">4 - Sony WH-1000XM5</option>
                 <option value="5">5 - Nintendo Switch</option>
                 <option value="6">6 - Dyson V15 Detect</option>
                 <option value="7">7 - Amazon Echo Dot</option>
                 <option value="8">8 - Apple Watch Series 9</option>
                 <option value="9">9 - LG C3 OLED TV</option>
                 <option value="10">10 - Kindle Paperwhite</option>
               </select>
             </div>
             
             <div>
               <label className="metric-label">PRNG Base Seed</label>
               <input type="number" className="input-field mt-1" value={seed} onChange={e => setSeed(Number(e.target.value))} />
             </div>

             <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={startRun}>
                  <Play size={16} /> Start
                </button>
                <button className="btn" onClick={stopRun}><Square size={16} /></button>
                <button className="btn" onClick={resetRun}><RotateCcw size={16} /></button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
