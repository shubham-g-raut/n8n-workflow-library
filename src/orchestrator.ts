import { SitemapService } from './sitemap';
import { WorkflowCrawler } from './crawler';
import { WorkflowParser } from './parser';
import { DatabaseService } from './database';
import { CrawlResult, ParsedWorkflow } from './types';
import winston from 'winston';

export class WorkflowOrchestrator {
  private sitemapService: SitemapService;
  private crawler: WorkflowCrawler;
  private parser: WorkflowParser;
  private database: DatabaseService;
  private logger: winston.Logger;

  constructor() {
    this.sitemapService = new SitemapService();
    this.crawler = new WorkflowCrawler();
    this.parser = new WorkflowParser();
    this.database = new DatabaseService();
    
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/orchestrator.log' })
      ]
    });
  }

  async initialize(mongoConnectionString: string): Promise<void> {
    try {
      this.logger.info('Initializing workflow orchestrator...');
      
      // Connect to MongoDB
      await this.database.connect(mongoConnectionString);
      
      // Initialize Playwright browser
      await this.crawler.initialize();
      
      this.logger.info('Workflow orchestrator initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize workflow orchestrator', error);
      throw error;
    }
  }

  async runFullCrawl(concurrency: number = 5): Promise<void> {
    try {
      this.logger.info('Starting full workflow crawl...');
      
      // Step 1: Discover workflow URLs from sitemap
      const workflowUrls = await this.sitemapService.discoverWorkflowUrls();
      this.logger.info(`Discovered ${workflowUrls.length} workflow URLs`);
      
      // Step 2: Validate URLs (optional, can be skipped for faster processing)
      const validUrls = await this.sitemapService.validateWorkflowUrls(workflowUrls);
      this.logger.info(`Validated ${validUrls.length} workflow URLs`);
      
      // Step 3: Crawl workflows
      const crawlResults = await this.crawler.crawlWorkflows(validUrls, concurrency);
      this.logger.info(`Crawled ${crawlResults.length} workflows`);
      
      // Step 4: Save crawl results to database
      for (const result of crawlResults) {
        await this.database.saveCrawlResult(result);
      }
      
      // Step 5: Parse successful workflows
      const successfulCrawls = crawlResults.filter(result => result.success && result.workflow);
      this.logger.info(`Successfully crawled ${successfulCrawls.length} workflows`);
      
      if (successfulCrawls.length > 0) {
        const workflows = successfulCrawls.map(result => result.workflow!);
        const urls = successfulCrawls.map(result => result.url);
        
        const parsedWorkflows = this.parser.parseWorkflows(workflows, urls);
        this.logger.info(`Parsed ${parsedWorkflows.length} workflows`);
        
        // Step 6: Save parsed workflows to database
        for (const parsedWorkflow of parsedWorkflows) {
          await this.database.saveParsedWorkflow(parsedWorkflow);
        }
        
        // Step 7: Generate and log summary
        await this.generateSummary();
      }
      
      this.logger.info('Full workflow crawl completed successfully');
      
    } catch (error) {
      this.logger.error('Full workflow crawl failed', error);
      throw error;
    }
  }

  async crawlSpecificWorkflows(urls: string[], concurrency: number = 5): Promise<void> {
    try {
      this.logger.info(`Starting crawl for ${urls.length} specific workflows...`);
      
      // Crawl specific workflows
      const crawlResults = await this.crawler.crawlWorkflows(urls, concurrency);
      
      // Save crawl results
      for (const result of crawlResults) {
        await this.database.saveCrawlResult(result);
      }
      
      // Parse and save successful workflows
      const successfulCrawls = crawlResults.filter(result => result.success && result.workflow);
      
      if (successfulCrawls.length > 0) {
        const workflows = successfulCrawls.map(result => result.workflow!);
        const workflowUrls = successfulCrawls.map(result => result.url);
        
        const parsedWorkflows = this.parser.parseWorkflows(workflows, workflowUrls);
        
        for (const parsedWorkflow of parsedWorkflows) {
          await this.database.saveParsedWorkflow(parsedWorkflow);
        }
        
        this.logger.info(`Successfully processed ${parsedWorkflows.length} workflows`);
      }
      
    } catch (error) {
      this.logger.error('Specific workflow crawl failed', error);
      throw error;
    }
  }

  async searchWorkflows(query: string, filters?: any): Promise<ParsedWorkflow[]> {
    try {
      return await this.database.searchWorkflows(query, filters);
    } catch (error) {
      this.logger.error('Workflow search failed', error);
      throw error;
    }
  }

  async getWorkflowStats(): Promise<any> {
    try {
      return await this.database.getWorkflowStats();
    } catch (error) {
      this.logger.error('Failed to get workflow stats', error);
      throw error;
    }
  }

  async getWorkflowById(workflowId: string): Promise<ParsedWorkflow | null> {
    try {
      return await this.database.getWorkflowById(workflowId);
    } catch (error) {
      this.logger.error(`Failed to get workflow by ID: ${workflowId}`, error);
      throw error;
    }
  }

  private async generateSummary(): Promise<void> {
    try {
      const stats = await this.database.getWorkflowStats();
      
      this.logger.info('=== CRAWL SUMMARY ===');
      this.logger.info(`Total Workflows: ${stats.total_workflows || 0}`);
      this.logger.info(`Total Nodes: ${stats.total_nodes || 0}`);
      this.logger.info(`Total Edges: ${stats.total_edges || 0}`);
      this.logger.info(`Trigger Nodes: ${stats.trigger_nodes || 0}`);
      this.logger.info(`Connector Nodes: ${stats.connector_nodes || 0}`);
      this.logger.info(`Transform Nodes: ${stats.transform_nodes || 0}`);
      this.logger.info('=====================');
      
    } catch (error) {
      this.logger.error('Failed to generate summary', error);
    }
  }

  async cleanup(): Promise<void> {
    try {
      this.logger.info('Cleaning up resources...');
      
      await this.crawler.close();
      await this.database.close();
      
      this.logger.info('Cleanup completed successfully');
    } catch (error) {
      this.logger.error('Cleanup failed', error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Check if database is accessible
      await this.database.getWorkflowStats();
      
      // Check if crawler is initialized
      // Note: This is a simplified check, in production you might want more comprehensive health checks
      
      return true;
    } catch (error) {
      this.logger.error('Health check failed', error);
      return false;
    }
  }
}
