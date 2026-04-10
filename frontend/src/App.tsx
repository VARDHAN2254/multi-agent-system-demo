import React, { useState, useEffect, useRef } from 'react';
import { Network, Server, Play, Square, RotateCcw, Activity } from 'lucide-react';

type AgentState = "IDLE" | "FETCHING" | "ANALYZING" | "SUMMARIZING" | "EVALUATING" | "COMPLETE" | "FAILED";

interface LogMessage {
  id: number;
  run_id: string;
  agent: string;
  state: AgentState;
  article_id: string;
  payload: string; // JSON parsed
  timestamp: string;
}

const API_BASE = "http://localhost:8000/api";

function App() {
  const [seed, setSeed] = useState(42);
  const [articleId, setArticleId] = useState("1");
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
        body: JSON.stringify({ article_id: articleId, seed })
      });
      const data = await res.json();
      setActiveRunId(data.run_id); 
    } catch (e) {
      console.error(e);
      // Fallback for demo purposes if backend isn't awake
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
       { agent: "Fetcher", state: "FETCHING", payload: `{"title": "Global Market Trends", "length": 450}` },
       { agent: "Analyzer", state: "ANALYZING", payload: `{"category": "Finance", "sentiment": 0.6, "entities": ["solar", "wind"]}` },
       { agent: "Summarizer", state: "SUMMARIZING", payload: `{"abstract": "This article discusses finance..."}` },
       { agent: "Evaluator", state: "EVALUATING", payload: `{"pass": true, "compression": 0.12, "relevance": 0.8, "coherence": 4.1}` },
       { agent: "System", state: "COMPLETE", payload: `{"execution_time_ms": 3200}` }
     ];
     
     pollInterval.current = setInterval(() => {
       if (step >= mockFlow.length) {
         clearInterval(pollInterval.current);
         return;
       }
       const currentItem = mockFlow[step] as any;
       setLogs(prev => [...prev, {
         id: step, run_id: "demo", agent: currentItem.agent, state: currentItem.state, article_id: articleId, 
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
             article_id: log.article_id,
             payload: JSON.stringify(log.payload),
             timestamp: log.timestamp
           }));
           setLogs(parsedLogs);
           
           const lastLog = parsedLogs[parsedLogs.length - 1];
           setCurrentState(lastLog.state as AgentState);
           setActiveAgent(lastLog.agent);
           
           if (lastLog.state === 'COMPLETE' || lastLog.state === 'FAILED') {
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
      setTimeout(() => {
        if (logContainerRef.current) {
          logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
      }, 10);
    }
  }, [logs, currentState]);

  const extractMetrics = () => {
     let comp = 0, rel = 0, coh = 0, time = 0, pass = "false";
     logs.forEach(l => {
       try {
         const p = JSON.parse(l.payload);
         if (p.compression) comp = p.compression;
         if (p.relevance) rel = p.relevance;
         if (p.coherence) coh = p.coherence;
         if (p.execution_time_ms) time = p.execution_time_ms;
         if (p.pass !== undefined) pass = p.pass ? "true" : "false";
       } catch (e) {}
     });
     return { comp, rel, coh, time, pass };
  };

  const metrics = extractMetrics();

  const getAgentClass = (name: string) => {
     if (activeAgent !== name) return "agent-node";
     const lookup: any = {
       "Fetcher": "active-fetch",
       "Analyzer": "active-analyze",
       "Summarizer": "active-summarize",
       "Evaluator": "active-evaluate"
     };
     return `agent-node active ${lookup[name] || ""}`;
  };

  return (
    <div className="dashboard">
      {/* PANEL 1: AGENT PANEL */}
      <div className="panel">
        <div className="panel-title"><Network size={18} /> Architecture Pipeline</div>
        <div className={getAgentClass("Fetcher")}>
           <div className="agent-name">Fetcher</div>
           <div className="agent-role">RSS / dataset retrieval</div>
        </div>
        <div className={getAgentClass("Analyzer")}>
           <div className="agent-name">Analyzer</div>
           <div className="agent-role">NLP classification & Sentiment</div>
        </div>
        <div className={getAgentClass("Summarizer")}>
           <div className="agent-name">Summarizer</div>
           <div className="agent-role">LLM extraction & reduction</div>
        </div>
        <div className={getAgentClass("Evaluator")}>
           <div className="agent-name">Evaluator</div>
           <div className="agent-role">Quality pass / fail router</div>
        </div>
      </div>

      <div className="panel" style={{ background: 'transparent', border: 'none', gap: '1.5rem', overflow: 'hidden' }}>
        {/* PANEL 2: STATE PANEL */}
        <div className="panel" style={{ height: '35%' }}>
          <div className="panel-title"><Activity size={18} /> State Machine Trace</div>
          <div className="p-3 mb-2" style={{textAlign: 'center', marginTop: '1rem', marginBottom: '1rem'}}>
             <span className={`badge badge-${currentState}`}>{currentState}</span>
          </div>
          <div className="transitions">
            {logs.map((log, i) => (
              <div key={i} className="transition-item">
                <span style={{color: 'var(--text-muted)'}}>↳</span> 
                <span className={`badge badge-${log.state}`} style={{fontSize: '0.65rem'}}>{log.state}</span>
                <span>{log.agent} initialized payload.</span>
              </div>
            ))}
          </div>
        </div>

        {/* PANEL 3: INTERACTION LOG */}
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
                  {`{ "run_id": "${log.run_id}", "agent": "${log.agent}",\n  "state": "${log.state}", "article_id": "${log.article_id}",\n  "payload": ${log.payload} }`}
                </div>
              </div>
            ))}
            {currentState !== 'IDLE' && currentState !== 'COMPLETE' && currentState !== 'FAILED' && (
              <div className="text-center" style={{color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center'}}>Awaiting next transition...</div>
            )}
          </div>
        </div>
      </div>

      <div className="panel" style={{ background: 'transparent', border: 'none', gap: '1.5rem' }}>
        {/* PANEL 4: METRICS DASHBOARD */}
        <div className="panel">
          <div className="panel-title"><Activity size={18} /> Quantitative Metrics</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '1rem' }}>
             <div className="metric-box">
                <div className="metric-val">{metrics.comp ? metrics.comp.toFixed(2) : '-'}</div>
                <div className="metric-label">Compress Ratio</div>
             </div>
             <div className="metric-box">
                <div className="metric-val">{metrics.rel ? metrics.rel.toFixed(2) : '-'}</div>
                <div className="metric-label">Relevance</div>
             </div>
             <div className="metric-box">
                <div className="metric-val">{metrics.coh ? metrics.coh.toFixed(2) : '-'}</div>
                <div className="metric-label">Coherence</div>
             </div>
             <div className="metric-box">
                <div className="metric-val">{metrics.time ? `${Math.round(metrics.time)}ms` : '-'}</div>
                <div className="metric-label">Processed In</div>
             </div>
             <div className="metric-box" style={{ gridColumn: 'span 2' }}>
                <div className="metric-val" style={{ color: metrics.pass === 'true' ? 'var(--color-success-light)' : 'var(--text-main)'}}>{metrics.pass.toUpperCase()}</div>
                <div className="metric-label">Pass Quality Eval</div>
             </div>
          </div>
        </div>

        {/* PANEL 5: RUN CONTROLS */}
        <div className="panel">
          <div className="panel-title"><Play size={18} /> Run Controls</div>
          <div className="controls-wrapper">
             <div>
               <label className="metric-label">Article ID (Dataset)</label>
               <select className="input-field mt-1" value={articleId} onChange={e => setArticleId(e.target.value)}>
                 <option value="1">1 - Advances in Quantum Computing</option>
                 <option value="2">2 - Global Market Trends 2026</option>
                 <option value="3">3 - AI Regulatory Frameworks</option>
                 <option value="4">4 - Solid-State Batteries</option>
                 <option value="5">5 - Mars Colonization Delayed</option>
                 <option value="6">6 - Crypto Market Stabilizes</option>
                 <option value="7">7 - Deep Sea Discoveries</option>
                 <option value="8">8 - Urban Farming Momentum</option>
                 <option value="9">9 - Personalized Medicine</option>
                 <option value="10">10 - Supply Chain Resilience</option>
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
