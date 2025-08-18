import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium, Browser, Page } from 'playwright';
import { N8nWorkflow, CrawlResult } from './types';
import winston from 'winston';

export class WorkflowCrawler {
  private browser: Browser | null = null;
  private logger: winston.Logger;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 2000;

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
        new winston.transports.File({ filename: 'logs/crawler.log' })
      ]
    });
  }

  async initialize(): Promise<void> {
    try {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      this.logger.info('Playwright browser initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Playwright browser', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.logger.info('Playwright browser closed');
    }
  }

  async crawlWorkflow(url: string): Promise<CrawlResult> {
    const result: CrawlResult = {
      url,
      success: false,
      timestamp: new Date()
    };

    try {
      this.logger.info(`Crawling workflow: ${url}`);
      
      // Try different extraction methods in order of preference
      let workflow: N8nWorkflow | undefined;
      
      // Method 0: Public API by slug (most reliable)
      workflow = await this.extractFromPublicApi(url);
      
      // Method 1: Try to extract from embedded script tags
      if (!workflow) {
        workflow = await this.extractFromScriptTags(url);
      }
      
      // Method 2: Use Playwright to render and extract (fallback)
      if (!workflow) {
        workflow = await this.extractWithPlaywright(url);
      }

      if (workflow) {
        result.success = true;
        result.workflow = workflow;
        this.logger.info(`Successfully extracted workflow: ${workflow.name}`);
      } else {
        result.error = 'Failed to extract workflow using all methods';
        this.logger.warn(`Failed to extract workflow from: ${url}`);
      }

    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`Error crawling workflow: ${url}`, error);
    }

    return result;
  }

  private async extractFromScriptTags(url: string): Promise<N8nWorkflow | undefined> {
    try {
      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; n8n-workflow-crawler/1.0)'
        }
      });

      if (response.status !== 200) {
        return undefined;
      }

      const $ = cheerio.load(response.data);
      
      // Try Nuxt data script first: __NUXT_DATA__ embeds the full payload
      try {
        const nuxtCandidates = [
          'script#__NUXT_DATA__',
          'script[type="application/json"]#__NUXT_DATA__',
          'script[data-nuxt-app][id="__NUXT_DATA__"]',
        ];
        for (const sel of nuxtCandidates) {
          const el = $(sel).first();
          if (el && el.length > 0) {
            const raw = el.html() || '';
            if (raw.trim().length > 0) {
              try {
                const nuxtPayload = JSON.parse(raw);
                // Recursively search for a workflow-like object
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
                const found = findWorkflow(nuxtPayload);
                if (found) {
                  this.logger.info('Extracted workflow from __NUXT_DATA__ payload');
                  return this.validateAndNormalizeWorkflow(found);
                }
              } catch (e) {
                this.logger.debug('Failed to parse __NUXT_DATA__ payload');
              }
            }
          }
        }
      } catch {}
      
      // Look for script tags containing workflow data
      const scripts = $('script');
      
      for (const script of scripts) {
        const content = $(script).html();
        if (content) {
          // Try to find workflow JSON in various formats
          const workflow = this.extractWorkflowFromScript(content);
          if (workflow) {
            return workflow;
          }
        }
      }

      // Also look for data attributes that might contain workflow info
      const workflowDataAttr = $('[data-workflow], [data-template]').attr('data-workflow') || 
                               $('[data-workflow], [data-template]').attr('data-template');
      
      if (workflowDataAttr) {
        try {
          const workflowData = JSON.parse(workflowDataAttr);
          return this.validateAndNormalizeWorkflow(workflowData);
        } catch (e) {
          this.logger.debug('Failed to parse workflow data from data attribute');
        }
      }

      return undefined;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.debug(`Script extraction failed for ${url}: ${errorMessage}`);
      return undefined;
    }
  }

  

  private async extractWithPlaywright(url: string): Promise<N8nWorkflow | undefined> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    let page: Page | null = null;
    
    try {
      page = await this.browser.newPage();
      
      // Set user agent and viewport
      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      });
      await page.setViewportSize({ width: 1920, height: 1080 });

      // Navigate to the page
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      
      // Wait for the page to load completely
      await page.waitForTimeout(5000);

      // No need to click UI; the SSR payload contains the data in most cases

      // Try to parse __NUXT_DATA__ from rendered HTML
      const pageSource = await page.content();
      const $ = cheerio.load(pageSource);
      const nuxtEl = $('script#__NUXT_DATA__, script[type="application/json"]#__NUXT_DATA__, script[data-nuxt-app][id="__NUXT_DATA__"]').first();
      if (nuxtEl && nuxtEl.length > 0) {
        try {
          const nuxtPayload = JSON.parse(nuxtEl.html() || '');
          const findWorkflow = (obj: any, depth = 0): any => {
            if (depth > 6 || !obj || typeof obj !== 'object') return null;
            if (obj.nodes && Array.isArray(obj.nodes) && obj.connections) return obj;
            if (Array.isArray(obj)) { for (const item of obj) { const f = findWorkflow(item, depth + 1); if (f) return f; } return null; }
            for (const key of Object.keys(obj)) { const f = findWorkflow((obj as any)[key], depth + 1); if (f) return f; }
            return null;
          };
          const found = findWorkflow(nuxtPayload);
          if (found) return this.validateAndNormalizeWorkflow(found);
        } catch {}
      }

      return undefined;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.debug(`Playwright extraction failed for ${url}: ${errorMessage}`);
      return undefined;
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  private async extractFromPublicApi(url: string): Promise<N8nWorkflow | undefined> {
		try {
			const parsed = new URL(url);
			const parts = parsed.pathname.split('/').filter(Boolean);
			const slug = parts[parts.length - 1];
			if (!slug) return undefined;
			// Try to extract leading numeric id, e.g. 743-foo-bar
			const idMatch = slug.match(/^(\d+)/);
			if (idMatch) {
				const id = idMatch[1];
				try {
					const byIdUrl = `https://api.n8n.io/api/templates/workflows/${id}`;
					const res = await axios.get(byIdUrl, {
						timeout: 20000,
						headers: { 'User-Agent': 'Mozilla/5.0 (compatible; n8n-workflow-crawler/1.0)' }
					});
					const data = res.data;
					const wfObj = data?.workflow?.workflow || data?.workflow || data;
					const candidate = wfObj?.workflow || wfObj?.template || wfObj;
					if (candidate && candidate.nodes && Array.isArray(candidate.nodes)) {
						this.logger.info('Extracted workflow via public API (by id)');
						return this.validateAndNormalizeWorkflow(candidate);
					}
				} catch (e) {
					// fall through to slug variant
				}
			}
			// Fallback: slug query
			const apiUrl = `https://api.n8n.io/api/templates/workflows?slug=${encodeURIComponent(slug)}`;
			const res = await axios.get(apiUrl, {
				timeout: 20000,
				headers: { 'User-Agent': 'Mozilla/5.0 (compatible; n8n-workflow-crawler/1.0)' }
			});
			const data = res.data;
			if (!data) return undefined;
			const wf = (Array.isArray(data.workflows) && data.workflows.length > 0) ? data.workflows[0] : data.workflow || data;
			if (!wf) return undefined;
			const candidate = wf.template || wf.workflow || wf;
			if (candidate && candidate.nodes && Array.isArray(candidate.nodes)) {
				this.logger.info('Extracted workflow via public API (by slug)');
				return this.validateAndNormalizeWorkflow(candidate);
			}
			return undefined;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			this.logger.debug(`Public API extraction failed for ${url}: ${errorMessage}`);
			return undefined;
		}
	}

  private extractWorkflowFromScript(scriptContent: string): N8nWorkflow | undefined {
    try {
      // Look for various patterns of workflow data in script content
      const patterns = [
        /window\.workflow\s*=\s*({[\s\S]*?});/,
        /window\.workflowData\s*=\s*({[\s\S]*?});/,
        /window\.template\s*=\s*({[\s\S]*?});/,
        /window\.workflowTemplate\s*=\s*({[\s\S]*?});/,
        /const\s+workflow\s*=\s*({[\s\S]*?});/,
        /let\s+workflow\s*=\s*({[\s\S]*?});/,
        /var\s+workflow\s*=\s*({[\s\S]*?});/,
        /export\s+default\s*({[\s\S]*?});/,
        /module\.exports\s*=\s*({[\s\S]*?});/
      ];

      for (const pattern of patterns) {
        const match = scriptContent.match(pattern);
        if (match && match[1]) {
          try {
            const workflowData = JSON.parse(match[1]);
            return this.validateAndNormalizeWorkflow(workflowData);
          } catch (e) {
            // Continue to next pattern
          }
        }
      }

      return undefined;
    } catch (error) {
      this.logger.debug('Failed to extract workflow from script content');
      return undefined;
    }
  }

  // Deprecated generic page-content scraping removed

  private validateAndNormalizeWorkflow(data: any): N8nWorkflow | undefined {
    try {
      // Basic validation that this looks like an n8n workflow
      if (!data || typeof data !== 'object') {
        return undefined;
      }

      // Check for required fields
      if (!data.nodes || !Array.isArray(data.nodes) || data.nodes.length === 0) {
        return undefined;
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

      return workflow;
    } catch (error) {
      this.logger.debug('Failed to validate and normalize workflow data');
      return undefined;
    }
  }

  async crawlWorkflows(urls: string[], concurrency: number = 5): Promise<CrawlResult[]> {
    const results: CrawlResult[] = [];
    
    // Process URLs in batches to control concurrency
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchPromises = batch.map(url => this.crawlWorkflow(url));
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          this.logger.error('Batch crawl failed:', result.reason);
        }
      }
      
      // Add delay between batches to be respectful
      if (i + concurrency < urls.length) {
        await this.delay(2000);
      }
    }
    
    return results;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
