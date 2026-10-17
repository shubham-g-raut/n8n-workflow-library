// MongoDB initialization script
// This script runs when the MongoDB container starts for the first time

db = db.getSiblingDB('n8n-workflows');

// Create collections
db.createCollection('crawl_results');
db.createCollection('workflows');
db.createCollection('nodes');
db.createCollection('edges');

// Create indexes for better performance
// Business/functional indexes
db.workflows.createIndex({ "workflow_id": 1 }, { unique: true });
db.workflows.createIndex({ "url": 1 });
db.workflows.createIndex({ "index_meta.roles": 1 });
db.workflows.createIndex({ "index_meta.modalities": 1 });
db.workflows.createIndex({ "index_meta.has_on_error_route": 1 });
db.workflows.createIndex({ "scrape_ref": 1 });
db.workflows.createIndex({ title: "text", description: "text", tags: "text" });

db.nodes.createIndex({ "workflow_ref": 1 });
db.nodes.createIndex({ "functional_role": 1 });
db.nodes.createIndex({ "node_type": 1 });

db.edges.createIndex({ "workflow_ref": 1 });
db.edges.createIndex({ "from_node_id": 1, "to_node_id": 1 });


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
print('📊 Collections created: workflows, nodes, edges, crawl_results');
print('🔍 Indexes created for optimal search performance');
