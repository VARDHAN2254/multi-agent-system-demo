import unittest

from backend.models.state import OrderData


class OrderDataDefaultsTests(unittest.TestCase):
    def test_mutable_fields_are_instance_isolated(self):
        first = OrderData(order_id="1")
        second = OrderData(order_id="2")

        first.metrics["pass_rate"] = 1.0
        first.inventory_catalog.append({"sku": "NVK-LAP-0001"})
        first.inventory_context["season"] = "Summer"

        self.assertEqual(second.metrics, {})
        self.assertEqual(second.inventory_catalog, [])
        self.assertEqual(second.inventory_context, {})


if __name__ == "__main__":
    unittest.main()
