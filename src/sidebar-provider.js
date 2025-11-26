const vscode = require('vscode');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

class SidebarProvider {
    constructor(context, workspaceFolder) {
        this.context = context;
        this.workspaceFolder = workspaceFolder;
        this.view = null;
        this.defaultsFilePath = path.join(context.extensionPath, 'defaults.json');
        this.providersFilePath = path.join(os.homedir(), '.ccswitch.json');
    }

    async getDefaults() {
        try {
            const data = await fs.readFile(this.defaultsFilePath, 'utf8');
            return JSON.parse(data);
        } catch {
            return { commonVariables: [], templates: [] };
        }
    }

    async getProviders() {
        try {
            const data = await fs.readFile(this.providersFilePath, 'utf8');
            return JSON.parse(data);
        } catch {
            return { providers: [] };
        }
    }

    async setProviders(data) {
        try {
            await fs.writeFile(this.providersFilePath, JSON.stringify(data, null, 2), 'utf8');
        } catch {
            vscode.window.showErrorMessage('Failed to save providers');
        }
    }

    async getWorkspaceSettings() {
        const settingsPath = path.join(this.workspaceFolder, '.vscode', 'settings.json');
        try {
            const data = await fs.readFile(settingsPath, 'utf8');
            return JSON.parse(data);
        } catch {
            return {};
        }
    }

    async applyProvider(provider, skipPermissions, commonVariables) {
        const settingsPath = path.join(this.workspaceFolder, '.vscode', 'settings.json');
        const vscodeDir = path.join(this.workspaceFolder, '.vscode');

        try {
            await fs.mkdir(vscodeDir, { recursive: true });
        } catch { }

        let settings = {};
        try {
            const data = await fs.readFile(settingsPath, 'utf8');
            settings = JSON.parse(data);
        } catch { }

        if (skipPermissions) {
            settings['claudeCode.allowDangerouslySkipPermissions'] = true;
            settings['claudeCode.initialPermissionMode'] = 'bypassPermissions';
        } else {
            delete settings['claudeCode.allowDangerouslySkipPermissions'];
            delete settings['claudeCode.initialPermissionMode'];
        }

        if (provider) {
            const envVars = [
                ...(commonVariables || []),
                ...(provider.variables || [])
            ];
            settings['claudeCode.environmentVariables'] = envVars;
            settings['claudeCode.activeProviderId'] = provider.id;
        } else {
            delete settings['claudeCode.environmentVariables'];
            delete settings['claudeCode.activeProviderId'];
        }

        try {
            await fs.writeFile(settingsPath, JSON.stringify(settings, null, 4), 'utf8');
        } catch {
            vscode.window.showErrorMessage('Failed to save workspace settings');
        }
    }

    getUri(webview, ...segments) {
        return webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, ...segments)));
    }

    async getHtmlContent(webview) {
        const templatePath = path.join(this.context.extensionPath, 'webview/sidebar.html');
        let html = await fs.readFile(templatePath, 'utf8');
        html = html.replace('{{styleUri}}', this.getUri(webview, 'webview', 'sidebar.css'));
        html = html.replace('{{scriptUri}}', this.getUri(webview, 'webview', 'sidebar.js'));
        return html;
    }

    async resolveWebviewView(webviewView) {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.context.extensionPath))
            ]
        };

        webviewView.webview.html = await this.getHtmlContent(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'getState': {
                    const providers = await this.getProviders();
                    const defaults = await this.getDefaults();
                    const settings = await this.getWorkspaceSettings();
                    const skipPermissions = settings['claudeCode.allowDangerouslySkipPermissions'] === true;
                    const activeProviderId = settings['claudeCode.activeProviderId'] || null;
                    webviewView.webview.postMessage({
                        command: 'stateData',
                        providers: providers.providers,
                        activeProviderId: activeProviderId,
                        templates: defaults.templates,
                        commonVariables: defaults.commonVariables,
                        skipPermissions: skipPermissions
                    });
                    break;
                }

                case 'addProvider': {
                    const data = await this.getProviders();
                    const newProvider = {
                        id: Date.now().toString(),
                        name: message.provider.name,
                        variables: message.provider.variables
                    };
                    data.providers.push(newProvider);
                    await this.setProviders(data);
                    webviewView.webview.postMessage({
                        command: 'providerAdded',
                        provider: newProvider
                    });
                    break;
                }

                case 'updateProvider': {
                    const data = await this.getProviders();
                    const idx = data.providers.findIndex(p => p.id === message.provider.id);
                    if (idx !== -1) {
                        data.providers[idx] = message.provider;
                        await this.setProviders(data);
                    }
                    webviewView.webview.postMessage({
                        command: 'providerUpdated',
                        provider: message.provider
                    });
                    break;
                }

                case 'deleteProvider': {
                    const data = await this.getProviders();
                    const settings = await this.getWorkspaceSettings();
                    const wasActive = settings['claudeCode.activeProviderId'] === message.providerId;
                    data.providers = data.providers.filter(p => p.id !== message.providerId);
                    if (wasActive) {
                        const skipPermissions = settings['claudeCode.allowDangerouslySkipPermissions'] === true;
                        await this.applyProvider(null, skipPermissions, null);
                    }
                    await this.setProviders(data);
                    webviewView.webview.postMessage({
                        command: 'providerDeleted',
                        providerId: message.providerId
                    });
                    break;
                }

                case 'applyProvider': {
                    const defaults = await this.getDefaults();
                    const data = await this.getProviders();
                    const provider = data.providers.find(p => p.id === message.providerId);
                    await this.setProviders(data);
                    await this.applyProvider(provider, message.skipPermissions, defaults.commonVariables);
                    webviewView.webview.postMessage({
                        command: 'providerApplied',
                        providerId: message.providerId
                    });
                    break;
                }

                case 'clearProvider': {
                    await this.applyProvider(null, message.skipPermissions, null);
                    webviewView.webview.postMessage({
                        command: 'providerCleared'
                    });
                    break;
                }

                case 'toggleSkipPermissions': {
                    const data = await this.getProviders();
                    const settings = await this.getWorkspaceSettings();
                    const activeProvider = data.providers.find(p => p.id === settings['claudeCode.activeProviderId']);
                    const defaults = activeProvider ? await this.getDefaults() : null;
                    await this.applyProvider(activeProvider, message.skipPermissions, defaults?.commonVariables);
                    webviewView.webview.postMessage({
                        command: 'skipPermissionsUpdated',
                        skipPermissions: message.skipPermissions
                    });
                    break;
                }
            }
        });
    }
}

module.exports = { SidebarProvider };
