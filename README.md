# Daymark

Daymark is a calm, responsive task manager built with vanilla HTML, CSS, and JavaScript. Organize your day by category, priority, and due date, then keep momentum with recurring tasks and a clear progress overview.

## Features

- Create, edit, complete, and delete tasks.
- Draft checklist steps, keywords, and a note for a task with the optional AI planner.
- Add task notes and searchable keywords.
- Break work into checklists, track step completion, and keep progress when editing tasks.
- Organize tasks into Personal, Work, Learning, and Health categories.
- Add searchable keywords, set priorities and due dates, and sort tasks by due date or priority.
- Use dedicated views for today's tasks, overdue tasks, upcoming tasks, and completed work.
- Schedule daily, weekly, or monthly recurring tasks. Completing one creates its next occurrence.
- Start a task-linked 25-minute focus session with pause and reset controls.
- Search and filter tasks, track progress, and undo recent deletions.
- Use keyboard shortcuts: `N` to quick-add, `/` to search, and `?` to open the shortcuts guide.
- Export tasks as JSON.
- Export open, dated tasks as an iCalendar file (`.ics`), including recurring schedules and task context.
- Import JSON task exports into a profile without replacing its existing tasks; imported items can be undone.
- Create browser-local profiles with separate task lists.

## Run locally

Daymark's AI planner uses a small local Node.js server so your API key stays out of browser code. Node.js 20.12 or newer is required.

1. Copy `.env.example` to `.env`.
2. Add your OpenAI API key to `OPENAI_API_KEY` in `.env`. You can optionally change `OPENAI_MODEL` and `PORT`.
3. Start Daymark with `npm start`.
4. Open the local URL printed by the server (by default, `http://127.0.0.1:4173`).

The AI planner sends the current task title and notes to OpenAI only when you click **Plan with AI**. The API key remains on the local server. OpenAI API access also requires available project credits; a valid key alone does not include usage. Do not commit `.env`; it is ignored by Git. Other app features continue to work without an API key.

## Storage and sign-in

Profiles and tasks are stored in the browser's local storage. They do not sync between browsers or devices, and clearing browser data removes them. The local login flow is intended for demonstration and is not a replacement for server-backed authentication. Google sign-in is not connected; enabling it requires OAuth credentials and a provider integration.

## Built with

- HTML
- CSS
- Vanilla JavaScript
- Browser local storage and Web Crypto APIs

## GitHub topics

`task-manager` `productivity` `todo-app` `vanilla-javascript` `javascript` `html` `css` `localstorage` `recurring-tasks` `responsive-design` `frontend` `web-app`


This is my journey as a Programmer. April 15, 2025
