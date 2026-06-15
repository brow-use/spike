import { Page } from '@playwright/test';

export class AppDesignerEncounterTypePage {
  readonly skipToContentButton = this.page.getByRole('button', { name: 'Skip to content' });
  readonly closeMenuButton = this.page.getByRole('button', { name: 'Close menu' });
  readonly homeButton = this.page.getByRole('button', { name: 'Home' });
  readonly refreshButton = this.page.getByRole('button', { name: 'refresh' });
  readonly accountOfCurrentUserButton = this.page.getByRole('button', { name: 'account of current user' });
  readonly showHideColumnsButton = this.page.getByRole('button', { name: 'Show/Hide columns' });
  readonly toggleDensityButton = this.page.getByRole('button', { name: 'Toggle density' });
  readonly toggleFullScreenButton = this.page.getByRole('button', { name: 'Toggle full screen' });
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
  readonly workOrderDailyRecordingMachineLink = this.page.getByRole('link', { name: 'Work order daily Recording - Machine' }).first();
  readonly workOrderDailyRecordingMachineEncounterCancellationLink = this.page.getByRole('link', { name: 'Work order daily Recording - Machine Encounter Cancellation' });
  readonly farmerEndlineLink = this.page.getByRole('link', { name: 'Farmer Endline' }).first();
  readonly farmerEndlineEncounterCancellationLink = this.page.getByRole('link', { name: 'Farmer Endline Encounter Cancellation' });
  readonly farmerInteractionLink = this.page.getByRole('link', { name: 'Farmer Interaction' }).first();
  readonly farmerInteractionEncounterCancellationLink = this.page.getByRole('link', { name: 'Farmer Interaction Encounter Cancellation' });
  readonly siteAuditLink = this.page.getByRole('link', { name: 'Site Audit' }).first();
  readonly siteAuditEncounterCancellationLink = this.page.getByRole('link', { name: 'Site Audit Encounter Cancellation' });
  readonly excavatingMachineEndlineLink = this.page.getByRole('link', { name: 'Excavating Machine Endline' }).first();
  readonly endlineEncounterCancellationLink = this.page.getByRole('link', { name: 'Endline Encounter Cancellation' });
  readonly workOrderEndlineLink = this.page.getByRole('link', { name: 'Work order endline' }).first();
  readonly workOrderEndlineEncounterCancellationLink = this.page.getByRole('link', { name: 'Work order endline Encounter Cancellation' });
  readonly workOrderEndlineExecutiveEngineerLink = this.page.getByRole('link', { name: 'Work Order Endline Executive Engineer' }).first();
  readonly workOrderEndlineExecutiveEngineerFormLink = this.page.getByRole('link', { name: 'Work Order Endline - Executive Engineer' });
  readonly workOrderEndlineExecutiveEngineerEncounterCancellationLink = this.page.getByRole('link', { name: 'Work Order Endline Executive Engineer Encounter Cancellation' });
  readonly workOrderDailyRecordingFarmerLink = this.page.getByRole('link', { name: 'Work order daily Recording - Farmer' }).first();
  readonly workOrderDailyRecordingFarmerEncounterCancellationLink = this.page.getByRole('link', { name: 'Work order daily Recording - Farmer Encounter Cancellation' });
  readonly gramPanchayatInteractionLink = this.page.getByRole('link', { name: 'Gram Panchayat Interaction' }).first();
  readonly gramPanchayatInteractionEncounterLink = this.page.getByRole('link', { name: 'Gram Panchayat Interaction Encounter' }).first();
  readonly gramPanchayatInteractionEncounterCancellationLink = this.page.getByRole('link', { name: 'Gram Panchayat Interaction Encounter Cancellation' });
  readonly gramPanchayatEndlineLink = this.page.getByRole('link', { name: 'Gram Panchayat Endline' }).first();
  readonly gramPanchayatEndlineEncounterLink = this.page.getByRole('link', { name: 'Gram Panchayat Endline Encounter' });
  readonly gramPanchayatEndlineEncounterCancellationLink = this.page.getByRole('link', { name: 'Gram Panchayat Endline Encounter Cancellation' });

  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('https://app.avniproject.org/#/appDesigner/encounterType');
  }
}
