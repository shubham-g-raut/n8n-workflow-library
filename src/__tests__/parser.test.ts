import { WorkflowParser } from '../parser';
import { N8nWorkflow, N8nNode } from '../types';

describe('WorkflowParser', () => {
  let parser: WorkflowParser;

  beforeEach(() => {
    parser = new WorkflowParser();
  });

  describe('parseWorkflow', () => {
    it('should parse a simple workflow correctly', () => {
      const mockWorkflow: N8nWorkflow = {
        id: 'test-workflow-1',
        name: 'Test Workflow',
        nodes: [
          {
            id: 'node-1',
            name: 'Webhook Trigger',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 1,
            position: [100, 100],
            parameters: {
              httpMethod: 'POST',
              path: 'webhook'
            }
          },
          {
            id: 'node-2',
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 1,
            position: [300, 100],
            parameters: {
              url: 'https://api.example.com/data',
              method: 'GET'
            }
          }
        ],
        connections: {
          'node-1': {
            main: [[{ node: 'node-2', type: 'main', index: 0 }]]
          }
        },
        active: false,
        settings: {},
        versionId: '1.0',
        meta: {},
        tags: ['test', 'webhook'],
        triggerCount: 1,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      const result = parser.parseWorkflow(mockWorkflow, 'https://n8n.io/workflows/test');

      expect(result.workflow_id).toBe('test-workflow-1');
      expect(result.workflow_name).toBe('Test Workflow');
      expect(result.normalized_nodes).toHaveLength(2);
      expect(result.normalized_edges).toHaveLength(1);
      expect(result.metadata.total_nodes).toBe(2);
      expect(result.metadata.total_edges).toBe(1);
    });

    it('should classify trigger nodes correctly', () => {
      const triggerNode: N8nNode = {
        id: 'webhook-node',
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 1,
        position: [100, 100],
        parameters: {}
      };

      const result = parser.parseWorkflow({
        id: 'test',
        name: 'Test',
        nodes: [triggerNode],
        connections: {},
        active: false,
        settings: {},
        versionId: '1.0',
        meta: {},
        tags: [],
        triggerCount: 1,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      }, 'https://test.com');

      expect(result.normalized_nodes[0].functional_role).toBe('trigger');
    });

    it('should classify connector nodes correctly', () => {
      const connectorNode: N8nNode = {
        id: 'http-node',
        name: 'HTTP Request',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 1,
        position: [100, 100],
        parameters: {}
      };

      const result = parser.parseWorkflow({
        id: 'test',
        name: 'Test',
        nodes: [connectorNode],
        connections: {},
        active: false,
        settings: {},
        versionId: '1.0',
        meta: {},
        tags: [],
        triggerCount: 0,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      }, 'https://test.com');

      expect(result.normalized_nodes[0].functional_role).toBe('connector');
    });

    it('should classify transform nodes correctly', () => {
      const transformNode: N8nNode = {
        id: 'function-node',
        name: 'Function',
        type: 'n8n-nodes-base.function',
        typeVersion: 1,
        position: [100, 100],
        parameters: {}
      };

      const result = parser.parseWorkflow({
        id: 'test',
        name: 'Test',
        nodes: [transformNode],
        connections: {},
        active: false,
        settings: {},
        versionId: '1.0',
        meta: {},
        tags: [],
        triggerCount: 0,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      }, 'https://test.com');

      expect(result.normalized_nodes[0].functional_role).toBe('transform');
    });
  });

  describe('parseWorkflows', () => {
    it('should parse multiple workflows correctly', () => {
      const workflows: N8nWorkflow[] = [
        {
          id: 'workflow-1',
          name: 'Workflow 1',
          nodes: [],
          connections: {},
          active: false,
          settings: {},
          versionId: '1.0',
          meta: {},
          tags: [],
          triggerCount: 0,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        },
        {
          id: 'workflow-2',
          name: 'Workflow 2',
          nodes: [],
          connections: {},
          active: false,
          settings: {},
          versionId: '1.0',
          meta: {},
          tags: [],
          triggerCount: 0,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        }
      ];

      const urls = ['https://test1.com', 'https://test2.com'];
      const results = parser.parseWorkflows(workflows, urls);

      expect(results).toHaveLength(2);
      expect(results[0].workflow_id).toBe('workflow-1');
      expect(results[1].workflow_id).toBe('workflow-2');
    });

    it('should throw error for mismatched arrays', () => {
      const workflows: N8nWorkflow[] = [
        {
          id: 'workflow-1',
          name: 'Workflow 1',
          nodes: [],
          connections: {},
          active: false,
          settings: {},
          versionId: '1.0',
          meta: {},
          tags: [],
          triggerCount: 0,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        }
      ];

      const urls = ['https://test1.com', 'https://test2.com'];

      expect(() => {
        parser.parseWorkflows(workflows, urls);
      }).toThrow('Mismatch between workflows and URLs arrays');
    });
  });
});
