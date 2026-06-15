import { Page } from '@playwright/test';
import { AdminLanguagePage } from './admin-language-page';

export class TranslationsPage {
  readonly navigateToHomeButton = this.page.getByRole('button', { name: 'Navigate to home' });
  readonly accountOfCurrentUserButton = this.page.getByRole('button', { name: 'account of current user' });
  readonly openButton = this.page.getByRole('button', { name: 'Open' });
  readonly chooseFileButton = this.page.getByRole('button', { name: 'Choose File' });
  readonly uploadButton = this.page.getByRole('button', { name: 'Upload' });
  readonly downloadButton = this.page.getByRole('button', { name: 'Download' });
  readonly chatWithAiButton = this.page.getByRole('button', { name: 'Chat with AI' });
  readonly languageCombobox = this.page.getByRole('combobox', { name: 'Language' });
  readonly platformCombobox = this.page.getByRole('combobox', { name: 'Platform' });
  readonly excludeLocationsCheckbox = this.page.getByRole('checkbox', { name: 'Exclude Locations' });
  readonly languagesLink = this.page.getByRole('link', { name: 'languages' });
  readonly translationManagementLink = this.page.getByRole('link', { name: 'translation management' });

  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('https://app.avniproject.org/#/translations');
  }

  async gotoLanguages(): Promise<AdminLanguagePage> {
    await this.languagesLink.click();
    return new AdminLanguagePage(this.page);
  }
}
