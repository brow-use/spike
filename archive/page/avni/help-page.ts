import { Page } from '@playwright/test';

export class HelpPage {
  readonly navigateToHomeButton = this.page.getByRole('button', { name: 'Navigate to home' });
  readonly accountOfCurrentUserButton = this.page.getByRole('button', { name: 'account of current user' });
  readonly chatWithAiButton = this.page.getByRole('button', { name: 'Chat with AI' });
  readonly selfServiceHelpArticlesLink = this.page.getByRole('link', { name: /Self service help articles/ });
  readonly avniYoutubeChannelLink = this.page.getByRole('link', { name: /Avni youtube channel/ });
  readonly coachingSupportSessionLink = this.page.getByRole('link', { name: /Coaching\/support session/ });
  readonly submitASupportTicketLink = this.page.getByRole('link', { name: /Submit a support ticket/ });
  readonly askTheCommunityLink = this.page.getByRole('link', { name: /Ask the community/ });

  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('https://app.avniproject.org/#/help');
  }
}
