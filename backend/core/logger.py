import sqlite3
import json
from datetime import datetime
from backend.models.state import MessageProtocol, AgentState

class RunLogger:
    def __init__(self, db_path="runs.db"):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS run_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT,
                    agent TEXT,
                    state TEXT,
                    order_id TEXT,
                    payload TEXT,
                    timestamp TEXT
                )
            ''')
            conn.execute('''
                CREATE TABLE IF NOT EXISTS metrics (
                    run_id TEXT PRIMARY KEY,
                    order_id TEXT,
                    compression_ratio REAL,
                    relevance_score REAL,
                    coherence_score REAL,
                    processing_time_ms REAL,
                    pass_rate BOOLEAN
                )
            ''')
            conn.commit()

    def log_transition(self, message: MessageProtocol):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                INSERT INTO run_logs (run_id, agent, state, order_id, payload, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                message.run_id,
                message.agent,
                message.state.value,
                message.order_id,
                json.dumps(message.payload),
                message.timestamp.isoformat()
            ))
            conn.commit()
            
    def get_run_history(self, run_id: str):
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute('SELECT * FROM run_logs WHERE run_id = ? ORDER BY timestamp ASC', (run_id,))
            return [dict(row) for row in cursor.fetchall()]

