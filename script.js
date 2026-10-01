const storageKey = 'proTasks';
const categoryColors = {
    Personal: '#d5775f',
    Work: '#63869a',
    Learning: '#bd8b3e',
    Health: '#6c9270'
};
const priorityColors = { high: '#d5775f', normal: '#bd8b3e', low: '#8c9c91' };
const today = new Date();
const todayKey = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
let tasks = loadTasks();
let currentView = 'today';
let currentFilter = 'all';

function loadTasks() {
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
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
    localStorage.setItem(storageKey, JSON.stringify(tasks));
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
    localStorage.setItem(storageKey, JSON.stringify(tasks));
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
    return tasks.filter(task => {
        const matchesView = currentView === 'all' ||
            (currentView === 'completed' && task.completed) ||
            (currentView === 'today' && !task.completed && (!task.dueDate || task.dueDate <= todayKey)) ||
            (currentView.startsWith('category:') && task.category === currentView.slice(9));
        const matchesFilter = currentFilter === 'all' ||
            (currentFilter === 'active' && !task.completed) ||
            (currentFilter === 'completed' && task.completed);
        return matchesView && matchesFilter && `${task.text} ${task.category} ${task.priority}`.toLocaleLowerCase().includes(query);
    });
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

    const remove = document.createElement('button');
    remove.className = 'delete-button';
    remove.type = 'button';
    remove.setAttribute('aria-label', `Delete ${task.text}`);
    remove.title = 'Delete task';
    remove.textContent = '×';
    remove.addEventListener('click', () => deleteTask(task.id));
    item.append(complete, content, remove);
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
    document.getElementById('pageTitle').textContent = hour < 12 ? 'Good morning.' : hour < 17 ? 'Good afternoon.' : 'Good evening.';
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

document.getElementById('taskForm').addEventListener('submit', addTask);
document.getElementById('searchInput').addEventListener('input', render);
document.getElementById('clearCompleted').addEventListener('click', () => {
    tasks = tasks.filter(task => !task.completed);
    saveAndRender();
});
document.querySelectorAll('.nav-button[data-view]').forEach(button => {
    button.addEventListener('click', () => { currentView = button.dataset.view; currentFilter = 'all'; render(); });
});
document.querySelectorAll('.filter-button').forEach(button => {
    button.addEventListener('click', () => { currentFilter = button.dataset.filter; render(); });
});

render();