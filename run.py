from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from contextlib import asynccontextmanager
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

@app.post("/api/run")
async def trigger_run(request: RunRequest, background_tasks: BackgroundTasks):
    # In a full app, this would use websockets for live updates
    # For now, it immediately starts the run process on the backend
    background_tasks.add_task(orchestrator.run_pipeline, request.order_id, request.seed)
    return {"status": "started", "order_id": request.order_id, "seed": request.seed}

@app.get("/api/logs/{run_id}")
async def get_logs(run_id: str):
    history = orchestrator.logger.get_run_history(run_id)
    return {"run_id": run_id, "history": history}

if __name__ == "__main__":
    uvicorn.run("run:app", host="0.0.0.0", port=8000, reload=True)
