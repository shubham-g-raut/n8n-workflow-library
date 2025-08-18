// MongoDB initialization script
// This script runs when the MongoDB container starts for the first time

db = db.getSiblingDB('n8n-workflows');

// Create collections
db.createCollection('parsed_workflows');
db.createCollection('crawl_results');

// Create indexes for better performance
db.parsed_workflows.createIndex({ "workflow_id": 1 }, { unique: true });
db.parsed_workflows.createIndex({ "workflow_name": "text" });
db.parsed_workflows.createIndex({ "normalized_nodes.functional_role": 1 });
db.parsed_workflows.createIndex({ "metadata.crawled_at": 1 });

db.crawl_results.createIndex({ "url": 1 });
db.crawl_results.createIndex({ "timestamp": 1 });
db.crawl_results.createIndex({ "success": 1 });

// Create a user for the application (optional, for production use)
// db.createUser({
//   user: "n8n_crawler",
//   pwd: "your_secure_password",
//   roles: [
//     { role: "readWrite", db: "n8n-workflows" }
//   ]
// });

print('✅ n8n-workflows database initialized successfully');
print('📊 Collections created: parsed_workflows, crawl_results');
print('🔍 Indexes created for optimal search performance');
