# n8n Workflow Library Crawler

A comprehensive crawler and parser for n8n workflows that discovers, extracts, and normalizes workflow data for search and indexing in MongoDB.

## Features

- **Sitemap Discovery**: Automatically discovers all public n8n workflows from the official sitemap
- **Multi-Method Extraction**: Uses Cheerio, Playwright, and script parsing to extract workflow JSON
- **Intelligent Parsing**: Normalizes nodes, edges, and functional requirements
- **MongoDB Storage**: Stores raw templates and normalized data with full-text search capabilities
- **Concurrent Processing**: Configurable concurrency for efficient crawling
- **Comprehensive Logging**: Detailed logging with Winston for debugging and monitoring

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  SitemapService │    │ WorkflowCrawler │    │ WorkflowParser  │
│                 │    │                 │    │                 │
│ • XML Parsing   │───▶│ • HTTP Requests │───▶│ • Node Analysis │
│ • URL Discovery │    │ • DOM Parsing   │    │ • Edge Mapping  │
│ • Validation    │    │ • Playwright    │    │ • Normalization │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │ DatabaseService │    │ ParsedWorkflow  │
                       │                 │    │                 │
                       │ • MongoDB       │◀───│ • Normalized    │
                       │ • Indexing      │    │ • Searchable    │
                       │ • Search        │    │ • Metadata      │
                       └─────────────────┘    └─────────────────┘
```

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd n8n-workflow-library
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Install Playwright browsers**:
   ```bash
   npx playwright install chromium
   ```

4. **Set up MongoDB**:
   - Install MongoDB locally or use MongoDB Atlas
   - Create a database named `n8n-workflows`

5. **Configure environment**:
   ```bash
   cp config.example.env .env
   # Edit .env with your MongoDB connection string
   ```

## Configuration

Create a `.env` file with the following variables:

```env
# Required
MONGODB_URI=mongodb://localhost:27017/n8n-workflows

# Optional
CRAWLER_CONCURRENCY=5
CRAWLER_DELAY_MS=2000
LOG_LEVEL=info
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_TIMEOUT=30000
```

## Usage

### Command Line Interface

The crawler provides a comprehensive CLI for different operations:

```bash
# Crawl all workflows from sitemap
npm start crawl

# Crawl specific workflow URLs
npm start crawl-specific https://n8n.io/workflows/123 https://n8n.io/workflows/456

# Search workflows
npm start search "webhook automation"

# View statistics
npm start stats

# Health check
npm start health
```

### Programmatic Usage

```typescript
import { WorkflowOrchestrator } from './src/orchestrator';

async function main() {
  const orchestrator = new WorkflowOrchestrator();
  
  // Initialize with MongoDB connection
  await orchestrator.initialize('mongodb://localhost:27017/n8n-workflows');
  
  // Run full crawl
  await orchestrator.runFullCrawl(5);
  
  // Search workflows
  const results = await orchestrator.searchWorkflows('slack integration');
  
  // Get statistics
  const stats = await orchestrator.getWorkflowStats();
  
  // Cleanup
  await orchestrator.cleanup();
}

main().catch(console.error);
```

## Data Model

### Raw Workflow Template

Stores the original n8n workflow JSON exactly as extracted:

```typescript
interface N8nWorkflow {
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
```

### Normalized Workflow

Processed and searchable workflow data:

```typescript
interface ParsedWorkflow {
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
}
```

### Node Classification

Nodes are automatically classified into functional roles:

- **Trigger**: Webhooks, schedules, polling (e.g., `n8n-nodes-base.webhook`)
- **Connector**: External system interactions (e.g., `n8n-nodes-base.slack`)
- **Transform**: Data processing (e.g., `n8n-nodes-base.function`)
- **Other**: Unclassified nodes

## Extraction Methods

The crawler uses multiple fallback methods to extract workflow data:

1. **Script Tag Parsing**: Extracts workflow JSON from embedded script tags
2. **Network Request Interception**: Captures API responses (future enhancement)
3. **Playwright Rendering**: Full browser rendering with DOM interaction

## Database Schema

### Collections

- **`workflows`**: Business/functional index with `index_meta` and `graph` plus raw template
- **`nodes`**: Per-node details for each workflow (role, inputs/outputs, constraints)
- **`edges`**: Per-edge connections with channel/condition
- **`crawl_results`**: Raw crawl results and metadata

### Indexes

- `workflows`: unique on `workflow_id`, text on `title/description/tags`, role/modalities/error-route fields
- `nodes`: by `workflow_ref`, `functional_role`, `node_type`
- `edges`: by `workflow_ref` and composite `from_node_id/to_node_id`
- `scrape_runs`: by `started_at` and `status`

## Performance Considerations

- **Concurrency Control**: Default 5 concurrent requests to avoid overwhelming servers
- **Rate Limiting**: Built-in delays between batches
- **Batch Processing**: Processes workflows in configurable batches
- **Connection Pooling**: Efficient MongoDB connection management

## Monitoring and Logging

All operations are logged with Winston:

- **Console Output**: Colored, timestamped logs
- **File Logs**: Separate log files for each service
- **Structured Logging**: JSON format for machine processing
- **Error Tracking**: Comprehensive error logging with stack traces

## Error Handling

- **Graceful Degradation**: Continues processing even if individual workflows fail
- **Retry Logic**: Configurable retry attempts for failed requests
- **Validation**: URL validation before crawling
- **Fallback Methods**: Multiple extraction strategies

## Security Features

- **User-Agent Headers**: Identifiable crawler user agent
- **Rate Limiting**: Respectful crawling with configurable delays
- **Input Validation**: Sanitized input handling
- **Credential Isolation**: Secure credential handling

## Development

### Building

```bash
# TypeScript compilation
npm run build

# Development mode
npm run dev
```

### Testing

```bash
# Run tests
npm test

# Run specific test file
npm test -- --testNamePattern="crawler"
```

### Code Structure

```
src/
├── types.ts           # TypeScript interfaces and types
├── database.ts        # MongoDB service and operations
├── sitemap.ts         # XML sitemap parsing and discovery
├── crawler.ts         # Workflow extraction and crawling
├── parser.ts          # Workflow normalization and analysis
├── orchestrator.ts    # Main coordination service
└── index.ts           # CLI entry point and examples
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:

1. Check the logs in the `logs/` directory
2. Review the error messages in the console
3. Verify MongoDB connection and permissions
4. Check network connectivity to n8n.io

## Roadmap

- [ ] Enhanced network request interception
- [ ] Workflow template versioning
- [ ] Advanced search filters
- [ ] API endpoints for external access
- [ ] Workflow similarity analysis
- [ ] Performance metrics dashboard