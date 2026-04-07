# Multi-Agent E-Commerce Order Pipeline - Architecture Document

## Overview
This system is a deterministic, multi-agent automated orchestration designed to facilitate E-commerce order placement, inventory scoping, payment processing, and final delivery logistics. It cleanly separates role-behaviors across four individual agents communicating seamlessly with structured JSON payload mapping via a top-level Orchestrator.

## Non-Negotiable Requirements Met

### 1. Multi-Agent Architecture
The system employs **four agents** cleanly separated by function:
- **OrderAgent**: Bootstraps realistic mock customer parameters natively into OrderData mapping logic.
- **InventoryAgent**: Synthesizes warehouse querying to provide strict stock level confidence scores and categorical updates.
- **PaymentAgent**: Evaluates fraudulent indicators utilizing explicit randomized state seeds and outputs transaction validity.
- **DeliveryAgent**: Implements strict gate-logic evaluating previous steps; assigns logical shipping couriers based on compliance logic.

### 2. State Machine & Orchestrator
To strictly prevent single "god-agent" behaviors, control is manually routed sequentially via the `PipelineOrchestrator` acting on explicit enum configurations:
- States: `IDLE`, `ORDER_PLACED`, `VERIFIED`, `PACKED`, `SHIPPED`, `DELIVERED`, `FAILED`
- **JSON Protocol**: The `MessageProtocol` rigidly structures messaging passing: `{run_id, agent, state, order_id, payload, timestamp}`.

### 3. Observability & Logging
All transitions are rigorously recorded in local `RunLogger` (SQlite backed via `runs.db`). Each run generates a unique UUID, tracks timestamps accurately to the millisecond, and exposes endpoints to replay history allowing full observability.

### 4. Compulsory UI Features
The frontend is built natively with React and features rich Glassmorphism aesthetics:
- **Agent Panel**: Real-time visual tracking of active node (e.g. Inventory Agent or Payment Agent).
- **State Panel**: Trace log of E-commerce states (`ORDER_PLACED -> DELIVERED`).
- **Interaction Log**: Raw JSON visualizer inspecting live system message payloads.
- **Metrics Dashboard**: Quantitatively monitors Fraud Risk, Stock Confidence, Delivery constraints, and Run-time evaluation speeds.

### 5. Deployment Constraints
Executes exclusively utilizing PRNG simulated determinism ensuring results are 100% reproducible without risking live infrastructure costs or relying on single monolithic LLM executions simulating business steps. 10 strict mocked catalog records ensure rigorous scalability constraints.
