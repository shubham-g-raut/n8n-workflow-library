export interface N8nWorkflow {
  id: string;
  name: string;
  nodes: N8nNode[];
  connections: N8nConnection;
  active: boolean;
  settings: any;
  versionId: string;
  meta: any;
  tags: string[];
  triggerCount: number;
  updatedAt: string;
  createdAt: string;
}

export interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: any;
  credentials?: any;
  continueOnFail?: boolean;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  timeout?: number;
  webhookId?: string;
  alwaysOutputData?: boolean;
  executeOnce?: boolean;
  stopOnFail?: boolean;
  noOutputData?: boolean;
}

export interface N8nConnection {
  [nodeId: string]: {
    main: Array<Array<{ node: string; type: string; index: number }>>;
  };
}

export interface NormalizedNode {
  node_id: string;
  node_type: string;
  display_name: string;
  functional_role: 'trigger' | 'connector' | 'transform' | 'other';
  inputs: NodeInput[];
  outputs: NodeOutput[];
  constraints: NodeConstraints;
  raw_config: any;
  position: [number, number];
}

export interface NodeInput {
  name: string;
  type: string;
  required: boolean;
  default?: any;
  description?: string;
}

export interface NodeOutput {
  name: string;
  type: string;
  description?: string;
}

export interface NodeConstraints {
  retry_on_fail: boolean;
  max_tries?: number;
  wait_between_tries?: number;
  timeout?: number;
  error_handling?: string;
  retry_policy?: 'exponential_backoff' | 'disabled';
}

export interface NormalizedEdge {
  from_node: string;
  to_node: string;
  channel: string;
  condition?: any;
}

export interface ParsedWorkflow {
  workflow_id: string;
  workflow_name: string;
  workflow_url: string;
  raw_template: N8nWorkflow;
  normalized_nodes: NormalizedNode[];
  normalized_edges: NormalizedEdge[];
  metadata: {
    total_nodes: number;
    total_edges: number;
    trigger_nodes: number;
    connector_nodes: number;
    transform_nodes: number;
    crawled_at: Date;
    parsed_at: Date;
  };
  index_meta?: IndexMeta;
  graph?: Graph;
}

export interface CrawlResult {
  url: string;
  success: boolean;
  workflow?: N8nWorkflow;
  error?: string;
  timestamp: Date;
}

// Business/functional indexing types

export interface IndexMeta {
  roles: {
    trigger: number;
    connector: number;
    transform: number;
    other: number;
  };
  modalities: Array<'files' | 'data' | 'webhooks'>;
  has_on_error_route: boolean;
  retry_policy: 'exponential_backoff' | 'disabled';
}

export interface GraphNodeSummary {
  node_id: string;
  display_name: string;
  node_type: string;
  functional_role: 'trigger' | 'connector' | 'transform' | 'other';
}

export interface Graph {
  nodes: GraphNodeSummary[];
  edges: NormalizedEdge[];
}

export interface WorkflowDocument {
  workflow_id: string;
  url: string;
  title: string;
  description?: string;
  tags: string[];
  index_meta: IndexMeta;
  graph: Graph;
  raw_template: N8nWorkflow;
}

export interface NodeDocument {
  workflow_ref: string; // workflow_id
  node_id: string;
  display_name: string;
  node_type: string;
  functional_role: 'trigger' | 'connector' | 'transform' | 'other';
  inputs: NodeInput[];
  outputs: NodeOutput[];
  constraints: NodeConstraints;
  raw_config: any;
}

export interface EdgeDocument {
  workflow_ref: string; // workflow_id
  from_node_id: string;
  to_node_id: string;
  channel: string;
  condition?: any;
}

// ScrapeRun removed per updated requirements
