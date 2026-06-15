import { Page } from '@playwright/test';

export class AppSubjectPage {
  readonly registerButton = this.page.getByRole('button', { name: 'Register' });
  readonly homeButton = this.page.getByRole('button', { name: 'Home' });
  readonly accountOfCurrentUserButton = this.page.getByRole('button', { name: 'account of current user' });
  readonly addButton = this.page.getByRole('button', { name: 'add' });
  readonly summaryButton = this.page.getByRole('button', { name: 'Summary' });
  readonly plannedVisitsButton = this.page.getByRole('button', { name: 'Planned Visits' });
  readonly completedVisitsButton = this.page.getByRole('button', { name: 'Completed Visits' });
  readonly expandAllButton = this.page.getByRole('button', { name: 'Expand all' });
  readonly showHideColumnsButton = this.page.getByRole('button', { name: 'Show/Hide columns' });
  readonly toggleDensityButton = this.page.getByRole('button', { name: 'Toggle density' });
  readonly toggleFullScreenButton = this.page.getByRole('button', { name: 'Toggle full screen' });
  readonly chatWithAiButton = this.page.getByRole('button', { name: 'Chat with AI' });
  readonly logoLink = this.page.getByRole('link', { name: 'logo' });
  readonly searchLink = this.page.getByRole('link', { name: 'Search' });
  readonly homeLink = this.page.getByRole('link', { name: 'Home' });
  readonly addLink = this.page.getByRole('link', { name: 'add' });

  constructor(private readonly page: Page) {}

  async expandCompletedVisits(): Promise<void> {
    await this.completedVisitsButton.click();
  }
}
