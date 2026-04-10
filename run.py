from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from typing import Optional

from backend.core.orchestrator import PipelineOrchestrator

app = FastAPI(title="E-Commerce Order Processing Multi-Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

orchestrator = PipelineOrchestrator()

class RunRequest(BaseModel):
    order_id: str
    seed: int = 42

import uuid

@app.post("/api/run")
async def trigger_run(request: RunRequest, background_tasks: BackgroundTasks):
    run_id = str(uuid.uuid4())
    background_tasks.add_task(orchestrator.run_pipeline, request.order_id, request.seed, run_id)
    return {"status": "started", "order_id": request.order_id, "seed": request.seed, "run_id": run_id}

@app.get("/api/logs/{run_id}")
async def get_logs(
    run_id: str,
    since_id: Optional[int] = None,
    limit: int = 500,
    include_payload: bool = True,
):
    safe_limit = max(1, min(limit, 2000))
    history = orchestrator.logger.get_run_history(
        run_id=run_id,
        since_id=since_id,
        limit=safe_limit,
        include_payload=include_payload,
    )
    last_id = history[-1]["id"] if history else since_id
    return {"run_id": run_id, "history": history, "count": len(history), "last_id": last_id}

if __name__ == "__main__":
    uvicorn.run("run:app", host="0.0.0.0", port=8000, reload=True)
