import time
import uuid
import json
from datetime import datetime
from backend.models.state import MessageProtocol, AgentState
from backend.core.logger import RunLogger
from backend.agents.pipeline_agents import OrderAgent, InventoryAgent, PaymentAgent, DeliveryAgent

class PipelineOrchestrator:
    def __init__(self, db_path="runs.db"):
        self.logger = RunLogger(db_path)
        self.order_agent = OrderAgent()
        self.inventory_agent = InventoryAgent()
        self.payment_agent = PaymentAgent()
        self.delivery_agent = DeliveryAgent()

    def _log_state(self, run_id: str, agent_name: str, state: AgentState, order_id: str, payload_data: dict):
        msg = MessageProtocol(
            run_id=run_id,
            agent=agent_name,
            state=state,
            order_id=order_id,
            payload=payload_data,
            timestamp=datetime.utcnow()
        )
        self.logger.log_transition(msg)
        print(f"[{msg.timestamp.isoformat()}] [{state.name}] {agent_name}: {json.dumps(payload_data)[:150]}...")

    def run_pipeline(self, order_id: str, seed: int = 42):
        run_id = str(uuid.uuid4())
        print(f"\n--- Starting Order Run {run_id} for Order {order_id} (Seed: {seed}) ---")
        
        self._log_state(run_id, "System", AgentState.IDLE, order_id, {"status": "initialized", "seed": seed})
        
        try:
            start_time = time.time()

            # 1. Order Placed
            self._log_state(run_id, "OrderAgent", AgentState.ORDER_PLACED, order_id, {})
            order = self.order_agent.process(order_id, seed)
            self._log_state(run_id, "OrderAgent", AgentState.ORDER_PLACED, order_id, {"customer": order.customer_name, "item": order.item_name, "amount": order.total_amount})
            
            # 2. Verified (Inventory)
            self._log_state(run_id, "InventoryAgent", AgentState.VERIFIED, order_id, {})
            order = self.inventory_agent.process(order, seed)
            self._log_state(run_id, "InventoryAgent", AgentState.VERIFIED, order_id, {"stock_status": order.stock_status, "confidence": order.stock_confidence})
            
            # Retry mechanism for Payment & Delivery Check
            max_retries = 2
            attempt = 1
            passed = False
            
            while attempt <= max_retries and not passed:
                print(f"--- Processing Attempt {attempt} ---")
                
                # 3. Packed (Payment Verification)
                self._log_state(run_id, "PaymentAgent", AgentState.PACKED, order_id, {"attempt": attempt})
                order = self.payment_agent.process(order, seed, attempt)
                self._log_state(run_id, "PaymentAgent", AgentState.PACKED, order_id, {"payment_status": order.payment_status, "fraud_risk": order.fraud_risk})
                
                # 4. Shipped (Delivery Agent Assigment)
                self._log_state(run_id, "DeliveryAgent", AgentState.SHIPPED, order_id, {"attempt": attempt})
                passed, st_conf, f_risk, d_time = self.delivery_agent.process(order, seed, attempt)
                eval_payload = {"pass": passed, "stock_confidence": st_conf, "fraud_risk": f_risk, "delivery_days": d_time, "partner": order.shipping_partner}
                self._log_state(run_id, "DeliveryAgent", AgentState.SHIPPED, order_id, eval_payload)
                
                if not passed:
                    attempt += 1

            execution_time = (time.time() - start_time) * 1000
            order.metrics["processing_time_ms"] = execution_time
            
            if passed:
                # 5. Delivered
                self._log_state(run_id, "System", AgentState.DELIVERED, order_id, {"execution_time_ms": execution_time})
                print(f"--- Run {run_id} DELIVERED ---")
            else:
                self._log_state(run_id, "System", AgentState.FAILED, order_id, {"reason": "Max retries reached due to high fraud risk or stock shortage."})
                print(f"--- Run {run_id} FAILED ---")
                
            return run_id
            
        except Exception as e:
            self._log_state(run_id, "System", AgentState.FAILED, order_id, {"error": str(e)})
            print(f"--- Run {run_id} ERRORED ---")
            raise e

if __name__ == "__main__":
    orchestrator = PipelineOrchestrator()
    orchestrator.run_pipeline("1", seed=42)
