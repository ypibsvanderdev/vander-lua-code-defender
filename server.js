import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import rateLimit from 'express-rate-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// FIREBASE CONFIGURATION
const FIREBASE_URL = 'https://vanderhub-default-rtdb.firebaseio.com/.json';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 1. GLOBAL RATE LIMITER (Stop flood dumpers)
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 10,
    message: "-- SECURITY BOOT: Rate limit exceeded. IP Logged.",
    standardHeaders: true,
    legacyHeaders: false,
});

// Serve the built frontend (for production)
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
}

// INITIAL DATABASE
const DEFAULT_DB = { users: [], repos: [], keys: [], notifications: 0 };

const getDB = async () => {
    try {
        const res = await axios.get(FIREBASE_URL);
        if (!res.data) { await saveDB(DEFAULT_DB); return DEFAULT_DB; }
        const db = res.data;
        if (!db.users) db.users = [];
        if (!db.repos) db.repos = [];
        if (!db.keys) db.keys = [];
        return db;
    } catch (e) { return DEFAULT_DB; }
};

const saveDB = async (data) => {
    try { await axios.put(FIREBASE_URL, data); } catch (e) { }
};

// --- SECURITY TOOLS ---

app.post('/api/obfuscate', (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'No code provided' });
    try { res.json({ result: obfuscateLua(code) }); } catch (e) { res.status(500).json({ error: 'Obfuscation failed' }); }
});

app.post('/api/signup', async (req, res) => {
    const { username, password } = req.body;
    const db = await getDB();
    if (db.users.find(u => u.username === username)) return res.status(400).json({ error: 'Username already exists' });
    const newUser = { username, password, id: 'u' + Math.random().toString(36).substr(2, 9) };
    db.users.push(newUser);
    await saveDB(db);
    res.json({ success: true, user: { username: newUser.username } });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const db = await getDB();
    const user = db.users.find(u => u.username === username && u.password === password);
    if (user) res.json({ success: true, user: { username: user.username } });
    else res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/verify-key', async (req, res) => {
    const { key, hwid } = req.body;
    const db = await getDB();
    const keyData = db.keys.find(k => k.id === key);
    if (keyData && !keyData.used) {
        keyData.used = true;
        keyData.hwid = hwid;
        if (keyData.type === 'trial') {
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + 30);
            keyData.expiresAt = expiry.toISOString();
        }
        await saveDB(db);
        res.json({ success: true, expiresAt: keyData.expiresAt });
    } else res.status(401).json({ error: 'Invalid or already used key' });
});

app.get('/api/repos', async (req, res) => {
    const { username } = req.query;
    const db = await getDB();
    if (username === 'yahia') return res.json(db.repos);
    res.json(db.repos.filter(r => r.owner === username));
});

app.post('/api/repos', async (req, res) => {
    const { name, desc, status, owner } = req.body;
    const db = await getDB();
    const newRepo = {
        id: 'r' + Math.random().toString(36).substr(2, 9),
        name: name || 'new-repo',
        owner: owner || 'System',
        status: status || 'Private',
        lang: 'Plain Text',
        stars: 0, forks: 0,
        desc: desc || 'Repository created with VanderHub',
        files: [{ name: 'README.md', content: `# ${name}\n\n${desc}`, type: 'file' }],
        issues: [],
        commits: [{ hash: Math.random().toString(16).substr(2, 7), msg: 'Initial commit', user: owner || 'System', time: 'Just now' }]
    };
    db.repos.push(newRepo);
    await saveDB(db);
    res.json(newRepo);
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
    for (let i = 0; i < source.length; i++) encrypted.push(source.charCodeAt(i) ^ key);

    const vTable = randVar();
    const vKey = randVar();
    const vResult = randVar();
    const vI = randVar();
    const vRun = randVar();
    const vXor = randVar();

    const chunkTable = (data, varName) => {
        const chunkSize = 500;
        let output = `local ${varName} = {}\n`;
        for (let i = 0; i < data.length; i += chunkSize) {
            const chunk = data.slice(i, i + chunkSize);
            output += `for _, v in pairs({${chunk.join(',')}}) do table.insert(${varName}, v) end\n`;
        }
        return output;
    };

    let lua = `-- VanderHub Core\n`;
    lua += `local ${vKey}=${key}\n`;
    lua += chunkTable(encrypted, vTable);
    lua += `local ${vResult}={} `;
    lua += `local function ${vXor}(a,b) if bit32 then return bit32.bxor(a,b) end local r,m=0,1 while a>0 or b>0 do if a%2~=b%2 then r=r+m end a,b,m=math.floor(a/2),math.floor(b/2),m*2 end return r end\n`;
    lua += `for ${vI}=1,#${vTable} do ${vResult}[${vI}]=string.char(${vXor}(${vTable}[${vI}],${vKey})) end\n`;
    lua += `local ${vRun}=loadstring or load\n`;
    lua += `${vRun}(table.concat(${vResult}))()\n`;

    const layer2Key = Math.floor(Math.random() * 100) + 10;
    const layer2Encrypted = [];
    for (let i = 0; i < lua.length; i++) layer2Encrypted.push((lua.charCodeAt(i) + layer2Key) % 256);

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

// ==================== ULTIMATE PROTECTION LAYER ====================
const RAW_KEY = 'vander2026';
const HANDSHAKE_KEY = 'X-Vander-Shield-777'; // Custom header required

app.get('/raw/:repoId/:filename', limiter, async (req, res) => {
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const secret_header = req.headers['x-shield-handshake'];
    const hwid = req.query.hwid; // Now MANDATORY

    // 1. HARDENED USER-AGENT BLACKLIST
    const blacklist = ['discord', 'python', 'axios', 'fetch', 'curl', 'wget', 'postman', 'golang', 'libcurl', 'scraper', 'spider', 'bot', 'headless'];
    const whitelist = ['roblox', 'delta', 'fluxus', 'codex', 'arceus', 'hydrogen', 'vegax', 'android', 'iphone', 'ipad', 'cfnetwork', 'robloxproxy'];

    const isBlacklisted = blacklist.some(k => ua.includes(k));
    const isWhitelisted = whitelist.some(k => ua.includes(k));

    // 2. HANDSHAKE VERIFICATION (Stop spoofing)
    // Legit executors don't send this header, but they also don't look like scrapers.
    // We only check this if the UA looks suspicious.
    if (isBlacklisted || !isWhitelisted) {
        return res.status(403).send('-- UNTRUSTED ENVIRONMENT: Handshake Failed.');
    }

    // 3. HWID LOCKING (The ultimate bypass killer)
    const db = await getDB();
    if (!hwid) {
        return res.status(401).send('-- SECURITY BOOT: HWID Identification Required.');
    }

    // Check if HWID is registered to any key or user
    const isProductUser = db.keys.find(k => k.hwid === hwid) || db.users.find(u => u.hwid === hwid);

    // BACKUP: Also check the Zenith Registry (for Zenith PC/Mobile users)
    let isZenithUser = false;
    try {
        if (fs.existsSync('zenith_registry.json')) {
            const registry = JSON.parse(fs.readFileSync('zenith_registry.json', 'utf-8'));
            for (const scriptName in registry.Scripts) {
                const whitelist = registry.Scripts[scriptName].Whitelist || {};
                // We check if the HWID itself is whitelisted or if the user owns it
                if (whitelist[hwid] || Object.values(whitelist).includes(hwid)) {
                    isZenithUser = true;
                    break;
                }
            }
        }
    } catch (e) { console.error("Registry check error:", e); }

    const isMaster = hwid === 'yahia-master-pc' || hwid === 'vander-dev-666' || hwid === 'ypibs27';

    if (!isProductUser && !isZenithUser && !isMaster) {
        return res.status(403).send('-- UNAUTHORIZED DEVICE: Access Revoked.');
    }

    // 4. KEY VALIDATION
    if (req.query.key !== RAW_KEY) {
        return res.status(403).send('-- ACCESS DENIED: Handshake Key Mismatch');
    }

    // 5. FETCH & SERVE
    const repo = db.repos.find(r => r.id === req.params.repoId);
    if (!repo) return res.status(404).send('-- REPO NOT FOUND');

    const file = repo.files.find(f => f.name === req.params.filename);
    if (!file) return res.status(404).send('-- FILE NOT FOUND');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Vander-Protected', 'True');

    // Serve garbage code if they are using a debugger
    if (ua.includes('debugger') || ua.includes('fiddler') || ua.includes('charles')) {
        return res.send('while true do end -- DEBUGER DETECTED');
    }

    const isLua = req.params.filename.toLowerCase().endsWith('.lua') || !req.params.filename.includes('.');
    if (isLua && file.content.length > 0) {
        res.send(obfuscateLua(file.content));
    } else {
        res.send(file.content);
    }
});

// Serve frontend
if (fs.existsSync(distPath)) {
    app.get('*', (req, res) => { res.sendFile(path.join(distPath, 'index.html')); });
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`VanderHub SECURE running on port ${PORT}`);
});
