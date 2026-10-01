const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

try {
    process.loadEnvFile('.env');
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}

const port = Number(process.env.PORT) || 4173;
const host = '127.0.0.1';
const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const staticFiles = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/index.html', ['index.html', 'text/html; charset=utf-8']],
    ['/script.js', ['script.js', 'text/javascript; charset=utf-8']]
]);

function sendJson(response, statusCode, body) {
    response.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
    });
    response.end(JSON.stringify(body));
}

async function readJson(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > 12_000) throw Object.assign(new Error('Request is too large.'), { statusCode: 413 });
        chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function planTask(request, response) {
    if (!process.env.OPENAI_API_KEY) {
        sendJson(response, 503, { error: 'AI is not configured yet. Add OPENAI_API_KEY to your .env file and restart Daymark.' });
        return;
    }

    let payload;
    try {
        payload = await readJson(request);
    } catch (error) {
        sendJson(response, error.statusCode || 400, { error: error.statusCode ? error.message : 'Send a valid JSON request.' });
        return;
    }

    const title = payload && typeof payload === 'object' && !Array.isArray(payload) && typeof payload.title === 'string'
        ? payload.title.trim().slice(0, 160)
        : '';
    const notes = payload && typeof payload === 'object' && !Array.isArray(payload) && typeof payload.notes === 'string'
        ? payload.notes.trim().slice(0, 1000)
        : '';
    if (!title) {
        sendJson(response, 400, { error: 'Add a task title before asking AI to plan it.' });
        return;
    }

    try {
        const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                response_format: { type: 'json_object' },
                messages: [
                    {
                        role: 'system',
                        content: 'You help people turn a task into a practical, small plan. Return one JSON object with exactly these keys: subtasks (3 to 6 concise strings), keywords (2 to 5 short strings), notes (one concise helpful sentence). Keep every subtask under 120 characters and every keyword under 30 characters. Use the task title and context only. Do not add markdown.'
                    },
                    { role: 'user', content: JSON.stringify({ title, notes }) }
                ],
                max_tokens: 500,
                temperature: 0.4
            })
        });

        if (!upstream.ok) {
            const providerError = await upstream.json().catch(() => ({}));
            const errorCode = providerError.error?.code;
            let message = `AI provider request failed (${upstream.status}). Check your model and API account.`;
            if (upstream.status === 429 && ['insufficient_quota', 'credit_balance_exhausted'].includes(errorCode)) {
                message = 'Your OpenAI API project has no available credits. Add API billing or credits, then try again.';
            } else if (upstream.status === 429) {
                message = 'OpenAI rate limit reached. Wait a moment and try again.';
            } else if (upstream.status === 401) {
                message = 'OpenAI rejected the API key. Check OPENAI_API_KEY in .env and restart Daymark.';
            } else if (upstream.status === 403) {
                message = 'This API key cannot use the selected model. Check your project permissions or change OPENAI_MODEL.';
            }
            sendJson(response, 502, { error: message });
            return;
        }

        const result = await upstream.json();
        const content = result.choices?.[0]?.message?.content;
        if (typeof content !== 'string') throw new Error('AI returned an empty plan.');
        const plan = JSON.parse(content);
        const subtasks = Array.isArray(plan.subtasks) ? plan.subtasks.filter(value => typeof value === 'string').map(value => value.trim().slice(0, 160)).filter(Boolean).slice(0, 8) : [];
        const keywords = Array.isArray(plan.keywords) ? [...new Set(plan.keywords.filter(value => typeof value === 'string').map(value => value.trim().replace(/^#+/, '').toLowerCase()).filter(Boolean))].slice(0, 8) : [];
        const suggestedNotes = typeof plan.notes === 'string' ? plan.notes.trim().slice(0, 1000) : '';
        if (!subtasks.length) throw new Error('AI returned no checklist steps.');
        sendJson(response, 200, { subtasks, keywords, notes: suggestedNotes });
    } catch (error) {
        console.error('AI planning request failed:', error.message);
        sendJson(response, 502, { error: 'Could not create a plan. Check your connection and try again.' });
    }
}

const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, `http://${host}`).pathname;
    if (request.method === 'POST' && pathname === '/api/ai/plan') {
        await planTask(request, response);
        return;
    }

    if (request.method !== 'GET') {
        sendJson(response, 405, { error: 'Method not allowed.' });
        return;
    }

    const file = staticFiles.get(pathname);
    if (!file) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found.');
        return;
    }

    try {
        const contents = await readFile(path.join(__dirname, file[0]));
        response.writeHead(200, {
            'Content-Type': file[1],
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer'
        });
        response.end(contents);
    } catch {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Could not load Daymark.');
    }
});

server.listen(port, host, () => {
    console.log(`Daymark is running at http://${host}:${port}`);
    if (!process.env.OPENAI_API_KEY) console.log('AI planning is disabled until OPENAI_API_KEY is set in .env.');
});
