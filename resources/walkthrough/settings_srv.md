# Setting up Diplomat

Once you have retrieved Diplomat Server, some settings are required. You need to:

- Set the correct path to the server in  [`diplomat.server.path`](command:workbench.action.openSettings?%22diplomat.server.path%22)
- Set additional arguments if needed in [`diplomat.serverArgs`](command:workbench.action.openSettings?%22diplomat.serverArgs%22)
- Select the TCP mode if needed [`diplomat.server.useTCP`](command:workbench.action.openSettings?%22diplomat.server.useTCP%22)

You may also set a path to the desired location of the workspace description file through [`diplomat.projects.projectFilePath`](command:workbench.action.openSettings?%22diplomat.projects.projectFilePath%22). 

A relative path will be relative to the root of any workspace, making it easy to share a project settings.
If this is left empty, the file will be written in specific VS Code locations, outside the workspace files.
