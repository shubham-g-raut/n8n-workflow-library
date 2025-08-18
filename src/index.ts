#!/usr/bin/env node

import { WorkflowOrchestrator } from './orchestrator';
import dotenv from 'dotenv';
import winston from 'winston';

// Load environment variables
dotenv.config();

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/main.log' })
  ]
});

// CLI argument parsing
const args = process.argv.slice(2);
const command = args[0];

async function main() {
  try {
    const mongoConnectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/n8n-workflows';
    
    if (!mongoConnectionString) {
      logger.error('MONGODB_URI environment variable is required');
      process.exit(1);
    }

    const orchestrator = new WorkflowOrchestrator();
    
    // Initialize the orchestrator
    await orchestrator.initialize(mongoConnectionString);
    
    // Handle different commands
    switch (command) {
      case 'crawl':
        logger.info('Starting full workflow crawl...');
        await orchestrator.runFullCrawl(5); // 5 concurrent requests
        break;
        
      case 'crawl-specific':
        if (args.length < 2) {
          logger.error('Usage: npm start crawl-specific <url1> [url2] [url3] ...');
          process.exit(1);
        }
        const urls = args.slice(1);
        logger.info(`Starting crawl for ${urls.length} specific workflows...`);
        await orchestrator.crawlSpecificWorkflows(urls, 3);
        break;
        
      case 'search':
        if (args.length < 2) {
          logger.error('Usage: npm start search <query>');
          process.exit(1);
        }
        const query = args[1];
        logger.info(`Searching workflows for: ${query}`);
        const results = await orchestrator.searchWorkflows(query);
        logger.info(`Found ${results.length} workflows`);
        results.forEach((workflow, index) => {
          logger.info(`${index + 1}. ${workflow.workflow_name} (${workflow.workflow_id})`);
        });
        break;
        
      case 'stats':
        logger.info('Getting workflow statistics...');
        const stats = await orchestrator.getWorkflowStats();
        logger.info('=== WORKFLOW STATISTICS ===');
        logger.info(`Total Workflows: ${stats.total_workflows || 0}`);
        logger.info(`Total Nodes: ${stats.total_nodes || 0}`);
        logger.info(`Total Edges: ${stats.total_edges || 0}`);
        logger.info(`Trigger Nodes: ${stats.trigger_nodes || 0}`);
        logger.info(`Connector Nodes: ${stats.connector_nodes || 0}`);
        logger.info(`Transform Nodes: ${stats.transform_nodes || 0}`);
        logger.info('==========================');
        break;
        
      case 'health':
        logger.info('Performing health check...');
        const isHealthy = await orchestrator.healthCheck();
        if (isHealthy) {
          logger.info('✅ System is healthy');
        } else {
          logger.error('❌ System health check failed');
          process.exit(1);
        }
        break;
        
      default:
        logger.info('n8n Workflow Library Crawler');
        logger.info('');
        logger.info('Available commands:');
        logger.info('  crawl              - Crawl all workflows from sitemap');
        logger.info('  crawl-specific     - Crawl specific workflow URLs');
        logger.info('  search <query>     - Search workflows');
        logger.info('  stats              - Show workflow statistics');
        logger.info('  health             - Perform health check');
        logger.info('');
        logger.info('Examples:');
        logger.info('  npm start crawl');
        logger.info('  npm start crawl-specific https://n8n.io/workflows/123');
        logger.info('  npm start search "webhook"');
        logger.info('  npm start stats');
        logger.info('  npm start health');
        break;
    }
    
    // Cleanup
    await orchestrator.cleanup();
    
  } catch (error) {
    logger.error('Application error:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run the main function
if (require.main === module) {
  main().catch((error) => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { main };
