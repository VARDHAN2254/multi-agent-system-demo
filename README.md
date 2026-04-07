# Multi-Agent News Summarization System 🚀

A comprehensive, locally-executable Multi-Agent AI system designed to intelligently orchestrate the fetching, categorization, summarization, and quality evaluation of news articles. 

This project aims to demonstrate advanced observability, strict state machine logging, deterministic reproducibility, and concrete agent separation without resorting to monolithic "god-agent" anti-patterns.

## 🌟 Key Features

* **Real Multi-Agent Architecture**: Segregated responsibilities across 4 distinct micro-agents:
  * 📡 **FetcherAgent**: Simulates data pipeline extraction.
  * 🧠 **AnalyzerAgent**: Conducts NLP tagging (Sentiment, Entity extraction, Categorization).
  * 📝 **SummarizerAgent**: Iteratively drafts article abstracts and bullet points.
  * ⚖️ **EvaluatorAgent**: A strict referee scoring responses and recursively sending bad outputs back.
* **Deterministic Execution Engine**: Capable of strictly reproducing evaluations through Seed-based PRNG, avoiding heavy costs of API hallucination looping.
* **Visual State Machine Engine**: The `PipelineOrchestrator` regulates strict JSON messaging and stores all transition arrays locally in a strict `runs.db` database.
* **Rich Glassmorphism UI**: Native React dashboard with components displaying:
  * A live visual topology of active Pipeline Agents.
  * Explicit State Transition Trees.
  * Raw JSON Message Protocol inspection logs with MS timestamps.
  * A real-time comprehensive Quantitative Metrics board.

## 🧩 Architecture Interaction Diagram

```mermaid
sequenceDiagram
    participant UI as User / React
    participant Orch as PipelineOrchestrator
    participant Fetcher as Fetcher Agent
    participant Analyzer as Analyzer Agent
    participant Summarizer as Summarizer Agent
    participant Evaluator as Evaluator Agent

    UI->>Orch: Start Run(Article ID, Seed)
    
    rect rgb(230, 245, 240)
    Note over Orch: State: FETCHING
    Orch->>Fetcher: process(article_id, seed)
    Fetcher-->>Orch: ArticleData Object
    end

    rect rgb(240, 230, 250)
    Note over Orch: State: ANALYZING
    Orch->>Analyzer: process(ArticleData, seed)
    Analyzer-->>Orch: Updated ArticleData (Category, Entities)
    end

    loop Max 2 Retries until Pass
        rect rgb(255, 240, 220)
        Note over Orch: State: SUMMARIZING
        Orch->>Summarizer: process(ArticleData, attempt)
        Summarizer-->>Orch: Summary Draft
        end

        rect rgb(255, 230, 230)
        Note over Orch: State: EVALUATING
        Orch->>Evaluator: process(draft, attempt)
        Evaluator-->>Orch: Pass/Fail + [Metrics]
        end
    end

    alt Passed Evaluation
        Note over Orch: State: COMPLETE
        Orch-->>UI: Run Success (Metrics Dashboard Updated)
    else Max Retries Exceeded
        Note over Orch: State: FAILED
        Orch-->>UI: Run Failed Alert
    end
```

## 🛠️ Technology Stack
* **Backend**: Python 3.10+ & FastAPI
* **Frontend**: React 18, TypeScript, Vite, Vanilla CSS
* **Storage**: SQLite Database (`runs.db`)

## 📊 Evaluation Metrics Emphasized
The system explicitly evaluates all generated output across quantitative checks:
1. **Compression Ratio Document length constraint (< 0.6)**
2. **Relevance Score Metric**
3. **Coherence Output Quality**
4. **Execution MS Runtime Tracking**

## 🚀 Getting Started

### 1. Start the Backend API
Start by getting the API and pipeline orchestrators online:
```bash
# Verify Python requires installing fastapi and uvicorn if missing
pip install fastapi uvicorn pydantic

# Run the backend execution server
python run.py
```

### 2. Start the Frontend Application
In a separate terminal, boot up the React User Interface:
```bash
cd demo-app
npm install
npm run dev
```

### 3. Usage Structure
Once booted:
* Navigate to your localized `localhost` UI mapped by the Vite runtime.
* Choose a mock Test Scenario Article ID from the dropdown.
* Fill up the target **Seed PRNG parameter**.
* Press **Start** and observe the live transition events and raw message objects mapping dynamically through to evaluation constraints!

## 📂 Deliverable Mappings
* **Architecture Docs**: See `docs/architecture.md`
* **Interaction Flow Diagram**: See `docs/interaction_diagram.md`
* **Evaluation Outputs**: See `./docs/evaluation_report.md` for a baseline comparison analysis.
