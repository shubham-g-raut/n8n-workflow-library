import axios from 'axios';
import * as xml2js from 'xml2js';
import { CrawlResult } from './types';
import winston from 'winston';

export class SitemapService {
  private logger: winston.Logger;
  private readonly SITEMAP_URL = 'https://n8n.io/sitemap-workflows.xml';

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
        new winston.transports.File({ filename: 'logs/sitemap.log' })
      ]
    });
  }

  async discoverWorkflowUrls(): Promise<string[]> {
    try {
      this.logger.info('Fetching sitemap from:', this.SITEMAP_URL);
      
      const response = await axios.get(this.SITEMAP_URL, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; n8n-workflow-crawler/1.0)'
        }
      });

      if (response.status !== 200) {
        throw new Error(`Failed to fetch sitemap: ${response.status} ${response.statusText}`);
      }

      const xmlContent = response.data;
      const workflowUrls = await this.parseSitemapXml(xmlContent);
      
      this.logger.info(`Discovered ${workflowUrls.length} workflow URLs from sitemap`);
      return workflowUrls;
      
    } catch (error) {
      this.logger.error('Failed to discover workflow URLs from sitemap', error);
      throw error;
    }
  }

  private async parseSitemapXml(xmlContent: string): Promise<string[]> {
    try {
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(xmlContent);
      
      if (!result.urlset || !result.urlset.url) {
        throw new Error('Invalid sitemap XML structure');
      }

      const urls = Array.isArray(result.urlset.url) ? result.urlset.url : [result.urlset.url];
      const workflowUrls: string[] = [];

      for (const urlEntry of urls) {
        if (urlEntry.loc && typeof urlEntry.loc === 'string') {
          const url = urlEntry.loc.trim();
          
          // Filter for workflow URLs only
          if (this.isWorkflowUrl(url)) {
            workflowUrls.push(url);
          }
        }
      }

      return workflowUrls;
      
    } catch (error) {
      this.logger.error('Failed to parse sitemap XML', error);
      throw error;
    }
  }

  private isWorkflowUrl(url: string): boolean {
    // Check if URL contains /workflows/ pattern
    return url.includes('/workflows/') && !url.includes('#') && !url.includes('?');
  }

  async validateWorkflowUrls(urls: string[]): Promise<string[]> {
    try {
      this.logger.info(`Validating ${urls.length} workflow URLs`);
      
      const validUrls: string[] = [];
      const batchSize = 10; // Process in batches to avoid overwhelming the server
      
      for (let i = 0; i < urls.length; i += batchSize) {
        const batch = urls.slice(i, i + batchSize);
        const batchPromises = batch.map(url => this.validateSingleUrl(url));
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        for (let j = 0; j < batchResults.length; j++) {
          const result = batchResults[j];
          if (result.status === 'fulfilled' && result.value) {
            validUrls.push(batch[j]);
          }
        }
        
        // Add delay between batches to be respectful
        if (i + batchSize < urls.length) {
          await this.delay(1000);
        }
      }
      
      this.logger.info(`Validation complete: ${validUrls.length}/${urls.length} URLs are valid`);
      return validUrls;
      
    } catch (error) {
      this.logger.error('Failed to validate workflow URLs', error);
      throw error;
    }
  }

  private async validateSingleUrl(url: string): Promise<boolean> {
    try {
      const response = await axios.head(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; n8n-workflow-crawler/1.0)'
        }
      });
      
      return response.status === 200;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.debug(`URL validation failed for ${url}: ${errorMessage}`);
      return false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
