# brow-use plugin

## Before any browser automation task

Always read the `apps://current` resource first. It contains the active app's name, URL, and functional description. Use this to:
- Know which URL to navigate to if not already there
- Understand what the app does and how it is structured
- Inform decisions about element identification and workflow steps

If no app is set (resource returns null), ask the user to run `/brow-use:create-app` and `/brow-use:set-current-app` first.

## Browser automation approach

1. Call `get_accessibility_tree` to understand the current page structure and find selectors
2. Use `snapshot` to visually verify state after significant actions (login, navigation, form submit)
3. Use `get_accessibility_tree` again whenever the page changes to get fresh selectors
4. When recording a workflow, always wrap actions with `start_trace` / `stop_trace`
