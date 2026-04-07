from enum import Enum
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List
from datetime import datetime

class AgentState(str, Enum):
    IDLE = "IDLE"
    ORDER_PLACED = "ORDER_PLACED"
    VERIFIED = "VERIFIED"
    PACKED = "PACKED"
    SHIPPED = "SHIPPED"
    DELIVERED = "DELIVERED"
    FAILED = "FAILED"

class MessageProtocol(BaseModel):
    run_id: str
    agent: str
    state: AgentState
    order_id: str
    payload: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class OrderData(BaseModel):
    order_id: str
    customer_name: str = ""
    item_name: str = ""
    quantity: int = 0
    total_amount: float = 0.0
    stock_status: str = ""
    stock_confidence: float = 0.0
    payment_status: str = ""
    fraud_risk: float = 0.0
    shipping_partner: str = ""
    delivery_time_estimate: int = 0
    metrics: Dict[str, float] = {}
    inventory_catalog: List[Dict[str, Any]] = []
    selected_sku: str = ""
    inventory_context: Dict[str, Any] = {}
