const legacyStorageKey = 'proTasks';
const usersStorageKey = 'daymarkUsers';
const sessionStorageKey = 'daymarkSession';
const categoryColors = {
    Personal: '#d5775f',
    Work: '#63869a',
    Learning: '#bd8b3e',
    Health: '#6c9270'
};
const priorityColors = { high: '#d5775f', normal: '#bd8b3e', low: '#8c9c91' };
const today = new Date();
const todayKey = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
let currentUser = loadSession();
let tasks = currentUser ? loadTasks(currentUser.email) : [];
let currentView = 'today';
let currentFilter = 'all';
let editingTaskId = null;
let undoSnapshot = null;
let toastTimer;

function loadSession() {
    try {
        const session = JSON.parse(localStorage.getItem(sessionStorageKey) || 'null');
        return session && session.email && session.displayName ? session : null;
    } catch {
        return null;
    }
}

function taskStorageKey(email) {
    return `daymarkTasks:${email.toLocaleLowerCase()}`;
}

function loadTasks(email) {
    try {
        const key = taskStorageKey(email);
        let serialized = localStorage.getItem(key);
        if (serialized === null) {
            serialized = localStorage.getItem(legacyStorageKey);
            if (serialized !== null) {
                localStorage.setItem(key, serialized);
                localStorage.removeItem(legacyStorageKey);
            }
        }
        const saved = JSON.parse(serialized || '[]');
        if (!Array.isArray(saved)) return [];
        return saved.map((task, index) => ({
            id: task.id || Date.now() + index,
            text: String(task.text || ''),
            completed: Boolean(task.completed),
            category: categoryColors[task.category] ? task.category : 'Personal',
            priority: priorityColors[task.priority] ? task.priority : 'normal',
            dueDate: typeof task.dueDate === 'string' ? task.dueDate : ''
        })).filter(task => task.text);
    } catch {
        return [];
    }
}

function formatDate(dateString) {
    if (!dateString) return 'No due date';
    const date = new Date(`${dateString}T00:00:00`);
    if (dateString === todayKey) return 'Today';
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = [tomorrow.getFullYear(), String(tomorrow.getMonth() + 1).padStart(2, '0'), String(tomorrow.getDate()).padStart(2, '0')].join('-');
    if (dateString === tomorrowKey) return 'Tomorrow';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function saveAndRender() {
    if (!currentUser) return;
    localStorage.setItem(taskStorageKey(currentUser.email), JSON.stringify(tasks));
    render();
}

function addTask(event) {
    event.preventDefault();
    const input = document.getElementById('taskInput');
    const text = input.value.trim();
    if (!text) return;

    tasks.unshift({
        id: Date.now(),
        text,
        completed: false,
        category: document.getElementById('taskCategory').value,
        priority: document.getElementById('taskPriority').value,
        dueDate: document.getElementById('taskDueDate').value
    });
    input.value = '';
    document.getElementById('taskDueDate').value = '';
    currentView = 'all';
    currentFilter = 'all';
    render();
    input.focus();
    localStorage.setItem(taskStorageKey(currentUser.email), JSON.stringify(tasks));
}

function showUndo(message, previousTasks) {
    undoSnapshot = previousTasks;
    document.getElementById('toastMessage').textContent = message;
    document.getElementById('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        document.getElementById('toast').hidden = true;
        undoSnapshot = null;
    }, 5000);
}

function editTask(id) {
    const task = tasks.find(item => item.id === id);
    if (!task) return;
    editingTaskId = id;
    document.getElementById('editTaskName').value = task.text;
    document.getElementById('editTaskCategory').value = task.category;
    document.getElementById('editTaskPriority').value = task.priority;
    document.getElementById('editTaskDueDate').value = task.dueDate;
    document.getElementById('editDialog').showModal();
    document.getElementById('editTaskName').focus();
}

function toggleTask(id) {
    tasks = tasks.map(task => task.id === id ? { ...task, completed: !task.completed } : task);
    saveAndRender();
}

function deleteTask(id) {
    tasks = tasks.filter(task => task.id !== id);
    saveAndRender();
}

function getVisibleTasks() {
    const query = document.getElementById('searchInput').value.trim().toLocaleLowerCase();
    const visibleTasks = tasks.filter(task => {
        const matchesView = currentView === 'all' ||
            (currentView === 'completed' && task.completed) ||
            (currentView === 'today' && !task.completed && (!task.dueDate || task.dueDate <= todayKey)) ||
            (currentView.startsWith('category:') && task.category === currentView.slice(9));
        const matchesFilter = currentFilter === 'all' ||
            (currentFilter === 'active' && !task.completed) ||
            (currentFilter === 'completed' && task.completed);
        return matchesView && matchesFilter && `${task.text} ${task.category} ${task.priority}`.toLocaleLowerCase().includes(query);
    });
    const sortBy = document.getElementById('sortTasks').value;
    if (sortBy === 'due') return visibleTasks.sort((first, second) => (first.dueDate || '9999-12-31').localeCompare(second.dueDate || '9999-12-31'));
    if (sortBy === 'priority') {
        const weight = { high: 0, normal: 1, low: 2 };
        return visibleTasks.sort((first, second) => weight[first.priority] - weight[second.priority]);
    }
    return visibleTasks;
}

function renderTask(task) {
    const item = document.createElement('li');
    item.className = `task-item${task.completed ? ' completed' : ''}`;

    const complete = document.createElement('button');
    complete.className = 'complete-button';
    complete.type = 'button';
    complete.setAttribute('aria-label', task.completed ? `Mark ${task.text} as active` : `Complete ${task.text}`);
    complete.textContent = task.completed ? '✓' : '';
    complete.addEventListener('click', () => toggleTask(task.id));

    const content = document.createElement('div');
    content.className = 'task-content';
    const name = document.createElement('div');
    name.className = 'task-name';
    name.textContent = task.text;
    const meta = document.createElement('div');
    meta.className = 'task-meta';

    const category = document.createElement('span');
    category.className = 'task-category';
    category.innerHTML = `<span class="category-dot" style="--dot: ${categoryColors[task.category]}"></span>`;
    category.append(document.createTextNode(task.category));
    const due = document.createElement('span');
    due.className = `due-date${!task.completed && task.dueDate && task.dueDate < todayKey ? ' overdue' : ''}`;
    due.textContent = formatDate(task.dueDate);
    const priority = document.createElement('span');
    priority.className = 'priority';
    priority.innerHTML = `<span class="priority-mark" style="--priority-color: ${priorityColors[task.priority]}"></span>${task.priority[0].toUpperCase()}${task.priority.slice(1)} priority`;
    meta.append(category, due, priority);
    content.append(name, meta);

    const actions = document.createElement('div');
    actions.className = 'task-actions';
    const edit = document.createElement('button');
    edit.className = 'task-action';
    edit.type = 'button';
    edit.setAttribute('aria-label', `Edit ${task.text}`);
    edit.title = 'Edit task';
    edit.textContent = '✎';
    edit.addEventListener('click', () => editTask(task.id));
    const remove = document.createElement('button');
    remove.className = 'task-action delete';
    remove.type = 'button';
    remove.setAttribute('aria-label', `Delete ${task.text}`);
    remove.title = 'Delete task';
    remove.textContent = '×';
    remove.addEventListener('click', () => {
        const previousTasks = [...tasks];
        deleteTask(task.id);
        showUndo('Task deleted', previousTasks);
    });
    actions.append(edit, remove);
    item.append(complete, content, actions);
    return item;
}

function render() {
    const openTasks = tasks.filter(task => !task.completed);
    const dueToday = openTasks.filter(task => task.dueDate === todayKey);
    const completedCount = tasks.filter(task => task.completed).length;
    const todayTasks = openTasks.filter(task => !task.dueDate || task.dueDate <= todayKey);
    const todayCompleted = tasks.filter(task => task.completed && task.dueDate === todayKey).length;
    const progressTotal = todayTasks.length + todayCompleted;
    const progress = progressTotal ? Math.round((todayCompleted / progressTotal) * 100) : 0;

    document.getElementById('todayCount').textContent = todayTasks.length;
    document.getElementById('allCount').textContent = openTasks.length;
    document.getElementById('openStat').textContent = openTasks.length;
    document.getElementById('dueStat').textContent = dueToday.length;
    document.getElementById('doneStat').textContent = completedCount;
    document.getElementById('progressPercent').textContent = `${progress}%`;
    document.getElementById('progressRing').style.setProperty('--progress', `${progress}%`);
    document.getElementById('progressTitle').textContent = progressTotal && progress === 100 ? 'Nicely done' : progressTotal ? 'Keep your pace' : 'A fresh start';
    document.getElementById('progressCaption').textContent = progressTotal ? `${todayCompleted} of ${progressTotal} due today complete` : 'No tasks due today';

    const now = new Date();
    const hour = now.getHours();
    const firstName = currentUser.displayName.trim().split(/\s+/)[0];
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    document.getElementById('pageTitle').textContent = `${greeting}, ${firstName}.`;
    document.getElementById('dateLabel').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(now);
    const titles = { today: "Today's focus", all: 'All tasks', completed: 'Completed tasks' };
    document.getElementById('listTitle').textContent = currentView.startsWith('category:') ? currentView.slice(9) : titles[currentView];
    document.getElementById('pageSubtitle').textContent = currentView === 'today' ? 'A clear list makes room for good work.' : 'Everything you need, gathered in one place.';

    document.querySelectorAll('.nav-button[data-view]').forEach(button => {
        const active = button.dataset.view === currentView;
        button.classList.toggle('active', active);
        if (active) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    });
    document.querySelectorAll('.filter-button').forEach(button => {
        const active = button.dataset.filter === currentFilter;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
    });

    const categoryNav = document.getElementById('categoryNav');
    categoryNav.innerHTML = '';
    ['Personal', 'Work', 'Learning', 'Health'].forEach(categoryName => {
        const count = openTasks.filter(task => task.category === categoryName).length;
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.className = `nav-button${currentView === `category:${categoryName}` ? ' active' : ''}`;
        button.type = 'button';
        button.innerHTML = `<span class="category-dot" style="--dot: ${categoryColors[categoryName]}"></span><span class="category-name">${categoryName}</span><span class="nav-count">${count}</span>`;
        button.addEventListener('click', () => { currentView = `category:${categoryName}`; currentFilter = 'all'; render(); });
        item.append(button);
        categoryNav.append(item);
    });

    const list = document.getElementById('taskList');
    list.replaceChildren();
    const visibleTasks = getVisibleTasks();
    if (!visibleTasks.length) {
        const empty = document.createElement('li');
        empty.className = 'empty-state';
        const message = document.getElementById('searchInput').value ? 'No matching tasks' : tasks.length ? 'All clear for now' : 'Your list starts here';
        const detail = document.getElementById('searchInput').value ? 'Try a different search.' : tasks.length ? 'Enjoy the breathing room, or add something new.' : 'Add a task above to plan your first win.';
        empty.innerHTML = `<div class="empty-icon" aria-hidden="true">${tasks.length ? '✓' : '＋'}</div><strong>${message}</strong><span>${detail}</span>`;
        list.append(empty);
    } else {
        visibleTasks.forEach(task => list.append(renderTask(task)));
    }
}

function showWorkspace(user) {
    currentUser = user;
    tasks = loadTasks(user.email);
    document.getElementById('authScreen').hidden = true;
    document.getElementById('workspace').hidden = false;
    document.getElementById('profileLabel').textContent = `${user.displayName}'s workspace`;
    document.getElementById('profileAvatar').textContent = user.displayName.trim().charAt(0).toUpperCase();
    document.getElementById('profileAvatar').setAttribute('aria-label', `${user.displayName} profile`);
    render();
}

function setAuthMode(mode) {
    const isSignup = mode === 'signup';
    document.getElementById('nameField').hidden = !isSignup;
    document.getElementById('usernameInput').required = isSignup;
    document.getElementById('usernameInput').autocomplete = isSignup ? 'name' : 'off';
    document.getElementById('passwordInput').autocomplete = isSignup ? 'new-password' : 'current-password';
    document.getElementById('authTitle').textContent = isSignup ? 'Create your account' : 'Welcome back';
    document.getElementById('authIntro').textContent = isSignup ? 'A few details and your workspace is ready.' : 'Sign in to pick up where you left off.';
    document.getElementById('authSubmit').textContent = isSignup ? 'Create my account' : 'Log in to Daymark';
    document.getElementById('loginMode').classList.toggle('active', !isSignup);
    document.getElementById('loginMode').setAttribute('aria-selected', String(!isSignup));
    document.getElementById('signupMode').classList.toggle('active', isSignup);
    document.getElementById('signupMode').setAttribute('aria-selected', String(isSignup));
    document.getElementById('authMessage').textContent = '';
    document.getElementById('authMessage').classList.remove('success');
}

function setAuthMessage(message, isSuccess = false) {
    const element = document.getElementById('authMessage');
    element.textContent = message;
    element.classList.toggle('success', isSuccess);
}

async function hashPassword(password, salt) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, key, 256);
    return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('');
}

function readUsers() {
    try {
        const users = JSON.parse(localStorage.getItem(usersStorageKey) || '{}');
        return users && typeof users === 'object' && !Array.isArray(users) ? users : {};
    } catch {
        return {};
    }
}

async function authenticate(event) {
    event.preventDefault();
    const mode = document.getElementById('signupMode').classList.contains('active') ? 'signup' : 'login';
    const email = document.getElementById('emailInput').value.trim().toLocaleLowerCase();
    const password = document.getElementById('passwordInput').value;
    const displayName = document.getElementById('usernameInput').value.trim();
    const users = readUsers();

    try {
        if (mode === 'signup') {
            if (!displayName) return setAuthMessage('Enter the name you want us to use.');
            if (users[email]) return setAuthMessage('An account with this email already exists. Log in instead.');
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const passwordHash = await hashPassword(password, salt);
            users[email] = {
                displayName,
                salt: Array.from(salt, byte => byte.toString(16).padStart(2, '0')).join(''),
                passwordHash
            };
            localStorage.setItem(usersStorageKey, JSON.stringify(users));
            currentUser = { email, displayName };
            localStorage.setItem(sessionStorageKey, JSON.stringify(currentUser));
            showWorkspace(currentUser);
            return;
        }

        const account = users[email];
        if (!account) return setAuthMessage('No account found for this email. Create an account to get started.');
        const salt = Uint8Array.from(account.salt.match(/.{2}/g), value => parseInt(value, 16));
        const passwordHash = await hashPassword(password, salt);
        if (passwordHash !== account.passwordHash) return setAuthMessage('That password does not match this account.');
        currentUser = { email, displayName: account.displayName };
        localStorage.setItem(sessionStorageKey, JSON.stringify(currentUser));
        showWorkspace(currentUser);
    } catch {
        setAuthMessage('This browser could not save your account. Check local storage settings and try again.');
    }
}

document.getElementById('loginMode').addEventListener('click', () => setAuthMode('login'));
document.getElementById('signupMode').addEventListener('click', () => setAuthMode('signup'));
document.getElementById('authForm').addEventListener('submit', authenticate);
document.getElementById('googleContinue').addEventListener('click', () => {
    document.getElementById('authFormView').hidden = true;
    document.getElementById('googleView').hidden = false;
});
document.getElementById('backToAuth').addEventListener('click', () => {
    document.getElementById('googleView').hidden = true;
    document.getElementById('authFormView').hidden = false;
});
document.getElementById('signOut').addEventListener('click', () => {
    localStorage.removeItem(sessionStorageKey);
    currentUser = null;
    tasks = [];
    document.getElementById('workspace').hidden = true;
    document.getElementById('authScreen').hidden = false;
    document.getElementById('authForm').reset();
    setAuthMode('login');
});

document.getElementById('taskForm').addEventListener('submit', addTask);
document.getElementById('searchInput').addEventListener('input', render);
document.getElementById('clearCompleted').addEventListener('click', () => {
    const previousTasks = [...tasks];
    const remaining = tasks.filter(task => !task.completed);
    if (remaining.length === tasks.length) return;
    tasks = remaining;
    saveAndRender();
    showUndo('Completed tasks cleared', previousTasks);
});
document.getElementById('undoAction').addEventListener('click', () => {
    if (!undoSnapshot) return;
    tasks = undoSnapshot;
    undoSnapshot = null;
    clearTimeout(toastTimer);
    document.getElementById('toast').hidden = true;
    saveAndRender();
});
document.getElementById('sortTasks').addEventListener('change', render);
document.getElementById('cancelEdit').addEventListener('click', () => document.getElementById('editDialog').close());
document.getElementById('editForm').addEventListener('submit', event => {
    event.preventDefault();
    tasks = tasks.map(task => task.id === editingTaskId ? {
        ...task,
        text: document.getElementById('editTaskName').value.trim(),
        category: document.getElementById('editTaskCategory').value,
        priority: document.getElementById('editTaskPriority').value,
        dueDate: document.getElementById('editTaskDueDate').value
    } : task);
    document.getElementById('editDialog').close();
    saveAndRender();
});
document.getElementById('exportTasks').addEventListener('click', () => {
    const file = new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = `daymark-tasks-${todayKey}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
});
document.querySelectorAll('.nav-button[data-view]').forEach(button => {
    button.addEventListener('click', () => { currentView = button.dataset.view; currentFilter = 'all'; render(); });
});
document.querySelectorAll('.filter-button').forEach(button => {
    button.addEventListener('click', () => { currentFilter = button.dataset.filter; render(); });
});

if (currentUser) showWorkspace(currentUser);