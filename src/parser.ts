import { N8nWorkflow, NormalizedNode, NormalizedEdge, ParsedWorkflow, N8nNode } from './types';
import winston from 'winston';

export class WorkflowParser {
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/parser.log' })
      ]
    });
  }

  parseWorkflow(workflow: N8nWorkflow, workflowUrl: string): ParsedWorkflow {
    try {
      this.logger.info(`Parsing workflow: ${workflow.name}`);

      const normalizedNodes = this.normalizeNodes(workflow.nodes);
      const normalizedEdges = this.normalizeEdges(workflow.connections);
      
      const metadata = this.generateMetadata(workflow, normalizedNodes);

      const indexMeta = this.generateIndexMeta(workflow, normalizedNodes, normalizedEdges);

      const graph = this.generateGraph(normalizedNodes, normalizedEdges);

      const parsedWorkflow: ParsedWorkflow = {
        workflow_id: workflow.id,
        workflow_name: workflow.name,
        workflow_url: workflowUrl,
        raw_template: workflow,
        normalized_nodes: normalizedNodes,
        normalized_edges: normalizedEdges,
        metadata,
        index_meta: indexMeta,
        graph
      };

      this.logger.info(`Successfully parsed workflow: ${workflow.name} with ${normalizedNodes.length} nodes and ${normalizedEdges.length} edges`);
      
      return parsedWorkflow;
    } catch (error) {
      this.logger.error(`Failed to parse workflow: ${workflow.name}`, error);
      throw error;
    }
  }

  private normalizeNodes(nodes: N8nNode[]): NormalizedNode[] {
    return nodes.map(node => this.normalizeNode(node));
  }

  private normalizeNode(node: N8nNode): NormalizedNode {
    const functionalRole = this.inferFunctionalRole(node);
    const inputs = this.extractNodeInputs(node);
    const outputs = this.inferNodeOutputs(node);
    const constraints = this.extractNodeConstraints(node);

    return {
      node_id: node.id,
      node_type: node.type,
      display_name: node.name,
      functional_role: functionalRole,
      inputs,
      outputs,
      constraints,
      raw_config: {
        parameters: node.parameters,
        credentials: node.credentials,
        position: node.position,
        typeVersion: node.typeVersion
      },
      position: node.position
    };
  }

  private inferFunctionalRole(node: N8nNode): 'trigger' | 'connector' | 'transform' | 'other' {
    const nodeType = node.type.toLowerCase();
    const nodeName = node.name.toLowerCase();

    // Trigger nodes
    if (this.isTriggerNode(nodeType, nodeName)) {
      return 'trigger';
    }

    // Connector nodes (external system interactions)
    if (this.isConnectorNode(nodeType, nodeName)) {
      return 'connector';
    }

    // Transform nodes
    if (this.isTransformNode(nodeType, nodeName)) {
      return 'transform';
    }

    return 'other';
  }

  private isTriggerNode(nodeType: string, nodeName: string): boolean {
    const triggerKeywords = ['webhook', 'trigger', 'schedule', 'cron', 'polling'];
    const triggerNodeTypes = ['n8n-nodes-base.webhook', 'n8n-nodes-base.scheduleTrigger', 'n8n-nodes-base.cron'];
    
    return triggerKeywords.some(keyword => 
      nodeType.includes(keyword) || nodeName.includes(keyword)
    ) || triggerNodeTypes.includes(nodeType);
  }

  private isConnectorNode(nodeType: string, nodeName: string): boolean {
    const connectorKeywords = ['http', 'postgres', 'mysql', 'slack', 'dropbox', 'google', 'aws', 'azure', 'salesforce'];
    const connectorNodeTypes = [
      'n8n-nodes-base.httpRequest', 'n8n-nodes-base.postgres', 'n8n-nodes-base.mysql',
      'n8n-nodes-base.slack', 'n8n-nodes-base.dropbox', 'n8n-nodes-base.googleSheets'
    ];
    
    return connectorKeywords.some(keyword => 
      nodeType.includes(keyword) || nodeName.includes(keyword)
    ) || connectorNodeTypes.includes(nodeType);
  }

  private isTransformNode(nodeType: string, nodeName: string): boolean {
    const transformKeywords = ['function', 'code', 'transform', 'map', 'merge', 'spreadsheet', 'filter', 'sort', 'if', 'switch'];
    const transformNodeTypes = [
      'n8n-nodes-base.function', 'n8n-nodes-base.code', 'n8n-nodes-base.merge',
      'n8n-nodes-base.spreadsheetFile', 'n8n-nodes-base.filter'
    ];
    
    return transformKeywords.some(keyword => 
      nodeType.includes(keyword) || nodeName.includes(keyword)
    ) || transformNodeTypes.includes(nodeType);
  }

  private extractNodeInputs(node: N8nNode): any[] {
    const inputs: any[] = [];
    
    if (node.parameters) {
      // Extract parameters as inputs
      Object.entries(node.parameters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          inputs.push({
            name: key,
            type: this.inferParameterType(value),
            required: this.isParameterRequired(key, value),
            default: value,
            description: this.generateParameterDescription(key, value)
          });
        }
      });
    }

    // Add standard node inputs
    if (node.credentials) {
      inputs.push({
        name: 'credentials',
        type: 'credentials',
        required: true,
        description: 'Node authentication credentials'
      });
    }

    return inputs;
  }

  private inferParameterType(value: any): string {
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (Array.isArray(value)) return 'array';
    if (value && typeof value === 'object') return 'object';
    return 'unknown';
  }

  private isParameterRequired(key: string, value: any): boolean {
    // Some parameters are typically required
    const requiredParams = ['url', 'query', 'body', 'table', 'operation'];
    return requiredParams.includes(key) || value === '' || value === null;
  }

  private generateParameterDescription(key: string, value: any): string {
    // Generate human-readable descriptions for common parameters
    const descriptions: { [key: string]: string } = {
      url: 'Target URL for the request',
      method: 'HTTP method to use',
      headers: 'Request headers',
      body: 'Request body data',
      query: 'Query parameters',
      table: 'Database table name',
      operation: 'Database operation to perform',
      message: 'Message content to send',
      channel: 'Channel or destination',
      file: 'File path or content'
    };

    return descriptions[key] || `Parameter: ${key}`;
  }

  private inferNodeOutputs(node: N8nNode): any[] {
    const outputs: any[] = [];
    
    // Common output patterns for different node types
    if (this.isTriggerNode(node.type.toLowerCase(), node.name.toLowerCase())) {
      outputs.push({
        name: 'trigger_data',
        type: 'object',
        description: 'Data that triggered the workflow'
      });
    }

    if (this.isConnectorNode(node.type.toLowerCase(), node.name.toLowerCase())) {
      outputs.push({
        name: 'response_data',
        type: 'object',
        description: 'Response data from external system'
      });
    }

    if (this.isTransformNode(node.type.toLowerCase(), node.name.toLowerCase())) {
      outputs.push({
        name: 'transformed_data',
        type: 'object',
        description: 'Data after transformation'
      });
    }

    // Default output for all nodes
    outputs.push({
      name: 'output',
      type: 'object',
      description: 'Node output data'
    });

    return outputs;
  }

  private extractNodeConstraints(node: N8nNode): any {
    const constraints: any = {
      retry_on_fail: false,
      max_tries: undefined,
      wait_between_tries: undefined,
      timeout: undefined,
      error_handling: undefined,
      retry_policy: 'exponential_backoff'
    };

    // Extract retry configuration
    if (node.retryOnFail !== undefined) {
      constraints.retry_on_fail = node.retryOnFail;
    }

    if (node.maxTries !== undefined) {
      constraints.max_tries = node.maxTries;
    }

    if (node.waitBetweenTries !== undefined) {
      constraints.wait_between_tries = node.waitBetweenTries;
    }

    if (node.timeout !== undefined) {
      constraints.timeout = node.timeout;
    }

    // Set default retry behavior if not specified
    if (constraints.retry_on_fail && !constraints.max_tries) {
      constraints.max_tries = 3;
    }

    if (constraints.retry_on_fail && !constraints.wait_between_tries) {
      constraints.wait_between_tries = 1000; // 1 second
    }

    // Infer error handling from node configuration
    if (node.continueOnFail !== undefined) {
      constraints.error_handling = node.continueOnFail ? 'continue' : 'stop';
    }

    return constraints;
  }

  private normalizeEdges(connections: any): NormalizedEdge[] {
    const edges: NormalizedEdge[] = [];
    
    Object.entries(connections).forEach(([fromNodeId, connectionData]: [string, any]) => {
      if (connectionData.main && Array.isArray(connectionData.main)) {
        connectionData.main.forEach((outputConnections: any[], outputIndex: number) => {
          if (Array.isArray(outputConnections)) {
            outputConnections.forEach((connection: any) => {
              if (connection && connection.node) {
                edges.push({
                  from_node: fromNodeId,
                  to_node: connection.node,
                  channel: `output_${outputIndex}`,
                  condition: connection.condition
                });
              }
            });
          }
        });
      }
    });

    return edges;
  }

  private generateMetadata(workflow: N8nWorkflow, normalizedNodes: NormalizedNode[]): any {
    const triggerNodes = normalizedNodes.filter(node => node.functional_role === 'trigger').length;
    const connectorNodes = normalizedNodes.filter(node => node.functional_role === 'connector').length;
    const transformNodes = normalizedNodes.filter(node => node.functional_role === 'transform').length;

    return {
      total_nodes: normalizedNodes.length,
      total_edges: this.normalizeEdges(workflow.connections).length,
      trigger_nodes: triggerNodes,
      connector_nodes: connectorNodes,
      transform_nodes: transformNodes,
      crawled_at: new Date(),
      parsed_at: new Date()
    };
  }

  private generateIndexMeta(workflow: N8nWorkflow, nodes: NormalizedNode[], edges: NormalizedEdge[]): any {
    const roleCounts = {
      trigger: nodes.filter(n => n.functional_role === 'trigger').length,
      connector: nodes.filter(n => n.functional_role === 'connector').length,
      transform: nodes.filter(n => n.functional_role === 'transform').length,
      other: nodes.filter(n => n.functional_role === 'other').length
    };

    const modalitiesSet = new Set<'files' | 'data' | 'webhooks'>();

    for (const node of nodes) {
      const typeLower = node.node_type.toLowerCase();
      const nameLower = node.display_name.toLowerCase();

      // Webhooks modality: any trigger or explicit webhook/trigger
      if (node.functional_role === 'trigger' || typeLower.includes('webhook') || nameLower.includes('webhook') || nameLower.includes('trigger')) {
        modalitiesSet.add('webhooks');
      }

      // Files modality: spreadsheet/binary/file
      if (typeLower.includes('spreadsheet') || typeLower.includes('file') || typeLower.includes('binary') || nameLower.includes('spreadsheet') || nameLower.includes('file')) {
        modalitiesSet.add('files');
      }

      // Data modality: HTTP/DB
      if (typeLower.includes('http') || typeLower.includes('request') || typeLower.includes('postgres') || typeLower.includes('mysql') || typeLower.includes('mongodb') || typeLower.includes('db') || typeLower.includes('database')) {
        modalitiesSet.add('data');
      }
    }

    const hasOnErrorRoute = this.detectOnErrorRoute(workflow, nodes, edges);

    return {
      roles: roleCounts,
      modalities: Array.from(modalitiesSet),
      has_on_error_route: hasOnErrorRoute,
      retry_policy: 'exponential_backoff'
    };
  }

  private detectOnErrorRoute(workflow: N8nWorkflow, nodes: NormalizedNode[], edges: NormalizedEdge[]): boolean {
    // Heuristics:
    // 1) Node named 'Error' or 'On Error' (case-insensitive)
    // 2) Node type includes 'errorTrigger'
    // 3) Any edge channel/condition mentions 'error'
    const namePattern = /^(on\s*error|error|error handler)$/i;

    if (nodes.some(n => namePattern.test(n.display_name))) {
      return true;
    }

    if (nodes.some(n => n.node_type.toLowerCase().includes('errortrigger'))) {
      return true;
    }

    if (edges.some(e => (e.channel && e.channel.toLowerCase().includes('error')) || (typeof e.condition === 'string' && e.condition.toLowerCase().includes('error')))) {
      return true;
    }

    // Fallback: if workflow meta hints at error handling
    const metaText = JSON.stringify(workflow.meta || {}).toLowerCase();
    if (metaText.includes('error')) return true;

    return false;
  }

  private generateGraph(nodes: NormalizedNode[], edges: NormalizedEdge[]) {
    return {
      nodes: nodes.map(n => ({
        node_id: n.node_id,
        display_name: n.display_name,
        node_type: n.node_type,
        functional_role: n.functional_role
      })),
      edges
    };
  }

  parseWorkflows(workflows: N8nWorkflow[], workflowUrls: string[]): ParsedWorkflow[] {
    if (workflows.length !== workflowUrls.length) {
      throw new Error('Mismatch between workflows and URLs arrays');
    }

    return workflows.map((workflow, index) => 
      this.parseWorkflow(workflow, workflowUrls[index])
    );
  }
}
