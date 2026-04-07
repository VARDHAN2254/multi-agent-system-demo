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

INVENTORY_CATALOG = [
    {
        "sku": "NVK-1001",
        "name": "MacBook Pro M3",
        "category": "Laptops",
        "image": "https://picsum.photos/seed/novakart-macbook/720/480",
        "price": 1999.99,
    },
    {
        "sku": "NVK-1002",
        "name": "Samsung S24 Ultra",
        "category": "Mobiles",
        "image": "https://picsum.photos/seed/novakart-s24/720/480",
        "price": 1199.99,
    },
    {
        "sku": "NVK-1003",
        "name": "Nike Air Max",
        "category": "Footwear",
        "image": "https://picsum.photos/seed/novakart-nike/720/480",
        "price": 129.99,
    },
    {
        "sku": "NVK-1004",
        "name": "Sony WH-1000XM5",
        "category": "Audio",
        "image": "https://picsum.photos/seed/novakart-sony/720/480",
        "price": 348.00,
    },
    {
        "sku": "NVK-1005",
        "name": "Nintendo Switch",
        "category": "Gaming",
        "image": "https://picsum.photos/seed/novakart-switch/720/480",
        "price": 299.00,
    },
    {
        "sku": "NVK-1006",
        "name": "Dyson V15 Detect",
        "category": "Home",
        "image": "https://picsum.photos/seed/novakart-dyson/720/480",
        "price": 699.99,
    },
    {
        "sku": "NVK-1007",
        "name": "Amazon Echo Dot",
        "category": "Smart Home",
        "image": "https://picsum.photos/seed/novakart-echo/720/480",
        "price": 49.99,
    },
    {
        "sku": "NVK-1008",
        "name": "Apple Watch Series 9",
        "category": "Wearables",
        "image": "https://picsum.photos/seed/novakart-watch/720/480",
        "price": 399.00,
    },
    {
        "sku": "NVK-1009",
        "name": "LG C3 OLED TV",
        "category": "TVs",
        "image": "https://picsum.photos/seed/novakart-lg-tv/720/480",
        "price": 1499.99,
    },
    {
        "sku": "NVK-1010",
        "name": "Kindle Paperwhite",
        "category": "E-Readers",
        "image": "https://picsum.photos/seed/novakart-kindle/720/480",
        "price": 139.99,
    },
]

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

        catalog = []
        selected_item = None
        order_number = int(order.order_id)

        for idx, item in enumerate(INVENTORY_CATALOG):
            stock_noise = seeded_random(seed, (order_number * 1000) + (idx * 97))
            stock_units = int(2 + (stock_noise * 28))

            if stock_units > 12:
                stock_status = "In Stock"
            elif stock_units > 5:
                stock_status = "Low Stock"
            else:
                stock_status = "Out of Stock"

            catalog_item = {
                **item,
                "stock_units": stock_units,
                "stock_status": stock_status,
            }
            catalog.append(catalog_item)

            if item["name"] == order.item_name:
                selected_item = catalog_item

        if selected_item is None and catalog:
            selected_item = catalog[0]

        order.inventory_catalog = catalog
        order.selected_sku = selected_item["sku"] if selected_item else ""

        confidence_noise = seeded_random(seed, (order_number * 17) + 5)
        base_confidence = 0.5 + (confidence_noise * 0.5)

        if selected_item and selected_item["stock_status"] == "Out of Stock":
            order.stock_confidence = min(base_confidence, 0.56)
            order.stock_status = "Low Stock"
        elif selected_item and selected_item["stock_status"] == "Low Stock":
            order.stock_confidence = min(max(base_confidence, 0.58), 0.69)
            order.stock_status = "Low Stock"
        else:
            order.stock_confidence = max(base_confidence, 0.72)
            order.stock_status = "In Stock"

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
