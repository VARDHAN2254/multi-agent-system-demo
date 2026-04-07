import time
from datetime import datetime
from typing import Dict, List, Tuple

from backend.models.state import OrderData


def seeded_random(seed: int, salt: int) -> float:
    val = seed + salt
    val = (val ^ 61) ^ (val >> 16)
    val = val + (val << 3)
    val = val ^ (val >> 4)
    val = val * 0x27D4EB2D
    val = val ^ (val >> 15)
    return (val & 0xFFFFFFFF) / 0xFFFFFFFF


CATALOG_BLUEPRINTS = [
    {
        "slug": "LAP",
        "category": "Laptops",
        "count": 220,
        "brands": [
            "AstraBook",
            "NovaBook",
            "ZenBook",
            "TitanBook",
            "OrbitBook",
            "PulseBook",
            "VertexBook",
            "HaloBook",
        ],
        "lines": ["Pro", "Air", "Max", "Ultra", "Prime", "Edge"],
        "price_min": 700.0,
        "price_max": 3200.0,
        "base_discount": 14,
        "base_delivery": 69.0,
        "base_delivery_days": 3,
    },
    {
        "slug": "MOB",
        "category": "Mobiles",
        "count": 220,
        "brands": ["Vertex", "Nova", "Astra", "Zen", "Pulse", "Halo", "Orbit", "Titan"],
        "lines": ["One", "Pro", "Max", "Ultra", "Lite", "Edge"],
        "price_min": 220.0,
        "price_max": 1800.0,
        "base_discount": 12,
        "base_delivery": 39.0,
        "base_delivery_days": 2,
    },
    {
        "slug": "FTW",
        "category": "Footwear",
        "count": 220,
        "brands": ["Stride", "Aero", "Flex", "Urban", "Trail", "Sprint", "Pulse", "Drift"],
        "lines": ["Runner", "Street", "Sport", "Active", "Lite", "Flow"],
        "price_min": 35.0,
        "price_max": 280.0,
        "base_discount": 18,
        "base_delivery": 19.0,
        "base_delivery_days": 2,
    },
]


def resolve_season(month: int) -> str:
    if month in (12, 1, 2):
        return "Winter"
    if month in (3, 4, 5):
        return "Summer"
    if month in (6, 7, 8, 9):
        return "Monsoon"
    return "Festive"


def season_adjustments(season: str) -> Tuple[int, float, int]:
    mapping = {
        "Winter": (4, 2.0, 1),
        "Summer": (6, 1.0, 0),
        "Monsoon": (9, 4.0, 2),
        "Festive": (12, 6.0, 1),
    }
    return mapping.get(season, (5, 2.0, 1))


def day_adjustments(day_name: str) -> Tuple[int, float, int]:
    mapping = {
        "Monday": (5, -2.0, 0),
        "Tuesday": (4, -1.5, 0),
        "Wednesday": (3, -1.0, 0),
        "Thursday": (2, 0.0, 0),
        "Friday": (1, 1.5, 0),
        "Saturday": (-2, 3.5, 1),
        "Sunday": (-3, 4.0, 1),
    }
    return mapping.get(day_name, (0, 0.0, 0))


def build_inventory_catalog(seed: int, reference_date: datetime) -> Tuple[List[Dict[str, object]], Dict[str, object]]:
    season = resolve_season(reference_date.month)
    day_name = reference_date.strftime("%A")
    day_type = "Weekend" if day_name in ("Saturday", "Sunday") else "Weekday"

    season_discount_adj, season_charge_adj, season_day_adj = season_adjustments(season)
    day_discount_adj, day_charge_adj, day_day_adj = day_adjustments(day_name)

    catalog: List[Dict[str, object]] = []
    global_index = 0

    for blueprint in CATALOG_BLUEPRINTS:
        for item_index in range(blueprint["count"]):
            global_index += 1
            salt_base = (global_index * 97) + (seed * 13)

            brand = blueprint["brands"][item_index % len(blueprint["brands"])]
            line = blueprint["lines"][item_index % len(blueprint["lines"])]
            model_number = 100 + item_index
            name = f"{brand} {line} {model_number}"

            price_noise = seeded_random(seed, salt_base + 7)
            price = round(blueprint["price_min"] + price_noise * (blueprint["price_max"] - blueprint["price_min"]), 2)

            discount_noise = int(seeded_random(seed, salt_base + 19) * 11)
            discount_percent = int(
                max(
                    5,
                    min(
                        65,
                        blueprint["base_discount"] + season_discount_adj + day_discount_adj + discount_noise - 4,
                    ),
                )
            )
            discounted_price = round(price * (1 - (discount_percent / 100.0)), 2)

            delivery_noise = int(seeded_random(seed, salt_base + 31) * 8)
            delivery_charge = round(
                max(
                    0.0,
                    blueprint["base_delivery"] + season_charge_adj + day_charge_adj + delivery_noise - 3,
                ),
                2,
            )

            delivery_days = max(
                1,
                blueprint["base_delivery_days"] + season_day_adj + day_day_adj + int(seeded_random(seed, salt_base + 43) * 2),
            )

            stock_units = int(1 + seeded_random(seed, salt_base + 59) * 95)
            if stock_units > 28:
                stock_status = "In Stock"
            elif stock_units > 9:
                stock_status = "Low Stock"
            else:
                stock_status = "Out of Stock"

            sku = f"NVK-{blueprint['slug']}-{item_index + 1:04d}"

            catalog.append(
                {
                    "sku": sku,
                    "name": name,
                    "category": blueprint["category"],
                    "image": f"https://picsum.photos/seed/novakart-{blueprint['slug'].lower()}-{item_index + 1}/720/480",
                    "price": price,
                    "discount_percent": discount_percent,
                    "discounted_price": discounted_price,
                    "delivery_charge": delivery_charge,
                    "estimated_delivery_days": delivery_days,
                    "stock_units": stock_units,
                    "stock_status": stock_status,
                    "season": season,
                    "day_name": day_name,
                }
            )

    context = {
        "season": season,
        "day_name": day_name,
        "day_type": day_type,
        "generated_items": len(catalog),
        "category_breakdown": {
            blueprint["category"]: blueprint["count"] for blueprint in CATALOG_BLUEPRINTS
        },
    }

    return catalog, context


class OrderAgent:
    def process(self, order_id: str, seed: int) -> OrderData:
        time.sleep(0.5)
        dummy_orders = {
            "1": ("John Doe", "AstraBook Pro 100", 1, 1899.99),
            "2": ("Jane Smith", "Vertex One 100", 2, 1898.00),
            "3": ("Alice Johnson", "Stride Runner 100", 1, 129.99),
            "4": ("Bob Brown", "NovaBook Air 101", 1, 1699.00),
            "5": ("Charlie Blue", "Nova Pro 101", 1, 999.00),
            "6": ("Diana Green", "Aero Street 101", 1, 149.00),
            "7": ("Evan White", "ZenBook Max 102", 1, 2099.00),
            "8": ("Fiona Black", "Astra Max 102", 1, 1199.00),
            "9": ("George King", "Flex Sport 102", 2, 319.98),
            "10": ("Hannah Lee", "TitanBook Ultra 103", 1, 2299.00),
        }
        c_name, i_name, qty, amt = dummy_orders.get(order_id, ("Mock Customer", "AstraBook Pro 100", 1, 99.99))
        return OrderData(order_id=order_id, customer_name=c_name, item_name=i_name, quantity=qty, total_amount=amt)


class InventoryAgent:
    def process(self, order: OrderData, seed: int) -> OrderData:
        time.sleep(0.8)

        try:
            order_number = int(order.order_id)
        except Exception:
            order_number = 1

        catalog, context = build_inventory_catalog(seed, datetime.now())

        selected_item = next((item for item in catalog if str(item["name"]).lower() == order.item_name.lower()), None)
        if selected_item is None and catalog:
            fallback_index = (order_number * 17) % len(catalog)
            selected_item = catalog[fallback_index]

        order.inventory_catalog = catalog
        order.inventory_context = context
        order.selected_sku = str(selected_item["sku"]) if selected_item else ""

        confidence_noise = seeded_random(seed, (order_number * 17) + 5)
        base_confidence = 0.52 + (confidence_noise * 0.46)

        selected_stock_status = str(selected_item.get("stock_status", "In Stock")) if selected_item else "In Stock"

        if selected_stock_status == "Out of Stock":
            order.stock_confidence = min(base_confidence, 0.56)
            order.stock_status = "Low Stock"
        elif selected_stock_status == "Low Stock":
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

        delivery_days = int(2 + (r * 5))  # 2 to 7 days
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
            "pass_rate": 1.0 if pass_eval else 0.0,
        }

        return pass_eval, order.stock_confidence, order.fraud_risk, delivery_days
