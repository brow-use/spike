import { Page } from '@playwright/test';

export class AppdesignerTemplatesPage {
  readonly skipToContentButton = this.page.getByRole('button', { name: 'Skip to content' });
  readonly closeMenuButton = this.page.getByRole('button', { name: 'Close menu' });
  readonly homeButton = this.page.getByRole('button', { name: 'Home' });
  readonly refreshButton = this.page.getByRole('button', { name: 'refresh' });
  readonly accountOfCurrentUserButton = this.page.getByRole('button', { name: 'account of current user' });
  readonly viewDetailsButton = this.page.getByRole('button', { name: 'View Details' });
  readonly applyTemplateButton = this.page.getByRole('button', { name: 'Apply Template' });
  readonly chatWithAiButton = this.page.getByRole('button', { name: 'Chat with AI' });
  readonly templatesMenuItem = this.page.getByRole('menuitem', { name: 'Templates' });
  readonly appDesignerMenuItem = this.page.getByRole('menuitem', { name: 'App Designer' });
  readonly subjectTypesMenuItem = this.page.getByRole('menuitem', { name: 'Subject Types' });
  readonly programsMenuItem = this.page.getByRole('menuitem', { name: 'Programs' });
  readonly encounterTypesMenuItem = this.page.getByRole('menuitem', { name: 'Encounter Types' });
  readonly formsMenuItem = this.page.getByRole('menuitem', { name: 'Forms' });
  readonly conceptsMenuItem = this.page.getByRole('menuitem', { name: 'Concepts' });
  readonly myDashboardFiltersMenuItem = this.page.getByRole('menuitem', { name: 'My Dashboard Filters' });
  readonly searchFiltersMenuItem = this.page.getByRole('menuitem', { name: 'Search Filters' });
  readonly bundleMenuItem = this.page.getByRole('menuitem', { name: 'Bundle' });
  readonly checklistMenuItem = this.page.getByRole('menuitem', { name: 'Checklist' });
  readonly worklistUpdationRuleMenuItem = this.page.getByRole('menuitem', { name: 'Worklist Updation Rule' });
  readonly relationshipsMenuItem = this.page.getByRole('menuitem', { name: 'Relationships' });
  readonly relationshipTypesMenuItem = this.page.getByRole('menuitem', { name: 'Relationship Types' });
  readonly videoPlaylistMenuItem = this.page.getByRole('menuitem', { name: 'Video Playlist' });
  readonly reportingViewsMenuItem = this.page.getByRole('menuitem', { name: 'Reporting Views' });
  readonly cardMenuItem = this.page.getByRole('menuitem', { name: 'Card' });
  readonly offlineDashboardMenuItem = this.page.getByRole('menuitem', { name: 'Offline Dashboard' });
  readonly applicationMenuMenuItem = this.page.getByRole('menuitem', { name: 'Application Menu' });
  readonly extensionsMenuItem = this.page.getByRole('menuitem', { name: 'Extensions' });
  readonly ruleFailuresMenuItem = this.page.getByRole('menuitem', { name: 'Rule Failures' });

  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('https://app.avniproject.org/#/appdesigner/templates');
  }
}
