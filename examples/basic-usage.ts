import { WorkflowOrchestrator } from '../src/orchestrator';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function basicExample() {
  console.log('🚀 n8n Workflow Library Crawler - Basic Usage Example\n');
  
  const orchestrator = new WorkflowOrchestrator();
  
  try {
    // Initialize with MongoDB connection
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/n8n-workflows';
    console.log(`📡 Connecting to MongoDB: ${mongoUri}`);
    
    await orchestrator.initialize(mongoUri);
    console.log('✅ Connected successfully\n');
    
    // Example 1: Health check
    console.log('🔍 Performing health check...');
    const isHealthy = await orchestrator.healthCheck();
    console.log(`Health Status: ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}\n`);
    
    // Example 2: Get current statistics
    console.log('📊 Getting current workflow statistics...');
    const stats = await orchestrator.getWorkflowStats();
    console.log('Current Statistics:');
    console.log(`  Total Workflows: ${stats.total_workflows || 0}`);
    console.log(`  Total Nodes: ${stats.total_nodes || 0}`);
    console.log(`  Total Edges: ${stats.total_edges || 0}`);
    console.log(`  Trigger Nodes: ${stats.trigger_nodes || 0}`);
    console.log(`  Connector Nodes: ${stats.connector_nodes || 0}`);
    console.log(`  Transform Nodes: ${stats.transform_nodes || 0}\n`);
    
    // Example 3: Search for workflows (if any exist)
    if (stats.total_workflows && stats.total_workflows > 0) {
      console.log('🔍 Searching for workflows containing "webhook"...');
      const searchResults = await orchestrator.searchWorkflows('webhook');
      console.log(`Found ${searchResults.length} workflows with "webhook":`);
      
      searchResults.slice(0, 3).forEach((workflow, index) => {
        console.log(`  ${index + 1}. ${workflow.workflow_name} (${workflow.workflow_id})`);
      });
      
      if (searchResults.length > 3) {
        console.log(`  ... and ${searchResults.length - 3} more`);
      }
      console.log('');
    }
    
    // Example 4: Crawl specific workflow (commented out to avoid actual crawling)
    /*
    console.log('🕷️  Crawling specific workflow...');
    const testUrl = 'https://n8n.io/workflows/example';
    await orchestrator.crawlSpecificWorkflows([testUrl], 1);
    console.log('✅ Specific workflow crawl completed\n');
    */
    
    console.log('💡 This example demonstrates the basic functionality.');
    console.log('To run a full crawl, use: npm start crawl');
    console.log('To crawl specific workflows, use: npm start crawl-specific <url1> <url2>');
    console.log('To search workflows, use: npm start search <query>');
    
  } catch (error) {
    console.error('❌ Error in basic example:', error);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up resources...');
    await orchestrator.cleanup();
    console.log('✅ Cleanup completed');
  }
}

// Example 2: Advanced usage with error handling
async function advancedExample() {
  console.log('\n🔧 Advanced Usage Example\n');
  
  const orchestrator = new WorkflowOrchestrator();
  
  try {
    await orchestrator.initialize(process.env.MONGODB_URI || 'mongodb://localhost:27017/n8n-workflows');
    
    // Example: Batch processing with error handling
    console.log('🔄 Processing workflows in batches...');
    
    // This would be useful for processing large numbers of workflows
    const batchSize = 10;
    const maxRetries = 3;
    
    console.log(`Batch Size: ${batchSize}`);
    console.log(`Max Retries: ${maxRetries}`);
    console.log('Note: This is a demonstration of the configuration options.\n');
    
  } catch (error) {
    console.error('❌ Error in advanced example:', error);
  } finally {
    await orchestrator.cleanup();
  }
}

// Run examples
if (require.main === module) {
  basicExample()
    .then(() => advancedExample())
    .catch(console.error);
}

export { basicExample, advancedExample };
