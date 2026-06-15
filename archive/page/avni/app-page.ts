import { Page } from '@playwright/test';
import { AppSearchPage } from './app-search-page';

export class AppPage {
  readonly registerButton = this.page.getByRole('button', { name: 'Register' });
  readonly homeButton = this.page.getByRole('button', { name: 'Home' });
  readonly accountOfCurrentUserButton = this.page.getByRole('button', { name: 'account of current user' });
  readonly excavatingMachineButton = this.page.getByRole('button', { name: 'Excavating Machine Excavating Machine' });
  readonly farmerButton = this.page.getByRole('button', { name: 'Farmer Farmer' });
  readonly gramPanchayatButton = this.page.getByRole('button', { name: 'Gram panchayat Gram panchayat' });
  readonly workOrderButton = this.page.getByRole('button', { name: 'Work Order Work Order' });
  readonly chatWithAiButton = this.page.getByRole('button', { name: 'Chat with AI' });
  readonly logoLink = this.page.getByRole('link', { name: 'logo' });
  readonly searchLink = this.page.getByRole('link', { name: 'Search' });
  readonly cancelLink = this.page.getByRole('link', { name: 'Cancel' });
  readonly includeVoidedCheckbox = this.page.getByRole('checkbox', { name: 'Include Voided' });
  readonly displayCountCheckbox = this.page.getByRole('checkbox', { name: 'Display Count' });

  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('https://app.avniproject.org/#/app');
  }

  async gotoSearch(): Promise<AppSearchPage> {
    await this.page.getByRole('link', { name: 'Search' }).last().click();
    return new AppSearchPage(this.page);
  }
}
