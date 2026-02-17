import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { getHandshakeKey, generateChallenge, labyrinthEncrypt } from './v-shield.js';
import { firewall } from './firewall.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// FIREBASE CONFIGURATION
const FIREBASE_URL = 'https://vanderhub-default-rtdb.firebaseio.com/.json';

// KEEP-ALIVE SYSTEM
app.get('/ping', (req, res) => {
    res.json({ status: 'ALIVE', timestamp: new Date(), integrity: INITIAL_LOAD_COMPLETE });
});

let INITIAL_LOAD_COMPLETE = false; // THE MASTER LOCK: Prevents saving until data is actually loaded

// STARTUP INTEGRITY CHECK
const checkIntegrity = async () => {
    console.log("🔍 Checking Database Integrity...");
    const db = await getDB();
    console.log(`📊 DB STATUS: [Users: ${db.users.length}] [Keys: ${db.keys.length}] [Repos: ${db.repos.length}]`);

    if (db.repos.length === 0) {
        console.warn("⚠️ WARNING: Cloud Database is EMPTY. Attempting Emergency Sync from local files...");
        await emergencySync(db);
    } else {
        console.log("✅ Database verified and ready.");
        INITIAL_LOAD_COMPLETE = true;
    }
};

// EMERGENCY SYNC (Fixes disappearances on start)
const emergencySync = async (db) => {
    const scripts = [
        { id: 'r1', name: 'vander_tp_mobile.lua', relative: '../qwery-tp-block/vander_tp_mobile.lua' },
        { id: 'r2', name: 'admin_panel.lua', relative: '../zenith-admin/admin_panel.lua' },
        { id: 'r3', name: 'zenith_mobile_v5.2.1.lua', relative: './zenith_mobile_v5.2.1.lua' },
        { id: 'r4', name: 'zenith_pc_v5.3.1.lua', relative: './zenith_pc_v5.3.1.lua' }
    ];

    let foundAny = false;
    for (const s of scripts) {
        const fullPath = path.resolve(__dirname, s.relative);
        if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            let repo = db.repos.find(r => r.id === s.id);
            if (!repo) {
                repo = { id: s.id, name: s.id, files: [], owner: 'yahia', status: 'Private' };
                db.repos.push(repo);
            }
            if (!repo.files.find(f => f.name === s.name)) {
                repo.files.push({ name: s.name, content: content, type: 'file' });
            }
            foundAny = true;
            console.log(`📡 Emergency Restored: ${s.name} -> ${s.id}`);
        }
    }

    if (foundAny) {
        INITIAL_LOAD_COMPLETE = true;
        await saveDB(db, true); // Use internal repair flag
        console.log("✅ Emergency Sync Complete. Cloud Repos Restored.");
    } else {
        console.error("❌ Emergency Sync FAILED: No local scripts found to restore.");
    }
};

app.use(cors());
app.use(firewall.middleware()); // THE FIREWALL: Must be first
app.use(cookieParser());
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
        const cloudData = res.data;

        let localData = null;
        if (fs.existsSync(path.join(__dirname, 'vanderhub_db.json'))) {
            localData = JSON.parse(fs.readFileSync(path.join(__dirname, 'vanderhub_db.json'), 'utf-8'));
        }

        if (!cloudData || !cloudData.repos || cloudData.repos.length === 0) {
            if (localData && localData.repos && localData.repos.length > 0) {
                console.warn("🛡️ [GUARD] Firebase empty/null. Recovering from Local Backup...");
                INITIAL_LOAD_COMPLETE = true;
                return localData;
            }
        }

        if (!cloudData) return DEFAULT_DB;

        const db = cloudData;
        db.users = db.users || [];
        db.repos = db.repos || [];
        db.keys = db.keys || [];

        if (db.repos.length > 0) {
            fs.writeFileSync(path.join(__dirname, 'vanderhub_db.json'), JSON.stringify(db, null, 2));
            INITIAL_LOAD_COMPLETE = true;
        }

        return db;
    } catch (e) {
        console.error("❌ Firebase Fetch Error:", e.message);
        if (fs.existsSync(path.join(__dirname, 'vanderhub_db.json'))) {
            INITIAL_LOAD_COMPLETE = true;
            return JSON.parse(fs.readFileSync(path.join(__dirname, 'vanderhub_db.json'), 'utf-8'));
        }
        return DEFAULT_DB;
    }
};

const saveDB = async (data, isInternalRepair = false) => {
    try {
        if (!INITIAL_LOAD_COMPLETE && !isInternalRepair) {
            console.error("⛔ [CRITICAL] Blocked save attempt: Handshake with database is not finished!");
            return;
        }

        if (data.repos.length === 0 && INITIAL_LOAD_COMPLETE && !isInternalRepair) {
            console.error("⛔ [CRITICAL] Blocked repo-wipe attempt!");
            return;
        }

        await axios.put(FIREBASE_URL, data);
        fs.writeFileSync(path.join(__dirname, 'vanderhub_db.json'), JSON.stringify(data, null, 2));
        console.log(`✅ ${isInternalRepair ? 'DATABASE REPAIRED' : 'Cloud Sync Success'}.`);
    } catch (e) {
        console.error("❌ Sync Error:", e.message);
        fs.writeFileSync(path.join(__dirname, 'vanderhub_db.json'), JSON.stringify(data, null, 2));
    }
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

// ONE-TIME FREE TRIAL (1 per HWID)
app.post('/api/claim-trial', async (req, res) => {
    const { hwid } = req.body;
    if (!hwid) return res.status(400).json({ error: 'HWID required' });

    const db = await getDB();
    db.keys = db.keys || [];

    // Check if this HWID already claimed a REAL trial (ignore old legacy keys like VANDER-TRIAL-GUEST)
    const existingTrial = db.keys.find(k => k.type === 'trial' && k.hwid === hwid && k.createdAt);
    if (existingTrial) {
        return res.status(403).json({ error: 'Trial already claimed on this device. Purchase a key for continued access.' });
    }

    // Generate a trial key
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const seg = () => { let s = ''; for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)]; return s; };
    const trialKey = `TRIAL-${seg()}-${seg()}`;

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);

    db.keys.push({
        id: trialKey,
        type: 'trial',
        used: true,
        hwid: hwid,
        createdAt: new Date().toISOString(),
        expiresAt: expiry.toISOString()
    });

    await saveDB(db);
    console.log(`🎟️ Trial claimed: ${trialKey} for HWID: ${hwid.substring(0, 20)}...`);
    res.json({ success: true, key: trialKey, expiresAt: expiry.toISOString() });
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

app.get('/raw/:repoId/:filename', limiter, async (req, res) => {
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const hwid = req.query.hwid;

    // 1. HARDENED USER-AGENT BLACKLIST (Blocks scrapers, bots, tools)
    const blacklist = ['discord', 'python', 'axios', 'fetch', 'curl', 'wget', 'postman', 'golang', 'libcurl', 'scraper', 'spider', 'bot', 'headless', 'phantomjs', 'selenium', 'puppeteer', 'playwright'];
    const whitelist = ['roblox', 'delta', 'fluxus', 'codex', 'arceus', 'hydrogen', 'vegax', 'android', 'iphone', 'ipad', 'cfnetwork', 'robloxproxy', 'synapse', 'krnl', 'script-ware', 'wave', 'electron'];

    const isBlacklisted = blacklist.some(k => ua.includes(k));
    const isWhitelisted = whitelist.some(k => ua.includes(k));

    if (isBlacklisted || !isWhitelisted) {
        return res.status(403).send('-- UNTRUSTED ENVIRONMENT: Handshake Failed.');
    }

    // 2. DEBUGGER DETECTION (Serve garbage if using a proxy debugger)
    if (ua.includes('debugger') || ua.includes('fiddler') || ua.includes('charles') || ua.includes('mitmproxy')) {
        return res.send('while true do end -- DEBUGGER DETECTED');
    }

    // 3. HWID MANDATORY CHECK
    if (!hwid) {
        return res.status(401).send('-- SECURITY BOOT: HWID Identification Required.');
    }

    // 4. KEY VALIDATION
    if (req.query.key !== RAW_KEY) {
        return res.status(403).send('-- ACCESS DENIED: Handshake Key Mismatch');
    }

    // 5. HWID AUTHORIZATION (Check if HWID is registered to any key or user)
    const db = await getDB();
    const isProductUser = db.keys.find(k => k.hwid === hwid) || db.users.find(u => u.hwid === hwid);

    // Master HWID bypass
    const isMaster = hwid === 'yahia-master-pc' || hwid === 'vander-dev-666' || hwid === 'ypibs27';

    if (!isProductUser && !isMaster) {
        return res.status(403).send('-- UNAUTHORIZED DEVICE: Access Revoked.');
    }

    // 6. CHECK KEY EXPIRY (For trial/monthly keys)
    if (isProductUser && isProductUser.expiresAt) {
        const expiryDate = new Date(isProductUser.expiresAt);
        if (expiryDate < new Date()) {
            return res.status(403).send('-- KEY EXPIRED: Purchase a new key at https://vander-key-store.onrender.com');
        }
    }

    // 7. FETCH & SERVE
    const repo = db.repos.find(r => r.id === req.params.repoId);
    if (!repo) return res.status(404).send('-- REPO NOT FOUND');

    const file = repo.files.find(f => f.name === req.params.filename);
    if (!file) return res.status(404).send('-- FILE NOT FOUND');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Vander-Shield-Level', '6.0-FORTRESS');

    const isLua = req.params.filename.toLowerCase().endsWith('.lua') || !req.params.filename.includes('.');
    if (isLua && file.content.length > 0) {
        // Apply dual-layer encryption: obfuscation + labyrinth
        const obfuscated = obfuscateLua(file.content);
        res.send(labyrinthEncrypt(obfuscated, getHandshakeKey()));
    } else {
        res.send(file.content);
    }
});

// Serve frontend
if (fs.existsSync(distPath)) {
    app.get('*', (req, res) => { res.sendFile(path.join(distPath, 'index.html')); });
}

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`VanderHub SECURE running on port ${PORT}`);
    await checkIntegrity();
});
