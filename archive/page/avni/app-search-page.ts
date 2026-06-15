import { Page } from '@playwright/test';
import { AppSubjectPage } from './app-subject-page';

export class AppSearchPage {
  readonly registerButton = this.page.getByRole('button', { name: 'Register' });
  readonly homeButton = this.page.getByRole('button', { name: 'Home' });
  readonly accountOfCurrentUserButton = this.page.getByRole('button', { name: 'account of current user' });
  readonly addAlarmButton = this.page.getByRole('button', { name: 'add an alarm' });
  readonly showHideColumnsButton = this.page.getByRole('button', { name: 'Show/Hide columns' });
  readonly toggleDensityButton = this.page.getByRole('button', { name: 'Toggle density' });
  readonly toggleFullScreenButton = this.page.getByRole('button', { name: 'Toggle full screen' });
  readonly chatWithAiButton = this.page.getByRole('button', { name: 'Chat with AI' });
  readonly logoLink = this.page.getByRole('link', { name: 'logo' });
  readonly searchLink = this.page.getByRole('link', { name: 'Search' });

  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('https://app.avniproject.org/#/app/search');
  }

  async gotoSubject(name: string): Promise<AppSubjectPage> {
    await this.page.getByRole('link', { name }).click();
    return new AppSubjectPage(this.page);
  }
}
