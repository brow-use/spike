# brow-use plugin

Always read the `apps://current` resource first. It contains the active app's name, URL, and functional description. Use this to:
- Know which URL to navigate to if not already there
- Understand what the app does and how it is structured
- Inform decisions about element identification and workflow steps

If no app is set (resource returns null), ask the user to run `/brow-use:create-app` and `/brow-use:set-current-app` first.