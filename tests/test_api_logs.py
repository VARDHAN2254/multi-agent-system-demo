import asyncio
import os
import tempfile
import time
import unittest
from datetime import datetime, timezone

from backend.core.orchestrator import PipelineOrchestrator
from backend.models.state import AgentState, MessageProtocol
import run as run_module


class ApiLogsEndpointTests(unittest.TestCase):
    def setUp(self):
        fd, self.db_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)

        self.original_orchestrator = run_module.orchestrator
        run_module.orchestrator = PipelineOrchestrator(db_path=self.db_path)

    def tearDown(self):
        run_module.orchestrator = self.original_orchestrator
        if os.path.exists(self.db_path):
            for _ in range(5):
                try:
                    os.remove(self.db_path)
                    break
                except PermissionError:
                    time.sleep(0.1)

    def _seed_logs(self, run_id: str):
        logger = run_module.orchestrator.logger
        logger.log_transition(
            MessageProtocol(
                run_id=run_id,
                agent="System",
                state=AgentState.IDLE,
                order_id="1",
                payload={"status": "initialized"},
                timestamp=datetime.now(timezone.utc),
            )
        )
        logger.log_transition(
            MessageProtocol(
                run_id=run_id,
                agent="OrderAgent",
                state=AgentState.ORDER_PLACED,
                order_id="1",
                payload={"customer": "John Doe"},
                timestamp=datetime.now(timezone.utc),
            )
        )

    def test_logs_endpoint_supports_incremental_fetch(self):
        run_id = "run-api-1"
        self._seed_logs(run_id)

        first_data = asyncio.run(run_module.get_logs(run_id=run_id, limit=1))
        self.assertEqual(first_data["count"], 1)
        self.assertIn("last_id", first_data)

        second_data = asyncio.run(
            run_module.get_logs(run_id=run_id, since_id=first_data["last_id"], limit=10)
        )
        self.assertEqual(second_data["count"], 1)
        self.assertEqual(second_data["history"][0]["state"], AgentState.ORDER_PLACED.value)

    def test_logs_endpoint_can_omit_payload(self):
        run_id = "run-api-2"
        self._seed_logs(run_id)

        data = asyncio.run(run_module.get_logs(run_id=run_id, include_payload=False))
        self.assertGreaterEqual(data["count"], 1)
        self.assertNotIn("payload", data["history"][0])


if __name__ == "__main__":
    unittest.main()
