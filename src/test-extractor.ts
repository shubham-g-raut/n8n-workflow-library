import { N8nWorkflowExtractor } from './workflow-extractor';

async function testWorkflowExtraction() {
  const extractor = new N8nWorkflowExtractor();
  
  try {
    console.log('🚀 Initializing workflow extractor...');
    await extractor.initialize();
    
    const url = 'https://n8n.io/workflows/743-translate-text-from-english-to-german';
    console.log(`🔍 Testing extraction from: ${url}`);
    
    const workflow = await extractor.extractWorkflow(url);
    
    if (workflow) {
      console.log('✅ Successfully extracted workflow!');
      console.log(`   Name: ${workflow.name}`);
      console.log(`   Nodes: ${workflow.nodes.length}`);
      console.log(`   Connections: ${Object.keys(workflow.connections || {}).length}`);
      console.log(`   ID: ${workflow.id}`);
      
      // Show first few nodes
      console.log('\n📋 First few nodes:');
      workflow.nodes.slice(0, 3).forEach((node, index) => {
        console.log(`   ${index + 1}. ${node.name} (${node.type})`);
      });
    } else {
      console.log('❌ Failed to extract workflow');
    }
    
  } catch (error) {
    console.error('💥 Error during extraction:', error);
  } finally {
    await extractor.close();
    console.log('🔒 Extractor closed');
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testWorkflowExtraction().catch(console.error);
}

export { testWorkflowExtraction };
