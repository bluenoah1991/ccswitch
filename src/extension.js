const vscode = require('vscode');
const { SidebarProvider } = require('./sidebar-provider');

let sidebarProvider = null;

function activate(context) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return;
    }

    const workspaceFolder = workspaceFolders[0].uri.fsPath;

    sidebarProvider = new SidebarProvider(context, workspaceFolder);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('ccswitchPanel', sidebarProvider)
    );
}

function deactivate() { }

module.exports = {
    activate,
    deactivate
};
