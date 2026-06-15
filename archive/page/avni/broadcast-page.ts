import { Page } from '@playwright/test';
import { BroadcastNewsPage } from './broadcast-news-page';

export class BroadcastPage {
  readonly navigateToHomeButton = this.page.getByRole('button', { name: 'Navigate to home' });
  readonly accountOfCurrentUserButton = this.page.getByRole('button', { name: 'account of current user' });
  readonly chatWithAiButton = this.page.getByRole('button', { name: 'Chat with AI' });
  readonly newsBroadcastsLink = this.page.getByRole('link', { name: 'News Broadcasts' });

  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('https://app.avniproject.org/#/broadcast');
  }

  async gotoNewsBroadcasts(): Promise<BroadcastNewsPage> {
    await this.newsBroadcastsLink.click();
    return new BroadcastNewsPage(this.page);
  }
}
