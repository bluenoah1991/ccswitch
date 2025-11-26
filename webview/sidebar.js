(function () {
    const vscode = acquireVsCodeApi();

    let providers = [];
    let templates = [];
    let activeProviderId = null;
    let skipPermissions = false;
    let editingProvider = null;

    window.addEventListener('load', () => {
        setupEventListeners();
        vscode.postMessage({ command: 'getState' });
    });

    window.addEventListener('message', (event) => {
        const message = event.data;
        switch (message.command) {
            case 'stateData':
                providers = message.providers || [];
                templates = message.templates || [];
                activeProviderId = message.activeProviderId;
                skipPermissions = message.skipPermissions;
                document.getElementById('skip-permissions').checked = skipPermissions;
                renderProviders();
                break;
            case 'providerAdded':
                providers.push(message.provider);
                renderProviders();
                hideModal();
                break;
            case 'providerUpdated':
                const updateIdx = providers.findIndex(p => p.id === message.provider.id);
                if (updateIdx !== -1) providers[updateIdx] = message.provider;
                renderProviders();
                hideModal();
                break;
            case 'providerDeleted':
                providers = providers.filter(p => p.id !== message.providerId);
                if (activeProviderId === message.providerId) activeProviderId = null;
                renderProviders();
                break;
            case 'providerApplied':
                activeProviderId = message.providerId;
                renderProviders();
                break;
            case 'providerCleared':
                activeProviderId = null;
                renderProviders();
                break;
        }
    });

    function setupEventListeners() {
        document.getElementById('skip-permissions').addEventListener('change', (e) => {
            skipPermissions = e.target.checked;
            vscode.postMessage({
                command: 'toggleSkipPermissions',
                skipPermissions: skipPermissions
            });
        });

        document.getElementById('add-provider-btn').addEventListener('click', () => {
            editingProvider = null;
            showAddProviderModal();
        });

        document.getElementById('modal-close').addEventListener('click', hideModal);
        document.getElementById('modal-cancel').addEventListener('click', hideModal);
        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) hideModal();
        });

        document.getElementById('modal-confirm').addEventListener('click', handleModalConfirm);
    }

    function renderProviders() {
        const container = document.getElementById('provider-list');
        container.innerHTML = '';

        if (providers.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = 'No providers yet';
            container.appendChild(empty);
            return;
        }

        providers.forEach(provider => {
            const item = document.createElement('div');
            item.className = 'provider-item' + (provider.id === activeProviderId ? ' active' : '');
            item.dataset.id = provider.id;

            const icon = document.createElement('div');
            icon.className = 'provider-icon';

            const name = document.createElement('span');
            name.className = 'provider-name';
            name.textContent = provider.name;

            const actions = document.createElement('div');
            actions.className = 'provider-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'icon-btn sm';
            editBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showEditProviderModal(provider);
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'icon-btn sm delete';
            deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                vscode.postMessage({
                    command: 'deleteProvider',
                    providerId: provider.id
                });
            });

            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);

            item.appendChild(icon);
            item.appendChild(name);
            item.appendChild(actions);

            item.addEventListener('click', () => {
                if (provider.id === activeProviderId) {
                    vscode.postMessage({
                        command: 'clearProvider',
                        skipPermissions: skipPermissions
                    });
                } else {
                    vscode.postMessage({
                        command: 'applyProvider',
                        providerId: provider.id,
                        skipPermissions: skipPermissions
                    });
                }
            });

            container.appendChild(item);
        });
    }

    function showAddProviderModal() {
        document.getElementById('modal-title').textContent = 'Add Provider';

        const body = document.getElementById('modal-body');
        body.innerHTML = '';

        const templateGroup = document.createElement('div');
        templateGroup.className = 'form-group';

        const templateLabel = document.createElement('label');
        templateLabel.className = 'form-label';
        templateLabel.textContent = 'Template';

        const templateSelect = document.createElement('select');
        templateSelect.className = 'form-select';
        templateSelect.id = 'template-select';

        templates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = template.name;
            templateSelect.appendChild(option);
        });

        templateSelect.addEventListener('change', () => {
            const selectedId = templateSelect.value;
            const template = templates.find(t => t.id === selectedId);
            document.getElementById('provider-name').value = template.name;
            document.getElementById('variables-list').innerHTML = '';
            (template.variables || []).forEach(v => addVariableRow(v));
        });

        templateGroup.appendChild(templateLabel);
        templateGroup.appendChild(templateSelect);
        body.appendChild(templateGroup);

        const nameGroup = document.createElement('div');
        nameGroup.className = 'form-group';

        const nameLabel = document.createElement('label');
        nameLabel.className = 'form-label';
        nameLabel.textContent = 'Name';

        const nameInput = document.createElement('input');
        nameInput.className = 'form-input';
        nameInput.type = 'text';
        nameInput.id = 'provider-name';
        nameInput.placeholder = 'Provider name';

        nameGroup.appendChild(nameLabel);
        nameGroup.appendChild(nameInput);
        body.appendChild(nameGroup);

        const varsLabel = document.createElement('label');
        varsLabel.className = 'form-label';
        varsLabel.textContent = 'Variables';
        body.appendChild(varsLabel);

        const varsList = document.createElement('div');
        varsList.className = 'variables-list';
        varsList.id = 'variables-list';
        body.appendChild(varsList);

        const addVarBtn = document.createElement('button');
        addVarBtn.className = 'add-var-btn';
        addVarBtn.textContent = '+ Add Variable';
        addVarBtn.addEventListener('click', () => addVariableRow());
        body.appendChild(addVarBtn);

        templateSelect.dispatchEvent(new Event('change'));
        showModal();
    }

    function showEditProviderModal(provider) {
        editingProvider = provider;
        document.getElementById('modal-title').textContent = 'Edit Provider';

        const body = document.getElementById('modal-body');
        body.innerHTML = '';

        const nameGroup = document.createElement('div');
        nameGroup.className = 'form-group';

        const nameLabel = document.createElement('label');
        nameLabel.className = 'form-label';
        nameLabel.textContent = 'Name';

        const nameInput = document.createElement('input');
        nameInput.className = 'form-input';
        nameInput.type = 'text';
        nameInput.id = 'provider-name';
        nameInput.value = provider.name;

        nameGroup.appendChild(nameLabel);
        nameGroup.appendChild(nameInput);
        body.appendChild(nameGroup);

        const varsLabel = document.createElement('label');
        varsLabel.className = 'form-label';
        varsLabel.textContent = 'Variables';
        body.appendChild(varsLabel);

        const varsList = document.createElement('div');
        varsList.className = 'variables-list';
        varsList.id = 'variables-list';
        body.appendChild(varsList);

        (provider.variables || []).forEach(v => addVariableRow(v));

        const addVarBtn = document.createElement('button');
        addVarBtn.className = 'add-var-btn';
        addVarBtn.textContent = '+ Add Variable';
        addVarBtn.addEventListener('click', () => addVariableRow());
        body.appendChild(addVarBtn);

        showModal();
    }

    function addVariableRow({ name = '', value = '' } = {}) {
        const container = document.getElementById('variables-list');

        const row = document.createElement('div');
        row.className = 'variable-row';

        const nameInput = document.createElement('input');
        nameInput.className = 'form-input var-name';
        nameInput.type = 'text';
        nameInput.placeholder = 'Name';
        nameInput.value = name;

        const valueInput = document.createElement('input');
        valueInput.className = 'form-input var-value';
        valueInput.type = 'text';
        valueInput.placeholder = 'Value';
        valueInput.value = value;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'icon-btn bordered sm';
        deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
        deleteBtn.addEventListener('click', () => row.remove());

        row.appendChild(nameInput);
        row.appendChild(valueInput);
        row.appendChild(deleteBtn);
        container.appendChild(row);
    }

    function getVariablesFromForm() {
        const rows = document.querySelectorAll('#variables-list .variable-row');
        const variables = [];
        rows.forEach(row => {
            const name = row.querySelector('.var-name').value.trim();
            const value = row.querySelector('.var-value').value.trim();
            if (name) {
                variables.push({ name, value });
            }
        });
        return variables;
    }

    function handleModalConfirm() {
        const name = document.getElementById('provider-name').value.trim();
        if (!name) return;

        const variables = getVariablesFromForm();

        if (editingProvider) {
            vscode.postMessage({
                command: 'updateProvider',
                provider: {
                    id: editingProvider.id,
                    name: name,
                    variables: variables
                }
            });
        } else {
            vscode.postMessage({
                command: 'addProvider',
                provider: {
                    name: name,
                    variables: variables
                }
            });
        }
    }

    function showModal() {
        document.getElementById('modal-overlay').classList.remove('hidden');
    }

    function hideModal() {
        document.getElementById('modal-overlay').classList.add('hidden');
        editingProvider = null;
    }
})();
