import time
from typing import Tuple
from backend.models.state import OrderData

def seeded_random(seed: int, salt: int):
    val = seed + salt
    val = (val ^ 61) ^ (val >> 16)
    val = val + (val << 3)
    val = val ^ (val >> 4)
    val = val * 0x27d4eb2d
    val = val ^ (val >> 15)
    return (val & 0xFFFFFFFF) / 0xFFFFFFFF

class OrderAgent:
    def process(self, order_id: str, seed: int) -> OrderData:
        time.sleep(0.5) 
        dummy_orders = {
            "1": ("John Doe", "MacBook Pro M3", 1, 1999.99),
            "2": ("Jane Smith", "Samsung S24 Ultra", 2, 2399.98),
            "3": ("Alice Johnson", "Nike Air Max", 1, 129.99),
            "4": ("Bob Brown", "Sony WH-1000XM5", 1, 348.00),
            "5": ("Charlie Blue", "Nintendo Switch", 1, 299.00),
            "6": ("Diana Green", "Dyson V15 Detect", 1, 699.99),
            "7": ("Evan White", "Amazon Echo Dot", 3, 149.97),
            "8": ("Fiona Black", "Apple Watch Series 9", 1, 399.00),
            "9": ("George King", "LG C3 OLED TV", 1, 1499.99),
            "10": ("Hannah Lee", "Kindle Paperwhite", 2, 279.98)
        }
        c_name, i_name, qty, amt = dummy_orders.get(order_id, ("Mock Customer", "Mock Item", 1, 99.99))
        return OrderData(order_id=order_id, customer_name=c_name, item_name=i_name, quantity=qty, total_amount=amt)

class InventoryAgent:
    def process(self, order: OrderData, seed: int) -> OrderData:
        time.sleep(0.8)
        r = seeded_random(seed, int(order.order_id))
        
        # Determine stock level randomly based on seed
        order.stock_confidence = 0.5 + (r * 0.5) # 0.5 to 1.0
        if order.stock_confidence > 0.6:
            order.stock_status = "In Stock"
        else:
            order.stock_status = "Low Stock"
            
        return order

class PaymentAgent:
    def process(self, order: OrderData, seed: int, attempt: int) -> OrderData:
        time.sleep(1.2)
        r = seeded_random(seed, attempt * 10)
        
        # Calculate fraud risk based on seed and attempt. Subsequent attempts lower fraud risk.
        base_risk = 0.5 - (r * 0.3)
        order.fraud_risk = base_risk if attempt == 1 else base_risk * 0.5
        
        if order.fraud_risk >= 0.3:
            order.payment_status = "Pending Verification"
        else:
            order.payment_status = "Authorized"
            
        return order

class DeliveryAgent:
    def process(self, order: OrderData, seed: int, attempt: int) -> Tuple[bool, float, float, int]:
        time.sleep(0.6)
        r = seeded_random(seed, attempt * 100)
        
        # Criteria for successful processing
        # We need stock confidence > 0.6 and fraud risk < 0.3
        pass_eval = (order.stock_confidence > 0.6) and (order.fraud_risk < 0.3)
        
        delivery_days = int(2 + (r * 5)) # 2 to 7 days
        order.delivery_time_estimate = delivery_days
        
        if pass_eval:
            order.shipping_partner = "FedEx" if r > 0.5 else "UPS"
        else:
            order.shipping_partner = "None"
            
        # Logging metrics
        order.metrics = {
            "stock_confidence": order.stock_confidence,
            "fraud_risk": order.fraud_risk,
            "delivery_time_estimate": float(delivery_days),
            "pass_rate": 1.0 if pass_eval else 0.0
        }
        
        return pass_eval, order.stock_confidence, order.fraud_risk, delivery_days
