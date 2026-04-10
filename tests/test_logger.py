import os
import tempfile
import time
import unittest
from datetime import datetime, timezone

from backend.core.logger import RunLogger
from backend.models.state import AgentState, MessageProtocol


class RunLoggerQueryTests(unittest.TestCase):
    def setUp(self):
        fd, self.db_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        self.logger = RunLogger(db_path=self.db_path)

    def tearDown(self):
        if os.path.exists(self.db_path):
            for _ in range(5):
                try:
                    os.remove(self.db_path)
                    break
                except PermissionError:
                    time.sleep(0.1)

    def _log(self, run_id: str, state: AgentState, payload: dict):
        self.logger.log_transition(
            MessageProtocol(
                run_id=run_id,
                agent="System",
                state=state,
                order_id="1",
                payload=payload,
                timestamp=datetime.now(timezone.utc),
            )
        )

    def test_get_run_history_supports_since_id_and_limit(self):
        run_id = "run-a"
        self._log(run_id, AgentState.IDLE, {"status": "initialized"})
        self._log(run_id, AgentState.ORDER_PLACED, {"customer": "John"})
        self._log("run-b", AgentState.IDLE, {"status": "other-run"})

        history = self.logger.get_run_history(run_id)
        self.assertEqual(len(history), 2)
        self.assertLess(history[0]["id"], history[1]["id"])

        since_history = self.logger.get_run_history(run_id, since_id=history[0]["id"])
        self.assertEqual(len(since_history), 1)
        self.assertEqual(since_history[0]["state"], AgentState.ORDER_PLACED.value)

        limited_history = self.logger.get_run_history(run_id, limit=1)
        self.assertEqual(len(limited_history), 1)

    def test_get_run_history_can_exclude_payload(self):
        run_id = "run-c"
        self._log(run_id, AgentState.VERIFIED, {"stock_status": "In Stock"})
        history = self.logger.get_run_history(run_id, include_payload=False)
        self.assertEqual(len(history), 1)
        self.assertNotIn("payload", history[0])


if __name__ == "__main__":
    unittest.main()
