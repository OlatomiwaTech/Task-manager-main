// --- 1. STATE & STORAGE ---
let tasks = JSON.parse(localStorage.getItem('proTasks')) || [];

// --- 2. CORE FUNCTIONS ---
const addTask = () => {
    const input = document.getElementById('taskInput');
    const val = input.value.trim();

    if (!val) return; // Short-circuit if empty

    const newTask = {
        id: Date.now(),
        text: val
    };

    // UPDATE ORDER: Newest task at the TOP (index 0)
    tasks = [newTask, ...tasks];

    saveAndRender();
    input.value = "";
};

const deleteTask = (id) => {
    // Filter out the deleted task
    tasks = tasks.filter(t => t.id !== id);
    saveAndRender();
};

const saveAndRender = () => {
    localStorage.setItem('proTasks', JSON.stringify(tasks));
    render();
};

// --- 3. UI RENDER ENGINE ---
const render = () => {
    const list = document.getElementById('taskList');
    list.innerHTML = "";

    // Empty Check
    if (tasks.length === 0) {
        list.innerHTML = `<p style="text-align: center; color: #94a3b8;">No tasks yet. Relax! ☕</p>`;
        return;
    }

    // Build the List
    tasks.forEach(task => {
        const li = document.createElement('li');
        
        // Using a template literal for the inner structure
        li.innerHTML = `
            <span>${task.text}</span>
        `;

        const delBtn = document.createElement('button');
        delBtn.innerText = "Delete";
        delBtn.className = "delete-btn";
        delBtn.onclick = () => deleteTask(task.id);

        li.appendChild(delBtn);
        list.appendChild(li);
    });
};

// --- 4. INITIALIZATION ---
document.getElementById('addBtn').addEventListener('click', addTask);

// Let the user press "Enter" to add a task
document.getElementById('taskInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTask();
});

// Run render on load
render();