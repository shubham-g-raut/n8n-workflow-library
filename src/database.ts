import { MongoClient, Db, Collection } from 'mongodb';
import { ParsedWorkflow, CrawlResult, WorkflowDocument, NodeDocument, EdgeDocument } from './types';
import winston from 'winston';

export class DatabaseService {
  private client!: MongoClient;
  private db!: Db;
  private parsedWorkflowsCollection!: Collection<ParsedWorkflow>; // deprecated: no longer written
  private crawlResultsCollection!: Collection<CrawlResult>;
  private workflowsCollection!: Collection<WorkflowDocument>;
  private nodesCollection!: Collection<NodeDocument>;
  private edgesCollection!: Collection<EdgeDocument>;
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
        new winston.transports.File({ filename: 'logs/database.log' })
      ]
    });
  }

  async connect(connectionString: string): Promise<void> {
    try {
      this.client = new MongoClient(connectionString);
      await this.client.connect();
      this.db = this.client.db('n8n-workflows');
      
      // Deprecated collection retained for backward compatibility but not written to
      this.parsedWorkflowsCollection = this.db.collection<ParsedWorkflow>('parsed_workflows');
      this.crawlResultsCollection = this.db.collection<CrawlResult>('crawl_results');
      this.workflowsCollection = this.db.collection<WorkflowDocument>('workflows');
      this.nodesCollection = this.db.collection<NodeDocument>('nodes');
      this.edgesCollection = this.db.collection<EdgeDocument>('edges');
      
      // Create indexes for better search performance
      await this.createIndexes();
      
      this.logger.info('Connected to MongoDB successfully');
    } catch (error) {
      this.logger.error('Failed to connect to MongoDB', error);
      throw error;
    }
  }

  private async createIndexes(): Promise<void> {
    try {
      // Skip creating indexes for deprecated parsed_workflows to avoid creating the collection implicitly
      
      // Indexes for crawl results
      await this.crawlResultsCollection.createIndex({ url: 1 });
      await this.crawlResultsCollection.createIndex({ timestamp: 1 });
      await this.crawlResultsCollection.createIndex({ success: 1 });

      // Indexes for business/functional index
      await this.workflowsCollection.createIndex({ workflow_id: 1 }, { unique: true });
      await this.workflowsCollection.createIndex({ url: 1 });
      await this.workflowsCollection.createIndex({ 'index_meta.roles': 1 });
      await this.workflowsCollection.createIndex({ 'index_meta.modalities': 1 });
      await this.workflowsCollection.createIndex({ 'index_meta.has_on_error_route': 1 });
      // removed: scrape_ref index
      await this.workflowsCollection.createIndex({ title: 'text', description: 'text', tags: 'text' });

      await this.nodesCollection.createIndex({ workflow_ref: 1 });
      await this.nodesCollection.createIndex({ functional_role: 1 });
      await this.nodesCollection.createIndex({ node_type: 1 });

      await this.edgesCollection.createIndex({ workflow_ref: 1 });
      await this.edgesCollection.createIndex({ from_node_id: 1, to_node_id: 1 });

      // removed: scrape_runs indexes
      
      this.logger.info('Database indexes created successfully');
    } catch (error) {
      this.logger.error('Failed to create indexes', error);
      throw error;
    }
  }

  // Deprecated: no-op to preserve API compatibility
  async saveParsedWorkflow(_workflow: ParsedWorkflow): Promise<void> {
    this.logger.debug('saveParsedWorkflow is deprecated and is now a no-op');
  }

  async saveBusinessIndex(parsed: ParsedWorkflow): Promise<void> {
    try {
      const workflowDoc: WorkflowDocument = {
        workflow_id: parsed.workflow_id,
        url: parsed.workflow_url,
        title: parsed.workflow_name,
        description: (parsed.raw_template.meta && (parsed.raw_template.meta.description || parsed.raw_template.meta.summary)) || undefined,
        tags: parsed.raw_template.tags || [],
        index_meta: parsed.index_meta || {
          roles: {
            trigger: 0,
            connector: 0,
            transform: 0,
            other: 0
          },
          modalities: [],
          has_on_error_route: false,
          retry_policy: 'exponential_backoff'
        },
        graph: parsed.graph || { nodes: [], edges: [] },
        raw_template: parsed.raw_template
      };

      await this.workflowsCollection.updateOne(
        { workflow_id: workflowDoc.workflow_id },
        { $set: workflowDoc },
        { upsert: true }
      );

      // Upsert nodes
      const nodeDocs: NodeDocument[] = (parsed.normalized_nodes || []).map(n => ({
        workflow_ref: parsed.workflow_id,
        node_id: n.node_id,
        display_name: n.display_name,
        node_type: n.node_type,
        functional_role: n.functional_role,
        inputs: n.inputs as any,
        outputs: n.outputs as any,
        constraints: n.constraints as any,
        raw_config: n.raw_config
      }));

      if (nodeDocs.length > 0) {
        // Remove existing nodes for this workflow then insert new for simplicity
        await this.nodesCollection.deleteMany({ workflow_ref: parsed.workflow_id });
        if (nodeDocs.length > 0) {
          await this.nodesCollection.insertMany(nodeDocs, { ordered: false });
        }
      }

      // Upsert edges
      const edgeDocs: EdgeDocument[] = (parsed.normalized_edges || []).map(e => ({
        workflow_ref: parsed.workflow_id,
        from_node_id: e.from_node,
        to_node_id: e.to_node,
        channel: e.channel,
        condition: e.condition
      }));

      await this.edgesCollection.deleteMany({ workflow_ref: parsed.workflow_id });
      if (edgeDocs.length > 0) {
        await this.edgesCollection.insertMany(edgeDocs, { ordered: false });
      }

      this.logger.info(`Saved business index documents for: ${parsed.workflow_name}`);
    } catch (error) {
      this.logger.error(`Failed to save business index for: ${parsed.workflow_name}`, error);
      throw error;
    }
  }

  async saveCrawlResult(result: CrawlResult): Promise<void> {
    try {
      await this.crawlResultsCollection.insertOne(result);
      this.logger.info(`Saved crawl result for: ${result.url}`);
    } catch (error) {
      this.logger.error(`Failed to save crawl result for: ${result.url}`, error);
      throw error;
    }
  }

  async getWorkflowById(workflowId: string): Promise<ParsedWorkflow | null> {
    try {
      const wf = await this.workflowsCollection.findOne({ workflow_id: workflowId });
      if (!wf) return null;

      const [nodes, edges] = await Promise.all([
        this.nodesCollection.find({ workflow_ref: workflowId }).toArray(),
        this.edgesCollection.find({ workflow_ref: workflowId }).toArray()
      ]);

      const normalized_nodes = nodes.map(n => ({
        node_id: n.node_id,
        node_type: n.node_type,
        display_name: n.display_name,
        functional_role: n.functional_role,
        inputs: n.inputs as any,
        outputs: n.outputs as any,
        constraints: n.constraints as any,
        raw_config: n.raw_config,
        position: (n as any).position || [0, 0]
      }));
      const normalized_edges = edges.map(e => ({
        from_node: e.from_node_id,
        to_node: e.to_node_id,
        channel: e.channel,
        condition: e.condition
      }));

      const metadata = {
        total_nodes: normalized_nodes.length,
        total_edges: normalized_edges.length,
        trigger_nodes: normalized_nodes.filter(n => n.functional_role === 'trigger').length,
        connector_nodes: normalized_nodes.filter(n => n.functional_role === 'connector').length,
        transform_nodes: normalized_nodes.filter(n => n.functional_role === 'transform').length,
        crawled_at: new Date(),
        parsed_at: new Date()
      };

      const parsed: ParsedWorkflow = {
        workflow_id: wf.workflow_id,
        workflow_name: wf.title,
        workflow_url: wf.url,
        raw_template: wf.raw_template,
        normalized_nodes,
        normalized_edges,
        metadata,
        index_meta: (wf as any).index_meta,
        graph: (wf as any).graph
      };

      return parsed;
    } catch (error) {
      this.logger.error(`Failed to get workflow by ID: ${workflowId}`, error);
      throw error;
    }
  }

  async searchWorkflows(query: string, filters?: any): Promise<ParsedWorkflow[]> {
    try {
      // Prefer searching the business/functional index
      let searchQuery: any = {};
      if (query) {
        searchQuery.$text = { $search: query };
      }
      if (filters) {
        searchQuery = { ...searchQuery, ...filters };
      }

      const workflowDocs = await this.workflowsCollection
        .find(searchQuery)
        .sort({ title: 1 })
        .limit(100)
        .toArray();

      if (workflowDocs.length === 0) return [];

      const ids = workflowDocs.map(w => w.workflow_id);
      const [nodeDocs, edgeDocs] = await Promise.all([
        this.nodesCollection.find({ workflow_ref: { $in: ids } }).toArray(),
        this.edgesCollection.find({ workflow_ref: { $in: ids } }).toArray()
      ]);

      const nodesByWorkflow = new Map<string, NodeDocument[]>();
      for (const n of nodeDocs) {
        const arr = nodesByWorkflow.get(n.workflow_ref) || [];
        arr.push(n);
        nodesByWorkflow.set(n.workflow_ref, arr);
      }
      const edgesByWorkflow = new Map<string, EdgeDocument[]>();
      for (const e of edgeDocs) {
        const arr = edgesByWorkflow.get(e.workflow_ref) || [];
        arr.push(e);
        edgesByWorkflow.set(e.workflow_ref, arr);
      }

      const parsed: ParsedWorkflow[] = workflowDocs.map(wf => {
        const nodeArr = nodesByWorkflow.get(wf.workflow_id) || [];
        const edgeArr = edgesByWorkflow.get(wf.workflow_id) || [];
        const normalized_nodes = nodeArr.map(n => ({
          node_id: n.node_id,
          node_type: n.node_type,
          display_name: n.display_name,
          functional_role: n.functional_role,
          inputs: n.inputs as any,
          outputs: n.outputs as any,
          constraints: n.constraints as any,
          raw_config: n.raw_config,
          position: (n as any).position || [0, 0]
        }));
        const normalized_edges = edgeArr.map(e => ({
          from_node: e.from_node_id,
          to_node: e.to_node_id,
          channel: e.channel,
          condition: e.condition
        }));
        const metadata = {
          total_nodes: normalized_nodes.length,
          total_edges: normalized_edges.length,
          trigger_nodes: normalized_nodes.filter(n => n.functional_role === 'trigger').length,
          connector_nodes: normalized_nodes.filter(n => n.functional_role === 'connector').length,
          transform_nodes: normalized_nodes.filter(n => n.functional_role === 'transform').length,
          crawled_at: new Date(),
          parsed_at: new Date()
        };
        return {
          workflow_id: wf.workflow_id,
          workflow_name: wf.title,
          workflow_url: wf.url,
          raw_template: wf.raw_template,
          normalized_nodes,
          normalized_edges,
          metadata,
          index_meta: (wf as any).index_meta,
          graph: (wf as any).graph
        } as ParsedWorkflow;
      });

      return parsed;
    } catch (error) {
      this.logger.error('Failed to search workflows', error);
      throw error;
    }
  }

  async getWorkflowStats(): Promise<any> {
    try {
      const [totalWorkflows, nodeRoleCounts, totalEdgesAgg] = await Promise.all([
        this.workflowsCollection.estimatedDocumentCount(),
        this.nodesCollection.aggregate([
          { $group: { _id: '$functional_role', count: { $sum: 1 } } }
        ]).toArray(),
        this.edgesCollection.aggregate([{ $count: 'total_edges' }]).toArray()
      ]);

      const roleMap: Record<string, number> = {};
      nodeRoleCounts.forEach((r: any) => { roleMap[r._id] = r.count; });
      const totalNodes = Object.values(roleMap).reduce((a, b) => a + b, 0);
      const totalEdges = totalEdgesAgg[0]?.total_edges || 0;

      return {
        total_workflows: totalWorkflows,
        total_nodes: totalNodes,
        total_edges: totalEdges,
        trigger_nodes: roleMap['trigger'] || 0,
        connector_nodes: roleMap['connector'] || 0,
        transform_nodes: roleMap['transform'] || 0
      };
    } catch (error) {
      this.logger.error('Failed to get workflow stats', error);
      throw error;
    }
  }

  // scrape_runs removed per updated requirements

  async close(): Promise<void> {
    try {
      await this.client.close();
      this.logger.info('MongoDB connection closed');
    } catch (error) {
      this.logger.error('Failed to close MongoDB connection', error);
      throw error;
    }
  }
}
