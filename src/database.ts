import { MongoClient, Db, Collection } from 'mongodb';
import { ParsedWorkflow, CrawlResult } from './types';
import winston from 'winston';

export class DatabaseService {
  private client!: MongoClient;
  private db!: Db;
  private parsedWorkflowsCollection!: Collection<ParsedWorkflow>;
  private crawlResultsCollection!: Collection<CrawlResult>;
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
      
      this.parsedWorkflowsCollection = this.db.collection<ParsedWorkflow>('parsed_workflows');
      this.crawlResultsCollection = this.db.collection<CrawlResult>('crawl_results');
      
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
      // Indexes for parsed workflows
      await this.parsedWorkflowsCollection.createIndex({ workflow_id: 1 }, { unique: true });
      await this.parsedWorkflowsCollection.createIndex({ workflow_name: 'text' });
      await this.parsedWorkflowsCollection.createIndex({ 'normalized_nodes.functional_role': 1 });
      await this.parsedWorkflowsCollection.createIndex({ 'metadata.crawled_at': 1 });
      
      // Indexes for crawl results
      await this.crawlResultsCollection.createIndex({ url: 1 });
      await this.crawlResultsCollection.createIndex({ timestamp: 1 });
      await this.crawlResultsCollection.createIndex({ success: 1 });
      
      this.logger.info('Database indexes created successfully');
    } catch (error) {
      this.logger.error('Failed to create indexes', error);
      throw error;
    }
  }

  async saveParsedWorkflow(workflow: ParsedWorkflow): Promise<void> {
    try {
      await this.parsedWorkflowsCollection.updateOne(
        { workflow_id: workflow.workflow_id },
        { $set: workflow },
        { upsert: true }
      );
      this.logger.info(`Saved parsed workflow: ${workflow.workflow_name}`);
    } catch (error) {
      this.logger.error(`Failed to save parsed workflow: ${workflow.workflow_name}`, error);
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
      return await this.parsedWorkflowsCollection.findOne({ workflow_id: workflowId });
    } catch (error) {
      this.logger.error(`Failed to get workflow by ID: ${workflowId}`, error);
      throw error;
    }
  }

  async searchWorkflows(query: string, filters?: any): Promise<ParsedWorkflow[]> {
    try {
      let searchQuery: any = {};
      
      if (query) {
        searchQuery.$text = { $search: query };
      }
      
      if (filters) {
        searchQuery = { ...searchQuery, ...filters };
      }
      
      return await this.parsedWorkflowsCollection
        .find(searchQuery)
        .sort({ 'metadata.crawled_at': -1 })
        .limit(100)
        .toArray();
    } catch (error) {
      this.logger.error('Failed to search workflows', error);
      throw error;
    }
  }

  async getWorkflowStats(): Promise<any> {
    try {
      const stats = await this.parsedWorkflowsCollection.aggregate([
        {
          $group: {
            _id: null,
            total_workflows: { $sum: 1 },
            total_nodes: { $sum: '$metadata.total_nodes' },
            total_edges: { $sum: '$metadata.total_edges' },
            trigger_nodes: { $sum: '$metadata.trigger_nodes' },
            connector_nodes: { $sum: '$metadata.connector_nodes' },
            transform_nodes: { $sum: '$metadata.transform_nodes' }
          }
        }
      ]).toArray();
      
      return stats[0] || {};
    } catch (error) {
      this.logger.error('Failed to get workflow stats', error);
      throw error;
    }
  }

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
