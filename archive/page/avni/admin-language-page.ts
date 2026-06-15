import { Page } from '@playwright/test';

export class AdminLanguagePage {
  readonly skipToContentButton = this.page.getByRole('button', { name: 'Skip to content' });
  readonly closeMenuButton = this.page.getByRole('button', { name: 'Close menu' });
  readonly homeButton = this.page.getByRole('button', { name: 'Home' });
  readonly refreshButton = this.page.getByRole('button', { name: 'refresh' });
  readonly accountOfCurrentUserButton = this.page.getByRole('button', { name: 'account of current user' });
  readonly chatWithAiButton = this.page.getByRole('button', { name: 'Chat with AI' });
  readonly locationTypesMenuItem = this.page.getByRole('menuitem', { name: 'Location Types' });
  readonly locationsMenuItem = this.page.getByRole('menuitem', { name: 'Locations' });
  readonly catchmentsMenuItem = this.page.getByRole('menuitem', { name: 'Catchments' });
  readonly identifierSourceMenuItem = this.page.getByRole('menuitem', { name: 'Identifier Source' });
  readonly identifierUserAssignmentMenuItem = this.page.getByRole('menuitem', { name: 'Identifier User Assignment' });
  readonly languagesMenuItem = this.page.getByRole('menuitem', { name: 'Languages' });
  readonly organisationDetailsMenuItem = this.page.getByRole('menuitem', { name: 'Organisation Details' });

  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('https://app.avniproject.org/#/admin/language');
  }
}
