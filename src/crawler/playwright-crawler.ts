import { chromium, Browser, Page } from 'playwright';
import { PageObservation, InteractableElement } from '../schema/inferred-flow.js';

export class PlaywrightCrawler {
  private maxPages: number;
  private onBeforeCrawl?: (page: Page) => Promise<void>;

  constructor(options?: { maxPages?: number; onBeforeCrawl?: (page: Page) => Promise<void> }) {
    this.maxPages = options?.maxPages || 15;
    this.onBeforeCrawl = options?.onBeforeCrawl;
  }

  async crawl(startUrl: string): Promise<PageObservation[]> {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const visited = new Set<string>();
    const queue: string[] = [startUrl];
    const observations: PageObservation[] = [];
    const baseOrigin = new URL(startUrl).origin;

    if (this.onBeforeCrawl) {
      await this.onBeforeCrawl(page);
    }

    while (queue.length > 0 && visited.size < this.maxPages) {
      const url = queue.shift();
      if (!url || visited.has(url)) continue;

      visited.add(url);
      console.log(`→ Crawling: ${url}`);

      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(500);

        const observation = await this.observePage(page, url, baseOrigin);
        observations.push(observation);

        const links = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a[href]'))
            .map((a) => (a as HTMLAnchorElement).href)
            .filter((href) => href);
        });

        for (const href of links) {
          const cleanUrl = href.split('#')[0];
          if (
            !visited.has(cleanUrl) &&
            !queue.includes(cleanUrl) &&
            new URL(cleanUrl).origin === baseOrigin
          ) {
            queue.push(cleanUrl);
          }
        }
      } catch (error) {
        console.warn(`⚠ Failed to crawl ${url}: ${error}`);
      }
    }

    await browser.close();
    console.log(`✓ Crawl complete: ${visited.size} pages visited`);
    return observations;
  }

  private async observePage(
    page: Page,
    url: string,
    baseOrigin: string
  ): Promise<PageObservation> {
    const title = await page.title();
    const headings = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('h1, h2, h3, h4'))
        .map((h) => h.textContent || '')
        .filter((text) => text)
        .slice(0, 10);
    });

    const elements = await page.evaluate(() => {
      const elementList: InteractableElement[] = [];
      const selectors = [
        { selector: 'button', type: 'button' as const },
        { selector: 'input', type: 'input' as const },
        { selector: 'a[href]', type: 'link' as const },
        { selector: 'select', type: 'select' as const },
        { selector: 'textarea', type: 'textarea' as const },
      ];

      for (const { selector, type } of selectors) {
        const items = document.querySelectorAll(selector);
        for (let i = 0; i < items.length && elementList.length < 60; i++) {
          const el = items[i];
          const element: InteractableElement = { type };

          if (type === 'button') {
            element.text = el.textContent?.trim() || '';
          } else if (type === 'input') {
            element.placeholder = (el as HTMLInputElement).placeholder || '';
            element.inputType = (el as HTMLInputElement).type || '';
          } else if (type === 'link') {
            element.text = el.textContent?.trim() || '';
            element.href = (el as HTMLAnchorElement).href || '';
          } else if (type === 'select') {
            element.text = el.textContent?.trim() || '';
          } else if (type === 'textarea') {
            element.placeholder = (el as HTMLTextAreaElement).placeholder || '';
          }

          elementList.push(element);
        }
      }

      return elementList.slice(0, 60);
    });

    return {
      url,
      title,
      headings,
      elements,
      observedAt: new Date().toISOString(),
    };
  }
}
