import { Page } from '@playwright/test';

export class BroadcastNewsPage {
  readonly navigateToHomeButton = this.page.getByRole('button', { name: 'Navigate to home' });
  readonly accountOfCurrentUserButton = this.page.getByRole('button', { name: 'account of current user' });
  readonly chatWithAiButton = this.page.getByRole('button', { name: 'Chat with AI' });
  readonly rowsPerPageCombobox = this.page.getByRole('combobox', { name: 'Rows per page' });

  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('https://app.avniproject.org/#/broadcast/news');
  }
}
