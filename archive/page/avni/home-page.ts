import { Page } from '@playwright/test';
import { AdminAddressLevelTypePage } from './admin-address-level-type-page';
import { AppdesignerTemplatesPage } from './appdesigner-templates-page';
import { DocumentationPage } from './documentation-page';
import { AssignmentPage } from './assignment-page';
import { BroadcastPage } from './broadcast-page';
import { TranslationsPage } from './translations-page';
import { AppPage } from './app-page';
import { HelpPage } from './help-page';

export class HomePage {
  readonly navigateToHomeButton = this.page.getByRole('button', { name: 'Navigate to home' });
  readonly accountOfCurrentUserButton = this.page.getByRole('button', { name: 'account of current user' });
  readonly chatWithAiButton = this.page.getByRole('button', { name: 'Chat with AI' });
  readonly adminLink = this.page.getByRole('link', { name: 'Admin' });
  readonly createAppLink = this.page.getByRole('link', { name: 'Create App' });
  readonly documentationLink = this.page.getByRole('link', { name: 'Documentation' });
  readonly assignmentLink = this.page.getByRole('link', { name: 'Assignment' });
  readonly broadcastLink = this.page.getByRole('link', { name: 'Broadcast' });
  readonly translationsLink = this.page.getByRole('link', { name: 'Translations' });
  readonly dataEntryAppLink = this.page.getByRole('link', { name: 'Data Entry App' });
  readonly supportAndTrainingLink = this.page.getByRole('link', { name: 'Support And Training' });

  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('https://app.avniproject.org/#/home');
  }

  async gotoAdmin(): Promise<AdminAddressLevelTypePage> {
    await this.adminLink.click();
    return new AdminAddressLevelTypePage(this.page);
  }

  async gotoCreateApp(): Promise<AppdesignerTemplatesPage> {
    await this.createAppLink.click();
    return new AppdesignerTemplatesPage(this.page);
  }

  async gotoDocumentation(): Promise<DocumentationPage> {
    await this.documentationLink.click();
    return new DocumentationPage(this.page);
  }

  async gotoAssignment(): Promise<AssignmentPage> {
    await this.assignmentLink.click();
    return new AssignmentPage(this.page);
  }

  async gotoBroadcast(): Promise<BroadcastPage> {
    await this.broadcastLink.click();
    return new BroadcastPage(this.page);
  }

  async gotoTranslations(): Promise<TranslationsPage> {
    await this.translationsLink.click();
    return new TranslationsPage(this.page);
  }

  async gotoDataEntryApp(): Promise<AppPage> {
    await this.dataEntryAppLink.click();
    return new AppPage(this.page);
  }

  async gotoSupportAndTraining(): Promise<HelpPage> {
    await this.supportAndTrainingLink.click();
    return new HelpPage(this.page);
  }
}
