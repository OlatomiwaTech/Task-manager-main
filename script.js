const legacyStorageKey = 'proTasks';
const usersStorageKey = 'daymarkUsers';
const sessionStorageKey = 'daymarkSession';
const themeStorageKey = 'daymarkTheme';
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
let focusTimer = null;
let focusSeconds = 25 * 60;
let focusTaskId = null;

function loadSession() {
    try {
        const session = JSON.parse(localStorage.getItem(sessionStorageKey) || 'null');
        return session && session.email && session.displayName ? session : null;
    } catch {
        return null;
    }
}

function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]').content = isDark ? '#111713' : '#f5f5f0';
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
        const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';
        button.setAttribute('aria-label', label);
        button.title = label;
        button.innerHTML = `<span aria-hidden="true">${isDark ? '☀' : '☾'}</span>`;
    });
    try {
        localStorage.setItem(themeStorageKey, isDark ? 'dark' : 'light');
    } catch {}
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
            dueDate: typeof task.dueDate === 'string' ? task.dueDate : '',
            recurrence: ['daily', 'weekly', 'monthly'].includes(task.recurrence) ? task.recurrence : 'none',
            notes: typeof task.notes === 'string' ? task.notes.slice(0, 1000) : '',
            keywords: Array.isArray(task.keywords) ? [...new Set(task.keywords.map(keyword => String(keyword).trim().replace(/^#+/, '').toLocaleLowerCase()).filter(Boolean))].slice(0, 8) : [],
            subtasks: normalizeSubtasks(task.subtasks)
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
        dueDate: document.getElementById('taskDueDate').value,
        recurrence: document.getElementById('taskRecurrence').value,
        notes: document.getElementById('taskNotes').value.trim().slice(0, 1000),
        keywords: parseKeywords(document.getElementById('taskKeywords').value),
        subtasks: parseSubtasks(document.getElementById('taskSubtasks').value)
    });
    input.value = '';
    document.getElementById('taskDueDate').value = '';
    document.getElementById('taskNotes').value = '';
    document.getElementById('taskSubtasks').value = '';
    document.getElementById('taskKeywords').value = '';
    currentView = 'all';
    currentFilter = 'all';
    render();
    input.focus();
    localStorage.setItem(taskStorageKey(currentUser.email), JSON.stringify(tasks));
}

function parseKeywords(value) {
    return [...new Set(value.split(',').map(keyword => keyword.trim().replace(/^#+/, '').toLocaleLowerCase()).filter(Boolean))].slice(0, 8);
}

function normalizeSubtasks(items) {
    if (!Array.isArray(items)) return [];
    return items.slice(0, 12).map(item => {
        const text = typeof item === 'string' ? item.trim() : String(item?.text || '').trim();
        return { id: item?.id || crypto.randomUUID(), text: text.slice(0, 160), completed: Boolean(item?.completed) };
    }).filter(item => item.text);
}

function parseSubtasks(value, existing = []) {
    const available = [...existing];
    return [...new Set(value.split('\n').map(line => line.trim().slice(0, 160)).filter(Boolean))].slice(0, 12).map(text => {
        const matchIndex = available.findIndex(item => item.text.toLocaleLowerCase() === text.toLocaleLowerCase());
        if (matchIndex < 0) return { id: crypto.randomUUID(), text, completed: false };
        return available.splice(matchIndex, 1)[0];
    });
}

async function generateTaskPlan() {
    const title = document.getElementById('taskInput').value.trim();
    const button = document.getElementById('aiPlanButton');
    const status = document.getElementById('aiPlanStatus');
    if (!title) {
        status.textContent = 'Add a task title first.';
        document.getElementById('taskInput').focus();
        return;
    }

    button.disabled = true;
    button.textContent = 'Planning…';
    status.textContent = 'Creating a useful first draft…';
    try {
        const response = await fetch('/api/ai/plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                notes: document.getElementById('taskNotes').value.trim()
            })
        });
        const responseText = await response.text();
        let result = null;
        if (responseText.trim()) {
            try {
                result = JSON.parse(responseText);
            } catch {
                throw new Error(`Planner returned an unreadable response (HTTP ${response.status}). Restart Daymark and try again.`);
            }
        }
        if (!response.ok) throw new Error(result?.error || `Planner request failed (HTTP ${response.status}).`);
        if (!result || !Array.isArray(result.subtasks)) {
            throw new Error(`Planner returned an empty response (HTTP ${response.status}). Restart Daymark and try again.`);
        }

        const currentSubtasks = parseSubtasks(document.getElementById('taskSubtasks').value);
        const suggestedSubtasks = Array.isArray(result.subtasks) ? result.subtasks : [];
        document.getElementById('taskSubtasks').value = parseSubtasks(
            [...currentSubtasks.map(subtask => subtask.text), ...suggestedSubtasks].join('\n'),
            currentSubtasks
        ).map(subtask => subtask.text).join('\n');

        const currentKeywords = document.getElementById('taskKeywords').value;
        const suggestedKeywords = Array.isArray(result.keywords) ? result.keywords : [];
        document.getElementById('taskKeywords').value = parseKeywords(`${currentKeywords}, ${suggestedKeywords.join(', ')}`).join(', ');
        if (!document.getElementById('taskNotes').value.trim() && typeof result.notes === 'string') {
            document.getElementById('taskNotes').value = result.notes;
        }
        status.textContent = 'Plan drafted. Review it, then adjust anything you like.';
    } catch (error) {
        status.textContent = error instanceof TypeError
            ? 'Could not reach the planner. Start Daymark with npm start and try again.'
            : error.message;
    } finally {
        button.disabled = false;
        button.innerHTML = '<span aria-hidden="true">✦</span> Plan with AI';
    }
}

function showUndo(message, previousTasks) {
    undoSnapshot = previousTasks;
    document.getElementById('toastMessage').textContent = message;
    document.getElementById('undoAction').hidden = !previousTasks;
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
    document.getElementById('editTaskRecurrence').value = task.recurrence;
    document.getElementById('editTaskDueDate').value = task.dueDate;
    document.getElementById('editTaskNotes').value = task.notes;
    document.getElementById('editTaskKeywords').value = task.keywords.join(', ');
    document.getElementById('editTaskSubtasks').value = task.subtasks.map(subtask => subtask.text).join('\n');
    document.getElementById('editDialog').showModal();
    document.getElementById('editTaskName').focus();
}

function nextOccurrence(task) {
    const baseDate = task.dueDate && task.dueDate > todayKey ? task.dueDate : todayKey;
    const nextDate = new Date(`${baseDate}T00:00:00`);
    if (task.recurrence === 'daily') nextDate.setDate(nextDate.getDate() + 1);
    if (task.recurrence === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
    if (task.recurrence === 'monthly') {
        const dayOfMonth = nextDate.getDate();
        nextDate.setDate(1);
        nextDate.setMonth(nextDate.getMonth() + 1);
        const lastDay = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
        nextDate.setDate(Math.min(dayOfMonth, lastDay));
    }
    return [nextDate.getFullYear(), String(nextDate.getMonth() + 1).padStart(2, '0'), String(nextDate.getDate()).padStart(2, '0')].join('-');
}

function toggleTask(id) {
    let nextTask = null;
    tasks = tasks.map(task => {
        if (task.id !== id) return task;
        if (task.completed) return { ...task, completed: false };
        if (task.recurrence !== 'none') {
            nextTask = { ...task, id: crypto.randomUUID(), completed: false, dueDate: nextOccurrence(task) };
        }
        return { ...task, completed: true };
    });
    if (nextTask) tasks.unshift(nextTask);
    saveAndRender();
}

function toggleSubtask(taskId, subtaskId) {
    tasks = tasks.map(task => task.id === taskId ? {
        ...task,
        subtasks: task.subtasks.map(subtask => subtask.id === subtaskId ? { ...subtask, completed: !subtask.completed } : subtask)
    } : task);
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
            (currentView === 'overdue' && !task.completed && task.dueDate && task.dueDate < todayKey) ||
            (currentView === 'upcoming' && !task.completed && task.dueDate > todayKey) ||
            (currentView === 'today' && !task.completed && (!task.dueDate || task.dueDate <= todayKey)) ||
            (currentView.startsWith('category:') && task.category === currentView.slice(9));
        const matchesFilter = currentFilter === 'all' ||
            (currentFilter === 'active' && !task.completed) ||
            (currentFilter === 'completed' && task.completed);
        const checklistText = task.subtasks.map(subtask => subtask.text).join(' ');
        return matchesView && matchesFilter && `${task.text} ${task.notes} ${checklistText} ${task.category} ${task.priority} ${task.keywords.join(' ')}`.toLocaleLowerCase().includes(query);
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
    if (task.notes) {
        const note = document.createElement('div');
        note.className = 'task-note';
        note.textContent = task.notes;
        content.append(name, note);
    }
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
    if (task.recurrence !== 'none') {
        const repeat = document.createElement('span');
        repeat.className = 'recurrence-label';
        repeat.innerHTML = `↻ ${task.recurrence[0].toUpperCase()}${task.recurrence.slice(1)}`;
        meta.append(repeat);
    }
    content.append(meta);
    if (task.keywords.length) {
        const keywordList = document.createElement('div');
        keywordList.className = 'task-keywords';
        task.keywords.forEach(keyword => {
            const chip = document.createElement('span');
            chip.className = 'keyword-chip';
            chip.textContent = `#${keyword}`;
            keywordList.append(chip);
        });
        content.append(keywordList);
    }
    if (task.subtasks.length) {
        const completedSubtasks = task.subtasks.filter(subtask => subtask.completed).length;
        const progress = document.createElement('div');
        progress.className = 'subtask-progress';
        progress.textContent = `${completedSubtasks} of ${task.subtasks.length} steps complete`;
        const checklist = document.createElement('ul');
        checklist.className = 'subtask-list';
        task.subtasks.forEach(subtask => {
            const row = document.createElement('li');
            row.className = `subtask-item${subtask.completed ? ' completed' : ''}`;
            const toggle = document.createElement('button');
            toggle.className = 'subtask-toggle';
            toggle.type = 'button';
            toggle.setAttribute('aria-pressed', String(subtask.completed));
            toggle.setAttribute('aria-label', `${subtask.completed ? 'Mark incomplete' : 'Complete'} step: ${subtask.text}`);
            toggle.textContent = subtask.completed ? '✓' : '';
            toggle.addEventListener('click', () => toggleSubtask(task.id, subtask.id));
            const label = document.createElement('span');
            label.textContent = subtask.text;
            row.append(toggle, label);
            checklist.append(row);
        });
        content.append(progress, checklist);
    }

    const actions = document.createElement('div');
    actions.className = 'task-actions';
    const focus = document.createElement('button');
    focus.className = 'task-action focus';
    focus.type = 'button';
    focus.setAttribute('aria-label', `Start focus session for ${task.text}`);
    focus.title = 'Focus on this task';
    focus.textContent = '▶';
    focus.addEventListener('click', () => openFocusSession(task));
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
    actions.append(focus, edit, remove);
    item.append(complete, content, actions);
    return item;
}

function render() {
    const openTasks = tasks.filter(task => !task.completed);
    const dueToday = openTasks.filter(task => task.dueDate === todayKey);
    const completedCount = tasks.filter(task => task.completed).length;
    const todayTasks = openTasks.filter(task => !task.dueDate || task.dueDate <= todayKey);
    const overdueTasks = openTasks.filter(task => task.dueDate && task.dueDate < todayKey);
    const upcomingTasks = openTasks.filter(task => task.dueDate && task.dueDate > todayKey);
    const todayCompleted = tasks.filter(task => task.completed && task.dueDate === todayKey).length;
    const progressTotal = todayTasks.length + todayCompleted;
    const progress = progressTotal ? Math.round((todayCompleted / progressTotal) * 100) : 0;

    document.getElementById('todayCount').textContent = todayTasks.length;
    document.getElementById('overdueCount').textContent = overdueTasks.length;
    document.getElementById('upcomingCount').textContent = upcomingTasks.length;
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
    const titles = { today: "Today's focus", overdue: 'Overdue tasks', upcoming: 'Coming up', all: 'All tasks', completed: 'Completed tasks' };
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
document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
});
applyTheme(document.documentElement.dataset.theme || localStorage.getItem(themeStorageKey) || 'light');
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
document.getElementById('aiPlanButton').addEventListener('click', generateTaskPlan);
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
        dueDate: document.getElementById('editTaskDueDate').value,
        recurrence: document.getElementById('editTaskRecurrence').value,
        notes: document.getElementById('editTaskNotes').value.trim().slice(0, 1000),
        keywords: parseKeywords(document.getElementById('editTaskKeywords').value),
        subtasks: parseSubtasks(document.getElementById('editTaskSubtasks').value, task.subtasks)
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

function escapeCalendarText(value) {
    return String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/\r\n|\r|\n/g, '\\n')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;');
}

function foldCalendarLine(line) {
    const encoder = new TextEncoder();
    let output = '';
    let lineBytes = 0;
    for (const character of line) {
        const characterBytes = encoder.encode(character).length;
        if (lineBytes + characterBytes > 75) {
            output += '\r\n ';
            lineBytes = 1;
        }
        output += character;
        lineBytes += characterBytes;
    }
    return output;
}

function buildCalendarExport(taskList, createdAt = new Date()) {
    const datedTasks = taskList.filter(task => {
        if (task.completed || !/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate || '')) return false;
        const date = new Date(`${task.dueDate}T00:00:00.000Z`);
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === task.dueDate;
    });
    if (!datedTasks.length) return null;

    const stamp = createdAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Daymark//Task Calendar//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH'
    ];

    datedTasks.forEach(task => {
        const start = new Date(`${task.dueDate}T00:00:00.000Z`);
        const end = new Date(start);
        end.setUTCDate(end.getUTCDate() + 1);
        const endDate = end.toISOString().slice(0, 10).replace(/-/g, '');
        const description = [
            task.notes,
            task.keywords?.length ? `Keywords: ${task.keywords.join(', ')}` : '',
            task.subtasks?.length ? `Checklist:\n${task.subtasks.map(item => `${item.completed ? '[x]' : '[ ]'} ${item.text}`).join('\n')}` : ''
        ].filter(Boolean).join('\n\n');
        lines.push(
            'BEGIN:VEVENT',
            `UID:${escapeCalendarText(task.id)}@daymark.local`,
            `DTSTAMP:${stamp}`,
            `DTSTART;VALUE=DATE:${task.dueDate.replace(/-/g, '')}`,
            `DTEND;VALUE=DATE:${endDate}`,
            `SUMMARY:${escapeCalendarText(task.text)}`,
            `CATEGORIES:${escapeCalendarText(task.category)}`,
            `DESCRIPTION:${escapeCalendarText(description)}`,
            'STATUS:CONFIRMED',
            'TRANSP:TRANSPARENT'
        );
        const frequency = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY' }[task.recurrence];
        if (frequency) lines.push(`RRULE:FREQ=${frequency}`);
        lines.push('END:VEVENT');
    });

    lines.push('END:VCALENDAR');
    return { content: `${lines.map(foldCalendarLine).join('\r\n')}\r\n`, count: datedTasks.length };
}

document.getElementById('exportCalendar').addEventListener('click', () => {
    const calendar = buildCalendarExport(tasks);
    if (!calendar) {
        showUndo('No open tasks with due dates to export.', null);
        return;
    }
    const file = new Blob([calendar.content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `daymark-calendar-${todayKey}.ics`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showUndo(`Exported ${calendar.count} dated task${calendar.count === 1 ? '' : 's'} to calendar.`, null);
});

async function importTasksFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        if (file.size > 2 * 1024 * 1024) throw new Error('The file is larger than 2 MB.');
        const data = JSON.parse(await file.text());
        const rows = Array.isArray(data) ? data : data && Array.isArray(data.tasks) ? data.tasks : [];
        const imported = rows.slice(0, 500).filter(task => task && typeof task.text === 'string' && task.text.trim()).map(task => ({
            id: crypto.randomUUID(),
            text: task.text.trim().slice(0, 160),
            completed: Boolean(task.completed),
            category: categoryColors[task.category] ? task.category : 'Personal',
            priority: priorityColors[task.priority] ? task.priority : 'normal',
            dueDate: typeof task.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate) ? task.dueDate : '',
            recurrence: ['daily', 'weekly', 'monthly'].includes(task.recurrence) ? task.recurrence : 'none',
            notes: typeof task.notes === 'string' ? task.notes.trim().slice(0, 1000) : '',
            keywords: Array.isArray(task.keywords) ? parseKeywords(task.keywords.join(',')) : parseKeywords(typeof task.keywords === 'string' ? task.keywords : ''),
            subtasks: normalizeSubtasks(task.subtasks)
        }));
        if (!imported.length) throw new Error('No valid tasks were found in that file.');
        const previousTasks = [...tasks];
        tasks = [...imported, ...tasks];
        saveAndRender();
        showUndo(`Imported ${imported.length} task${imported.length === 1 ? '' : 's'}`, previousTasks);
    } catch (error) {
        const message = error.message.startsWith('The file') || error.message.startsWith('No valid') ? error.message : 'Could not read that file. Choose a Daymark JSON export.';
        showUndo(message, null);
    } finally {
        event.target.value = '';
    }
}

document.getElementById('importTasksButton').addEventListener('click', () => document.getElementById('importTasksFile').click());
document.getElementById('importTasksFile').addEventListener('change', importTasksFromFile);

function renderFocusClock() {
    const minutes = Math.floor(focusSeconds / 60).toString().padStart(2, '0');
    const seconds = (focusSeconds % 60).toString().padStart(2, '0');
    document.getElementById('focusClock').textContent = `${minutes}:${seconds}`;
}

function openFocusSession(task = null) {
    focusTaskId = task ? task.id : null;
    document.getElementById('focusTaskLabel').textContent = task ? task.text : 'A little focused time goes a long way.';
    document.getElementById('focusStatus').textContent = 'Ready when you are.';
    focusSeconds = 25 * 60;
    renderFocusClock();
    document.getElementById('toggleFocus').textContent = 'Start focus';
    document.getElementById('focusDialog').showModal();
}

function stopFocusSession() {
    clearInterval(focusTimer);
    focusTimer = null;
    document.getElementById('toggleFocus').textContent = 'Start focus';
}

document.getElementById('showFocus').addEventListener('click', () => openFocusSession());
document.getElementById('toggleFocus').addEventListener('click', () => {
    if (focusTimer) {
        stopFocusSession();
        document.getElementById('focusStatus').textContent = 'Session paused.';
        return;
    }
    document.getElementById('focusStatus').textContent = focusTaskId ? 'Stay with this task. You are doing great.' : 'Stay with one thing at a time.';
    document.getElementById('toggleFocus').textContent = 'Pause';
    focusTimer = setInterval(() => {
        focusSeconds = Math.max(0, focusSeconds - 1);
        renderFocusClock();
        if (focusSeconds === 0) {
            stopFocusSession();
            document.getElementById('focusStatus').textContent = 'Session complete. Take a short break.';
        }
    }, 1000);
});
document.getElementById('resetFocus').addEventListener('click', () => {
    stopFocusSession();
    focusSeconds = 25 * 60;
    renderFocusClock();
    document.getElementById('focusStatus').textContent = 'Ready when you are.';
});
document.getElementById('closeFocus').addEventListener('click', () => document.getElementById('focusDialog').close());
document.getElementById('focusDialog').addEventListener('close', stopFocusSession);
document.getElementById('showShortcuts').addEventListener('click', () => document.getElementById('shortcutsDialog').showModal());
document.getElementById('closeShortcuts').addEventListener('click', () => document.getElementById('shortcutsDialog').close());
document.addEventListener('keydown', event => {
    if (document.getElementById('authScreen').hidden === false) return;
    const target = event.target;
    const isTyping = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    if (event.key === 'Escape') {
        if (document.getElementById('shortcutsDialog').open) document.getElementById('shortcutsDialog').close();
        return;
    }
    if (isTyping || document.getElementById('editDialog').open || document.getElementById('shortcutsDialog').open) return;
    if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        document.getElementById('taskInput').focus();
    } else if (event.key === '/') {
        event.preventDefault();
        document.getElementById('searchInput').focus();
    } else if (event.key === '?') {
        document.getElementById('shortcutsDialog').showModal();
    }
});
document.querySelectorAll('.nav-button[data-view]').forEach(button => {
    button.addEventListener('click', () => { currentView = button.dataset.view; currentFilter = 'all'; render(); });
});
document.querySelectorAll('.filter-button').forEach(button => {
    button.addEventListener('click', () => { currentFilter = button.dataset.filter; render(); });
});

if (currentUser) showWorkspace(currentUser);