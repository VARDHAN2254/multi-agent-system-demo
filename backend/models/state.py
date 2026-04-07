from enum import Enum
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional
from datetime import datetime

class AgentState(str, Enum):
    IDLE = "IDLE"
    FETCHING = "FETCHING"
    ANALYZING = "ANALYZING"
    SUMMARIZING = "SUMMARIZING"
    EVALUATING = "EVALUATING"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"

class MessageProtocol(BaseModel):
    run_id: str
    agent: str
    state: AgentState
    article_id: str
    payload: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class ArticleData(BaseModel):
    article_id: str
    title: str = ""
    raw_text: str = ""
    source: str = ""
    timestamp: Optional[datetime] = None
    category: str = ""
    sentiment: float = 0.0
    key_entities: list[str] = []
    complexity_score: float = 0.0
    summary_headline: str = ""
    summary_abstract: str = ""
    summary_bullets: list[str] = []
    metrics: Dict[str, float] = {}
