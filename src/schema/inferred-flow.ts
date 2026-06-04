export interface InteractableElement {
  type: 'button' | 'input' | 'link' | 'select' | 'textarea';
  text?: string;
  placeholder?: string;
  inputType?: string;
  href?: string;
}

export interface PageObservation {
  url: string;
  title: string;
  headings: string[];
  elements: InteractableElement[];
  observedAt: string;
}

export interface FlowStep {
  stepNumber: number;
  action: string;
  target: string;
  expectedOutcome: string;
}

export interface InferredFlow {
  name: string;
  description: string;
  category: string;
  actor: string;
  entryPoint: string;
  steps: FlowStep[];
  exitPoint: string;
  confidence: number;
}

export interface DiscoverySession {
  runId: string;
  targetUrl: string;
  appContext: string;
  skillFile?: string;
  ranAt: string;
  pagesCrawled: number;
  flows: InferredFlow[];
}

export type FlowStatus = 'pending' | 'approved' | 'rejected';

export type FlowDeltaClassification = 'duplicate' | 'modified' | 'new' | 'deleted';

export interface FlowDeltaResult {
  flowId: string;
  flowName: string;
  classification: FlowDeltaClassification;
  similarity?: number;
  matchedRunId?: string;
}
