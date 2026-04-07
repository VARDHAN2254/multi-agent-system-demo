export type SystemState = 'IDLE' | 'CATEGORIZING' | 'INVESTIGATING' | 'DRAFTING' | 'COMPLETED' | 'ERROR';

export interface Ticket {
  id: string;
  text: string;
}

export interface Message {
  id: string;
  sender: 'System' | 'Categorizer' | 'Investigator' | 'Responder';
  text: string;
  jsonPayload?: any;
  timestamp: Date;
}

export interface MetricData {
  runId: string;
  executionTimeMs: number;
  wordCount: number;
  confidenceScore: number;
}

export interface RunContext {
  runId: string;
  ticket: Ticket;
  messages: Message[];
  state: SystemState;
  transitions: string[];
  metrics: MetricData;
}
