# Multi-Agent News Summarization Pipeline - Architecture Document

## Overview
This system is a deterministic, multi-agent text processing workflow designed to automate news article fetching, classification, and summarization. It separates responsibilities across individual agents that communicate via a typed JSON message protocol. 

## Non-Negotiable Requirements Met

### 1. Multi-Agent Architecture
The system employs **four agents** cleanly separated by function:
- **FetcherAgent**: Simulates retrieval of an article from a dataset given an ID.
- **AnalyzerAgent**: Scans text to detect category, key entities, and sentiment. Assigns initial NLP complexity scores.
- **SummarizerAgent**: Drafts structured summaries mimicking LLM outputs based on the analyzed properties. Handles varied retry depths dynamically.
- **EvaluatorAgent**: Acts as a strict referee evaluating the output summary's coherence, relevance, and compression ratio. Capable of failing bad drafts and signaling the Orchestrator for retry.

### 2. State Machine & Orchestrator
To avoid a single monolithic "god agent," the system routes control through the `PipelineOrchestrator` which enforces state constraints via the `AgentState` enum.
- States: `IDLE`, `FETCHING`, `ANALYZING`, `SUMMARIZING`, `EVALUATING`, `COMPLETE`, `FAILED`
- **Determinism**: The pipeline incorporates a strictly seeded Pseudo Random Number Generator (PRNG) throughout the agent operations to ensure results correlate exclusively with the article and active seed.
- **JSON Protocol**: The `MessageProtocol` Pydantic class structures the transit data as `{run_id, agent, state, article_id, payload, timestamp}`.

### 3. Observability & Logging
All transitions are rigorously recorded in local `RunLogger` (SQlite backed via `runs.db`). Each run generates a unique UUID, tracks timestamps accurately to the millisecond, and exposes endpoints to replay history.

### 4. Compulsory UI Features
The frontend is built natively with React and features rich Glassmorphism aesthetics:
- **Agent Panel**: Real-time visual tracking of the active pipeline stage.
- **State Panel**: Trace log of `AgentState` history and deterministic payload shifts.
- **Interaction Log**: Raw JSON visualizer acting as the transparent developer console.
- **Metrics Dashboard**: Monitors Comp. Ratio, Relevance, Coherence, Runtime MS, and explicitly flags Evaluation Pass/Fail results.

### 5. Deployment Constraints
All dependencies execute locally without consuming external paid API calls. The mock dataset simulates constraints natively for 10 deterministic test records.
