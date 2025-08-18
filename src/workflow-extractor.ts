import { chromium, Browser, Page } from 'playwright';
import { N8nWorkflow } from './types';
import winston from 'winston';

export class N8nWorkflowExtractor {
  private browser: Browser | null = null;
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
        new winston.transports.File({ filename: 'logs/workflow-extractor.log' })
      ]
    });
  }

  async initialize(): Promise<void> {
    try {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      this.logger.info('Browser initialized for workflow extraction');
    } catch (error) {
      this.logger.error('Failed to initialize browser', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.logger.info('Browser closed');
    }
  }

  async extractWorkflow(url: string): Promise<N8nWorkflow | null> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    let page: Page | null = null;
    
    try {
      this.logger.info(`Extracting workflow from: ${url}`);
      
      page = await this.browser.newPage();
      
      // Set user agent and viewport
      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      });
      await page.setViewportSize({ width: 1920, height: 1080 });

      // Navigate to the page
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Method 1: Try to find workflow data in the initial page
      let workflow = await this.extractFromPageContent(page);
      if (workflow) {
        this.logger.info('Found workflow data in initial page content');
        return workflow;
      }

      // Method 2: Click "Use for free" button and look for modal
      workflow = await this.extractFromModal(page);
      if (workflow) {
        this.logger.info('Found workflow data in modal after clicking button');
        return workflow;
      }

      // Method 3: Look for any API endpoints or network requests
      workflow = await this.extractFromNetworkRequests(page);
      if (workflow) {
        this.logger.info('Found workflow data from network requests');
        return workflow;
      }

      // Method 4: Try to find workflow data in iframes
      workflow = await this.extractFromIframes(page);
      if (workflow) {
        this.logger.info('Found workflow data in iframes');
        return workflow;
      }

      this.logger.warn('No workflow data found using any method');
      return null;

    } catch (error) {
      this.logger.error(`Error extracting workflow from ${url}:`, error);
      return null;
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  private async extractFromPageContent(page: Page): Promise<N8nWorkflow | null> {
    try {
      // Look for workflow data in the page content
      const workflowData = await page.evaluate(() => {
        // Prefer Nuxt embedded payload (__NUXT_DATA__)
        const selectors = [
          'script#__NUXT_DATA__',
          'script[type="application/json"]#__NUXT_DATA__',
          'script[data-nuxt-app][id="__NUXT_DATA__"]',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel) as HTMLScriptElement | null;
          if (el && el.textContent && el.textContent.trim().length > 0) {
            try {
              const payload = JSON.parse(el.textContent);
              const findWorkflow = (obj: any, depth = 0): any => {
                if (depth > 6 || !obj || typeof obj !== 'object') return null;
                if (obj.nodes && Array.isArray(obj.nodes) && obj.connections) return obj;
                if (Array.isArray(obj)) {
                  for (const item of obj) {
                    const found = findWorkflow(item, depth + 1);
                    if (found) return found;
                  }
                  return null;
                }
                for (const key of Object.keys(obj)) {
                  const found = findWorkflow(obj[key], depth + 1);
                  if (found) return found;
                }
                return null;
              };
              const found = findWorkflow(payload);
              if (found) return found;
            } catch {}
          }
        }
        
        // Check window object
        const globalVars = ['workflow', 'workflowData', 'template', 'workflowTemplate'];
        for (const varName of globalVars) {
          try {
            const data = (window as any)[varName];
            if (data && typeof data === 'object' && data.nodes && Array.isArray(data.nodes)) {
              return data;
            }
          } catch (e) {}
        }
        
        // Check script tags
        const scripts = document.querySelectorAll('script');
        for (const script of Array.from(scripts)) {
          const content = script.textContent || script.innerHTML;
          if (content) {
            const patterns = [
              /window\.workflow\s*=\s*({[\s\S]*?});/,
              /window\.workflowData\s*=\s*({[\s\S]*?});/,
              /window\.template\s*=\s*({[\s\S]*?});/,
              /export\s+default\s*({[\s\S]*?});/,
              /module\.exports\s*=\s*({[\s\S]*?});/
            ];
            for (const pattern of patterns) {
              const match = content.match(pattern);
              if (match && match[1]) {
                try {
                  const data = JSON.parse(match[1]);
                  if (data.nodes && Array.isArray(data.nodes)) return data;
                } catch {}
              }
            }
          }
        }
        return null;
      });

      if (workflowData) {
        return this.validateWorkflow(workflowData);
      }

      return null;
    } catch (error) {
      this.logger.debug('Error extracting from page content:', error);
      return null;
    }
  }

  private async extractFromModal(page: Page): Promise<N8nWorkflow | null> {
    try {
      // Look for and click the "Use for free" button
      const useForFreeButton = await page.locator('button:has-text("Use for free")').first();
      
      if (await useForFreeButton.isVisible()) {
        this.logger.info('Clicking "Use for free" button');
        await useForFreeButton.click();
        await page.waitForTimeout(5000);

        // Look for workflow data in the modal
        const workflowData = await page.evaluate(() => {
          // Check if any new content appeared with workflow data
          const bodyText = document.body.innerText;
          
          // Look for JSON patterns in the text
          const jsonPattern = /\{[^{}]*"nodes"[^{}]*\}/;
          const match = bodyText.match(jsonPattern);
          
          if (match) {
            try {
              const data = JSON.parse(match[0]);
              if (data.nodes && Array.isArray(data.nodes)) {
                return data;
              }
            } catch (e) {
              // Continue
            }
          }

          // Look for any elements with workflow data
          const elements = document.querySelectorAll('*');
          for (const element of Array.from(elements)) {
            const text = element.textContent;
            if (text && text.includes('"nodes"') && text.includes('"connections"')) {
              try {
                const data = JSON.parse(text);
                if (data.nodes && Array.isArray(data.nodes)) {
                  return data;
                }
              } catch (e) {
                // Continue
              }
            }
          }

          return null;
        });

        if (workflowData) {
          return this.validateWorkflow(workflowData);
        }
      }

      return null;
    } catch (error) {
      this.logger.debug('Error extracting from modal:', error);
      return null;
    }
  }

  private async extractFromNetworkRequests(page: Page): Promise<N8nWorkflow | null> {
    try {
      // This would require intercepting network requests
      // For now, return null and implement later if needed
      return null;
    } catch (error) {
      this.logger.debug('Error extracting from network requests:', error);
      return null;
    }
  }

  private async extractFromIframes(page: Page): Promise<N8nWorkflow | null> {
    try {
      const iframes = await page.locator('iframe').all();
      
      for (const iframe of iframes) {
        try {
          const workflowData = await iframe.evaluate(() => {
            const bodyText = document.body.innerText;
            
            // Look for workflow JSON patterns
            if (bodyText.includes('"nodes"') && bodyText.includes('"connections"')) {
              const jsonPattern = /\{[^{}]*"nodes"[^{}]*\}/;
              const match = bodyText.match(jsonPattern);
              
              if (match) {
                try {
                  const data = JSON.parse(match[0]);
                  if (data.nodes && Array.isArray(data.nodes)) {
                    return data;
                  }
                } catch (e) {
                  // Continue
                }
              }
            }

            return null;
          });

          if (workflowData) {
            return this.validateWorkflow(workflowData);
          }
        } catch (e) {
          // Cannot access iframe content, continue to next
          this.logger.debug('Cannot access iframe content');
        }
      }

      return null;
    } catch (error) {
      this.logger.debug('Error extracting from iframes:', error);
      return null;
    }
  }

  private validateWorkflow(data: any): N8nWorkflow | null {
    try {
      // Basic validation
      if (!data || typeof data !== 'object') {
        return null;
      }

      if (!data.nodes || !Array.isArray(data.nodes) || data.nodes.length === 0) {
        return null;
      }

      // Normalize the workflow structure
      const workflow: N8nWorkflow = {
        id: data.id || data.name || `workflow_${Date.now()}`,
        name: data.name || 'Untitled Workflow',
        nodes: data.nodes,
        connections: data.connections || {},
        active: data.active || false,
        settings: data.settings || {},
        versionId: data.versionId || '1.0',
        meta: data.meta || {},
        tags: data.tags || [],
        triggerCount: data.triggerCount || 0,
        updatedAt: data.updatedAt || new Date().toISOString(),
        createdAt: data.createdAt || new Date().toISOString()
      };

      this.logger.info(`Validated workflow: ${workflow.name} with ${workflow.nodes.length} nodes`);
      return workflow;
    } catch (error) {
      this.logger.debug('Error validating workflow:', error);
      return null;
    }
  }
}
