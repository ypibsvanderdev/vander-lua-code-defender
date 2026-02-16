import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'vanderhub_db.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve the built frontend (for production)
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
}

// INITIAL DATABASE
const DEFAULT_DB = {
    users: [],
    repos: [],
    keys: [],
    notifications: 0
};

if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2));
}

const getDB = () => JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
const saveDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

// --- ROUTES ---

// Authentication
app.post('/api/signup', (req, res) => {
    const { username, password } = req.body;
    const db = getDB();
    if (db.users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Username already exists' });
    }
    const newUser = { username, password, id: 'u' + Math.random().toString(36).substr(2, 9) };
    db.users.push(newUser);
    saveDB(db);
    res.json({ success: true, user: { username: newUser.username } });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const db = getDB();
    const user = db.users.find(u => u.username === username && u.password === password);
    if (user) {
        res.json({ success: true, user: { username: user.username } });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Key Verification
app.post('/api/verify-key', (req, res) => {
    const { key, hwid } = req.body;
    const db = getDB();
    if (!db.keys) db.keys = [];
    const keyData = db.keys.find(k => k.id === key);

    if (keyData && !keyData.used) {
        keyData.used = true;
        keyData.hwid = hwid;

        // Handle Trial Keys
        if (keyData.type === 'trial') {
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + 30);
            keyData.expiresAt = expiry.toISOString();
        }

        saveDB(db);
        res.json({ success: true, expiresAt: keyData.expiresAt });
    } else {
        res.status(401).json({ error: 'Invalid or already used key' });
    }
});

// Get user specific repos
app.get('/api/repos', (req, res) => {
    const { username } = req.query;
    const db = getDB();
    if (username === 'yahia') {
        // Yahia sees everything
        return res.json(db.repos);
    }
    // Users only see repos they own
    res.json(db.repos.filter(r => r.owner === username));
});

// Delete repo
app.delete('/api/repos/:id', (req, res) => {
    const db = getDB();
    const repoIndex = db.repos.findIndex(r => r.id === req.params.id);
    if (repoIndex !== -1) {
        db.repos.splice(repoIndex, 1);
        saveDB(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Repo not found' });
    }
});

// Create new repo
app.post('/api/repos', (req, res) => {
    const { name, desc, status, owner } = req.body;
    const db = getDB();
    const newRepo = {
        id: 'r' + Math.random().toString(36).substr(2, 9),
        name: name || 'new-repo',
        owner: owner || 'System',
        status: status || 'Private',
        lang: 'Plain Text',
        stars: 0,
        forks: 0,
        desc: desc || 'Repository created with VanderHub',
        files: [{ name: 'README.md', content: `# ${name}\n\n${desc}`, type: 'file' }],
        issues: [],
        commits: [{ hash: Math.random().toString(16).substr(2, 7), msg: 'Initial commit', user: owner || 'System', time: 'Just now' }]
    };
    db.repos.push(newRepo);
    saveDB(db);
    res.json(newRepo);
});

// Add Issue
app.post('/api/repos/:id/issues', (req, res) => {
    const { author } = req.body;
    const db = getDB();
    const repo = db.repos.find(r => r.id === req.params.id);
    if (repo) {
        const newIssue = {
            id: repo.issues.length + 1,
            title: req.body.title,
            status: 'Open',
            author: author || 'System',
            time: 'Just now'
        };
        repo.issues.push(newIssue);
        saveDB(db);
        res.json(newIssue);
    } else {
        res.status(404).json({ error: 'Repo not found' });
    }
});

// Star Repo
app.post('/api/repos/:id/star', (req, res) => {
    const db = getDB();
    const repo = db.repos.find(r => r.id === req.params.id);
    if (repo) {
        repo.stars += 1;
        saveDB(db);
        res.json(repo);
    }
});

// Add File to Repo
app.post('/api/repos/:id/files', (req, res) => {
    const db = getDB();
    const repo = db.repos.find(r => r.id === req.params.id);
    if (!repo) return res.status(404).json({ error: 'Repo not found' });

    const { name, content } = req.body;
    if (!name) return res.status(400).json({ error: 'File name required' });

    // Check for duplicate
    if (repo.files.find(f => f.name === name)) {
        return res.status(409).json({ error: 'File already exists' });
    }

    const newFile = { name, content: content || '', type: 'file' };
    repo.files.push(newFile);

    // Auto-detect language from extension
    const ext = name.split('.').pop().toLowerCase();
    const langMap = { lua: 'Lua', js: 'JavaScript', jsx: 'React', py: 'Python', ts: 'TypeScript', css: 'CSS', html: 'HTML', json: 'JSON', md: 'Markdown' };
    if (langMap[ext] && repo.lang === 'Plain Text') repo.lang = langMap[ext];

    // Add a commit entry
    repo.commits.unshift({
        hash: Math.random().toString(16).substr(2, 7),
        msg: `Add ${name}`,
        user: req.body.username || 'System',
        time: 'Just now'
    });

    saveDB(db);
    res.json(newFile);
});

// Get single file content
app.get('/api/repos/:id/files/:filename', (req, res) => {
    const db = getDB();
    const repo = db.repos.find(r => r.id === req.params.id);
    if (!repo) return res.status(404).json({ error: 'Repo not found' });

    const file = repo.files.find(f => f.name === req.params.filename);
    if (!file) return res.status(404).json({ error: 'File not found' });

    res.json(file);
});

// Edit/Update file content
app.put('/api/repos/:id/files/:filename', (req, res) => {
    const db = getDB();
    const repo = db.repos.find(r => r.id === req.params.id);
    if (!repo) return res.status(404).json({ error: 'Repo not found' });

    const file = repo.files.find(f => f.name === req.params.filename);
    if (!file) return res.status(404).json({ error: 'File not found' });

    file.content = req.body.content;

    repo.commits.unshift({
        hash: Math.random().toString(16).substr(2, 7),
        msg: req.body.commitMsg || `Update ${file.name}`,
        user: req.body.username || 'System',
        time: 'Just now'
    });

    saveDB(db);
    res.json(file);
});

// Delete file
app.delete('/api/repos/:id/files/:filename', (req, res) => {
    const db = getDB();
    const repo = db.repos.find(r => r.id === req.params.id);
    if (!repo) return res.status(404).json({ error: 'Repo not found' });

    repo.files = repo.files.filter(f => f.name !== req.params.filename);

    repo.commits.unshift({
        hash: Math.random().toString(16).substr(2, 7),
        msg: `Delete ${req.params.filename}`,
        user: req.body.username || 'System',
        time: 'Just now'
    });

    saveDB(db);
    res.json({ success: true });
});

// ==================== LUA OBFUSCATOR ENGINE ====================
function obfuscateLua(source) {
    const randVar = () => {
        const chars = 'abcdefghijklmnopqrstuvwxyz';
        let name = '_';
        for (let i = 0; i < 8; i++) name += chars[Math.floor(Math.random() * chars.length)];
        return name + Math.floor(Math.random() * 9999);
    };

    const key = Math.floor(Math.random() * 200) + 50;
    const encrypted = [];
    for (let i = 0; i < source.length; i++) {
        encrypted.push(source.charCodeAt(i) ^ key);
    }

    const vTable = randVar();
    const vKey = randVar();
    const vResult = randVar();
    const vI = randVar();
    const vRun = randVar();
    const vXor = randVar();

    // Chunking function to prevent Delta crashes on large tables
    const chunkTable = (data, varName) => {
        const chunkSize = 500;
        let output = `local ${varName} = {}\n`;
        for (let i = 0; i < data.length; i += chunkSize) {
            const chunk = data.slice(i, i + chunkSize);
            output += `for _, v in pairs({${chunk.join(',')}}) do table.insert(${varName}, v) end\n`;
        }
        return output;
    };

    // Layer 1: Base XOR
    let lua = `-- VanderHub Core\n`;
    lua += `local ${vKey}=${key}\n`;
    lua += chunkTable(encrypted, vTable);
    lua += `local ${vResult}={} `;
    lua += `local function ${vXor}(a,b) if bit32 then return bit32.bxor(a,b) end local r,m=0,1 while a>0 or b>0 do if a%2~=b%2 then r=r+m end a,b,m=math.floor(a/2),math.floor(b/2),m*2 end return r end\n`;
    lua += `for ${vI}=1,#${vTable} do ${vResult}[${vI}]=string.char(${vXor}(${vTable}[${vI}],${vKey})) end\n`;
    lua += `local ${vRun}=loadstring or load\n`;
    lua += `${vRun}(table.concat(${vResult}))()\n`;

    // Layer 2: Final Shell (Shift Cipher for maximum mobile speed)
    const layer2Key = Math.floor(Math.random() * 100) + 10;
    const layer2Encrypted = [];
    for (let i = 0; i < lua.length; i++) {
        layer2Encrypted.push((lua.charCodeAt(i) + layer2Key) % 256);
    }

    const v2Table = randVar();
    const v2Key = randVar();
    const v2Result = randVar();
    const v2I = randVar();
    const v2Run = randVar();

    let finalOutput = `-- VanderHub Shield v2.6 | Fast Execution Shell\n`;
    finalOutput += `local ${v2Key}=${layer2Key}\n`;
    finalOutput += chunkTable(layer2Encrypted, v2Table);
    finalOutput += `local ${v2Result}={} `;
    finalOutput += `for ${v2I}=1,#${v2Table} do ${v2Result}[${v2I}]=string.char((${v2Table}[${v2I}]-${v2Key})%256) end `;
    finalOutput += `local ${v2Run}=loadstring or load `;
    finalOutput += `${v2Run}(table.concat(${v2Result}))()\n`;

    return finalOutput;
}

// RAW file content (for Roblox executors to fetch scripts!)
// DOUBLE PROTECTION: key required + browsers always blocked
const RAW_KEY = 'vander2026';

app.get('/raw/:repoId/:filename', (req, res) => {
    const ua = (req.headers['user-agent'] || '').toLowerCase();

    // Always block browsers (even with key)
    // EXCEPTION: Allow known executors and all mobile devices
    const whitelist = ['roblox', 'delta', 'fluxus', 'codex', 'arceus', 'hydrogen', 'vegax', 'android', 'iphone', 'ipad', 'cfnetwork'];
    const isWhitelisted = whitelist.some(k => ua.includes(k));
    const isCommonBrowser = ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari') || ua.includes('firefox') || ua.includes('edg') || ua.includes('opera') || ua.includes('webkit');

    // Only block if it's a common desktop browser AND not whitelisted
    if (isCommonBrowser && !isWhitelisted) {
        return res.status(403).send('<html><body style="background:#0d1117;color:#f85149;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center"><h1>🛡️ VANDERHUB: ACCESS DENIED</h1><p style="color:#8b949e">Raw source code is protected. Browser access is forbidden.</p></div></body></html>');
    }

    // Check for secret key
    if (req.query.key !== RAW_KEY) {
        return res.status(403).send('-- ACCESS DENIED: Invalid key');
    }

    const db = getDB();
    const repo = db.repos.find(r => r.id === req.params.repoId);
    if (!repo) return res.status(404).send('-- REPO NOT FOUND');

    const file = repo.files.find(f => f.name === req.params.filename);
    if (!file) return res.status(404).send('-- FILE NOT FOUND');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');

    // Auto-obfuscate Lua files, serve others as-is
    const isLua = req.params.filename.toLowerCase().endsWith('.lua') || !req.params.filename.includes('.');
    if (isLua && file.content.length > 0) {
        res.send(obfuscateLua(file.content));
    } else {
        res.send(file.content);
    }
});

// Catch-all: serve frontend for any non-API route (for production SPA)
if (fs.existsSync(distPath)) {
    app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`VanderHub running on port ${PORT}`);
});
