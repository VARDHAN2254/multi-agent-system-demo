import time
import uuid
import json
from datetime import datetime
from backend.models.state import MessageProtocol, AgentState
from backend.core.logger import RunLogger
from backend.agents.pipeline_agents import FetcherAgent, AnalyzerAgent, SummarizerAgent, EvaluatorAgent

class PipelineOrchestrator:
    def __init__(self, db_path="runs.db"):
        self.logger = RunLogger(db_path)
        self.fetcher = FetcherAgent()
        self.analyzer = AnalyzerAgent()
        self.summarizer = SummarizerAgent()
        self.evaluator = EvaluatorAgent()

    def _log_state(self, run_id: str, agent_name: str, state: AgentState, article_id: str, payload_data: dict):
        msg = MessageProtocol(
            run_id=run_id,
            agent=agent_name,
            state=state,
            article_id=article_id,
            payload=payload_data,
            timestamp=datetime.utcnow()
        )
        self.logger.log_transition(msg)
        print(f"[{msg.timestamp.isoformat()}] [{state.name}] {agent_name}: {json.dumps(payload_data)[:150]}...")

    def run_pipeline(self, article_id: str, seed: int = 42):
        run_id = str(uuid.uuid4())
        print(f"\n--- Starting Pipeline Run {run_id} for Article {article_id} (Seed: {seed}) ---")
        
        self._log_state(run_id, "System", AgentState.IDLE, article_id, {"status": "initialized", "seed": seed})
        
        try:
            # 1. Fetching
            self._log_state(run_id, "Fetcher", AgentState.FETCHING, article_id, {})
            start_time = time.time()
            article = self.fetcher.process(article_id, seed)
            self._log_state(run_id, "Fetcher", AgentState.FETCHING, article_id, {"title": article.title, "length": len(article.raw_text)})
            
            # 2. Analyzing
            self._log_state(run_id, "Analyzer", AgentState.ANALYZING, article_id, {})
            article = self.analyzer.process(article, seed)
            self._log_state(run_id, "Analyzer", AgentState.ANALYZING, article_id, {"category": article.category, "sentiment": article.sentiment, "entities": article.key_entities})
            
            # Retry mechanism
            max_retries = 2
            attempt = 1
            passed = False
            
            while attempt <= max_retries and not passed:
                print(f"--- Summarization Attempt {attempt} ---")
                # 3. Summarizing
                self._log_state(run_id, "Summarizer", AgentState.SUMMARIZING, article_id, {"attempt": attempt})
                article = self.summarizer.process(article, seed, attempt)
                self._log_state(run_id, "Summarizer", AgentState.SUMMARIZING, article_id, {"abstract": article.summary_abstract})
                
                # 4. Evaluating
                self._log_state(run_id, "Evaluator", AgentState.EVALUATING, article_id, {"attempt": attempt})
                passed, comp_r, rel_s, coh_s = self.evaluator.process(article, seed, attempt)
                eval_payload = {"pass": passed, "compression": comp_r, "relevance": rel_s, "coherence": coh_s}
                self._log_state(run_id, "Evaluator", AgentState.EVALUATING, article_id, eval_payload)
                
                if not passed:
                    attempt += 1

            execution_time = (time.time() - start_time) * 1000
            article.metrics["processing_time_ms"] = execution_time
            
            if passed:
                self._log_state(run_id, "System", AgentState.COMPLETE, article_id, {"execution_time_ms": execution_time})
                print(f"--- Run {run_id} COMPLETE ---")
            else:
                self._log_state(run_id, "System", AgentState.FAILED, article_id, {"reason": "Max retries reached without passing evaluation."})
                print(f"--- Run {run_id} FAILED ---")
                
            return run_id
            
        except Exception as e:
            self._log_state(run_id, "System", AgentState.FAILED, article_id, {"error": str(e)})
            print(f"--- Run {run_id} ERRORED ---")
            raise e

if __name__ == "__main__":
    orchestrator = PipelineOrchestrator()
    orchestrator.run_pipeline("1", seed=42)
