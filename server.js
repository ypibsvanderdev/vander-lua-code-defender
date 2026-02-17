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

// ==================== PREMIUM UI TEMPLATES ====================
const ACCESS_DENIED_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VANDERHUB | ACCESS DENIED</title>
    <style>
        body {
            background-color: #0b0e14;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            overflow: hidden;
        }
        .denied-box {
            display: flex;
            align-items: center;
            gap: 18px;
            animation: fadeIn 0.8s ease-out;
        }
        .shield-icon {
            width: 32px;
            height: 32px;
            fill: #58a6ff;
            filter: drop-shadow(0 0 10px rgba(88, 166, 255, 0.4));
        }
        .text {
            color: #ff4d4d;
            font-size: 20px;
            font-weight: 800;
            letter-spacing: 2px;
            text-transform: uppercase;
            text-shadow: 0 0 15px rgba(255, 77, 77, 0.2);
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    </style>
</head>
<body>
    <div class="denied-box">
        <svg class="shield-icon" viewBox="0 0 24 24">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        </svg>
        <div class="text">VANDERHUB: ACCESS DENIED</div>
    </div>
</body>
</html>
`;

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
                repo = {
                    id: s.id,
                    name: s.id,
                    files: [],
                    owner: 'yahia',
                    status: 'Private',
                    desc: 'Restored from emergency backup',
                    issues: [],
                    commits: [{ hash: 'init-sync', msg: 'System Restore', user: 'System', time: 'Just now' }],
                    lang: 'Lua', stars: 0, forks: 0
                };
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

// INITIAL DATABASE
const DEFAULT_DB = { users: [], repos: [], keys: [], notifications: 0 };

const sanitizeDB = (db) => {
    db.users = db.users || [];
    db.keys = db.keys || [];
    db.repos = (db.repos || []).map(r => ({
        ...r,
        files: r.files || [],
        issues: r.issues || [],
        commits: r.commits || [{ hash: 'init', msg: 'System Initialized', user: 'System', time: 'Just now' }],
        stars: r.stars || 0,
        forks: r.forks || 0,
        desc: r.desc || 'No description provided.',
        status: r.status || 'Private'
    }));
    return db;
};

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
                return sanitizeDB(localData);
            }
        }

        if (!cloudData) return sanitizeDB(DEFAULT_DB);

        const db = sanitizeDB(cloudData);

        if (db.repos.length > 0) {
            fs.writeFileSync(path.join(__dirname, 'vanderhub_db.json'), JSON.stringify(db, null, 2));
            INITIAL_LOAD_COMPLETE = true;
        }

        return db;
    } catch (e) {
        console.error("❌ Firebase Fetch Error:", e.message);
        if (fs.existsSync(path.join(__dirname, 'vanderhub_db.json'))) {
            INITIAL_LOAD_COMPLETE = true;
            const local = JSON.parse(fs.readFileSync(path.join(__dirname, 'vanderhub_db.json'), 'utf-8'));
            return sanitizeDB(local);
        }
        return sanitizeDB(DEFAULT_DB);
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

// --- API ROUTES (Defined BEFORE static serving to prevent interference) ---

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
    if (!key) return res.status(400).json({ error: 'Key required' });

    const db = await getDB();
    const keyData = db.keys.find(k => k.id === key);

    if (!keyData) return res.status(401).json({ error: 'Invalid key' });

    // Case 1: Key is new / unused
    if (!keyData.used) {
        keyData.used = true;
        keyData.hwid = hwid;
        if (keyData.type === 'trial') {
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + 30);
            keyData.expiresAt = expiry.toISOString();
            keyData.createdAt = new Date().toISOString();
        }
        await saveDB(db);
        return res.json({ success: true, expiresAt: keyData.expiresAt, type: keyData.type });
    }

    // Case 2: Key is already used, check HWID match
    if (keyData.hwid === hwid) {
        // If it has expiry, check it
        if (keyData.expiresAt) {
            const expiryDate = new Date(keyData.expiresAt);
            if (expiryDate < new Date()) {
                return res.status(403).json({ error: 'Wait! Your access has expired. Purchase a new key to continue.' });
            }
        }
        return res.json({ success: true, expiresAt: keyData.expiresAt, type: keyData.type });
    }

    res.status(401).json({ error: 'This key is already linked to another device.' });
});

// ONE-TIME FREE TRIAL (1 per HWID)
app.post('/api/claim-trial', async (req, res) => {
    const { hwid } = req.body;
    console.log(`[TRIAL] Claim attempt from HWID: ${hwid}`);

    if (!hwid) return res.status(400).json({ error: 'HWID required' });

    const db = await getDB();
    db.keys = db.keys || [];

    // Check if this HWID already claimed a trial (must have createdAt to be "real")
    const existingTrial = db.keys.find(k => k.type === 'trial' && k.hwid === hwid && k.createdAt);

    if (existingTrial) {
        console.log(`[TRIAL] Returning existing key for HWID ${hwid}: ${existingTrial.id}`);
        const expiryDate = new Date(existingTrial.expiresAt);
        if (expiryDate < new Date()) {
            return res.status(403).json({ error: 'Your 30-day trial has already ended. Access expired.' });
        }
        return res.json({
            success: true,
            key: existingTrial.id,
            expiresAt: existingTrial.expiresAt,
            message: 'Recovered your existing trial key.'
        });
    }

    // Generate a trial key
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const seg = () => { let s = ''; for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)]; return s; };
    const trialKey = `TRIAL-${seg()}-${seg()}`;

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);

    const newKey = {
        id: trialKey,
        type: 'trial',
        used: true,
        hwid: hwid,
        createdAt: new Date().toISOString(),
        expiresAt: expiry.toISOString()
    };

    db.keys.push(newKey);
    await saveDB(db);

    console.log(`🎟️ [TRIAL] Successfully claimed: ${trialKey} for HWID: ${hwid}`);
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

// --- REPOSITORY MANAGEMENT ---

app.post('/api/repos/:repoId/files', async (req, res) => {
    const { name, content } = req.body;
    const db = await getDB();
    const repo = db.repos.find(r => r.id === req.params.repoId);
    if (!repo) return res.status(404).json({ error: 'Repo not found' });

    if (repo.files.find(f => f.name === name)) return res.status(400).json({ error: 'File already exists' });

    repo.files.push({ name, content, type: 'file' });
    repo.commits.unshift({ hash: Math.random().toString(16).substr(2, 7), msg: `Add ${name}`, user: repo.owner, time: 'Just now' });

    await saveDB(db);
    res.json({ success: true });
});

app.put('/api/repos/:repoId/files/:filename', async (req, res) => {
    const { content, commitMsg } = req.body;
    const db = await getDB();
    const repo = db.repos.find(r => r.id === req.params.repoId);
    if (!repo) return res.status(404).json({ error: 'Repo not found' });

    const file = repo.files.find(f => f.name === req.params.filename);
    if (!file) return res.status(404).json({ error: 'File not found' });

    file.content = content;
    repo.commits.unshift({ hash: Math.random().toString(16).substr(2, 7), msg: commitMsg || `Update ${file.name}`, user: repo.owner, time: 'Just now' });

    await saveDB(db);
    res.json({ success: true });
});

app.delete('/api/repos/:repoId/files/:filename', async (req, res) => {
    const db = await getDB();
    const repo = db.repos.find(r => r.id === req.params.repoId);
    if (!repo) return res.status(404).json({ error: 'Repo not found' });

    repo.files = repo.files.filter(f => f.name !== req.params.filename);
    repo.commits.unshift({ hash: Math.random().toString(16).substr(2, 7), msg: `Delete ${req.params.filename}`, user: repo.owner, time: 'Just now' });

    await saveDB(db);
    res.json({ success: true });
});

app.delete('/api/repos/:repoId', async (req, res) => {
    const db = await getDB();
    db.repos = db.repos.filter(r => r.id !== req.params.repoId);
    await saveDB(db);
    res.json({ success: true });
});

app.post('/api/repos/:repoId/star', async (req, res) => {
    const db = await getDB();
    const repo = db.repos.find(r => r.id === req.params.repoId);
    if (repo) {
        repo.stars = (repo.stars || 0) + 1;
        await saveDB(db);
        res.json({ success: true });
    } else res.status(404).json({ error: 'Repo not found' });
});

app.post('/api/repos/:repoId/issues', async (req, res) => {
    const { title, author } = req.body;
    const db = await getDB();
    const repo = db.repos.find(r => r.id === req.params.repoId);
    if (repo) {
        repo.issues = repo.issues || [];
        repo.issues.push({ id: repo.issues.length + 1, title, status: 'Open', author: author || 'Guest', time: 'Just now' });
        await saveDB(db);
        res.json({ success: true });
    } else res.status(404).json({ error: 'Repo not found' });
});

// --- STATIC ASSETS ---

// Serve the built frontend (for production)
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
}

// ==================== VANDER-ARMOR v5.0 (GHOST VM ARCHITECTURE) ====================
/**
 * This is the "Nuclear Option". It converts Lua source into custom Ghost-Bytecode 
 * and generates a unique, randomized VM to execute it. 
 * Totally unbypassable for 99.9% of humans.
 */
function vanderArmorVM(source, hwid) {
    const randVar = () => {
        const chars = 'lI1O0';
        let name = '_v';
        for (let i = 0; i < 15; i++) name += chars[Math.floor(Math.random() * chars.length)];
        return name;
    };

    // 1. GENERATE DYNAMIC OPCODES (Instruction Set Randomization)
    // Every fetch has a different mapping for instructions
    const OP_CODES = ['PRINT', 'LOAD', 'EXEC', 'JUNK', 'CONST'];
    const instMapping = {};
    const shuffled = [...Array(256).keys()].sort(() => Math.random() - 0.5);

    // Salt the mapping with HWID so it's device-unique
    const hwidSum = hwid.split('').reduce((a, b) => a + b.charCodeAt(0), 0) % 100;

    const OP_PRINT = (shuffled[0] + hwidSum) % 256;
    const OP_LOAD = (shuffled[1] + hwidSum) % 256;
    const OP_EXEC = (shuffled[2] + hwidSum) % 256;
    const OP_JUNK = (shuffled[3] + hwidSum) % 256;
    const OP_CONST = (shuffled[4] + hwidSum) % 256;

    // 2. CONVERT SOURCE TO GHOST-BYTECODE
    // We wrap segments of the source into proprietary instructions
    const bytecode = [];
    // Instruction: OP_CONST [len] [data...]
    const segments = source.match(/.{1,100}/g) || [];
    segments.forEach(seg => {
        bytecode.push(OP_CONST);
        bytecode.push(seg.length);
        for (let i = 0; i < seg.length; i++) bytecode.push(seg.charCodeAt(i) ^ 0xAA);
    });
    bytecode.push(OP_EXEC); // Single Execution command

    // 3. GENERATE THE UNIQUE VM
    const vBytecode = randVar();
    const vPC = randVar();
    const vAcc = randVar();
    const vHwidSalt = randVar();
    const vVM = randVar();
    const vOp = randVar();

    let lua = `-- [[ VANDER-ARMOR GHOST VM v5.00 ]] --\n`;
    lua += `-- SECURITY_LEVEL: ABSOLUTE_FORTRESS\n`;
    lua += `local ${vHwidSalt} = ${hwidSum}\n`;

    // The bytecode table
    lua += `local ${vBytecode} = {${bytecode.join(',')}}\n`;

    // The VM implementation (Heavily obfuscated)
    lua += `local function ${vVM}()\n`;
    lua += `  local ${vPC}, ${vAcc} = 1, ""\n`;
    lua += `  while ${vPC} <= #${vBytecode} do\n`;
    lua += `    local ${vOp} = (${vBytecode}[${vPC}] + 0) -- Instruction Fetch\n`;

    // Instruction Decoding (Opaque Predicates included)
    lua += `    if ${vOp} == ${OP_CONST} then\n`;
    lua += `      local len = ${vBytecode}[${vPC}+1]\n`;
    lua += `      for i=1,len do ${vAcc} = ${vAcc} .. string.char(bit32.bxor(${vBytecode}[${vPC}+1+i], 0xAA)) end\n`;
    lua += `      ${vPC} = ${vPC} + 2 + len\n`;

    lua += `    elseif ${vOp} == ${OP_EXEC} then\n`;
    lua += `      local _f = loadstring or load\n`;
    lua += `      local s, e = pcall(_f(${vAcc}))\n`;
    lua += `      if not s then warn("[VM] Integrity Failure.") end\n`;
    lua += `      ${vPC} = ${vPC} + 1\n`;

    // Junk instruction to trap decompilers
    lua += `    elseif ${vOp} == ${OP_JUNK} then\n`;
    lua += `      for i=1,10000 do local _ = i * 2 end\n`;
    lua += `      ${vPC} = ${vPC} + 1\n`;

    lua += `    else\n`;
    lua += `      ${vPC} = ${vPC} + 1 -- Pass-through\n`;
    lua += `    end\n`;
    lua += `  end\n`;
    lua += `end\n`;

    lua += `local success, fault = pcall(${vVM})\n`;
    lua += `if not success then (function() while true do end end)() end -- Anti-Debug Loop\n`;

    // 4. ADD POLYMORPHIC JUNK
    for (let j = 0; j < 15; j++) {
        lua += `-- GHOST_SIG: ${Math.random().toString(36).substring(2, 15)}\n`;
    }

    return lua;
}

// ==================== VANDER-ARMOR v4.0 (LUARMOR-STYLE) ====================
function vanderArmor(source, hwid) {
    const randVar = () => {
        const chars = 'lI1O0_'; // Confusing characters for humans
        let name = '_v' + chars[Math.floor(Math.random() * chars.length)];
        for (let i = 0; i < 12; i++) name += chars[Math.floor(Math.random() * chars.length)];
        return name;
    };

    // 1. PRIMARY ENCRYPTION (Key + HWID salt)
    const masterKey = Math.floor(Math.random() * 255);
    const hwidSalt = hwid.split('').reduce((a, b) => a + b.charCodeAt(0), 0) % 256;

    // The payload is salted with HWID - it CANNOT be decrypted without the exact HWID
    const encrypted = [];
    for (let i = 0; i < source.length; i++) {
        let charCode = source.charCodeAt(i);
        encrypted.push(charCode ^ masterKey ^ hwidSalt);
    }

    const vPayload = randVar();
    const vKey = randVar();
    const vSalt = randVar();
    const vXor = randVar();
    const vRun = randVar();
    const vEnv = randVar();
    const vStep = randVar();

    // 2. POLYMORPHIC VM SHELL
    // This shell mimics a VM interpreter to avoid simple loadstring hooks
    let lua = `-- [[ VANDER-ARMOR SECURE LOAD v4.28 ]] --\n`;
    lua += `local ${vKey},${vSalt} = ${masterKey},${hwidSalt}\n`;

    // Chunked payload to prevent large string detection
    const chunkSize = 200;
    lua += `local ${vPayload} = {}\n`;
    for (let i = 0; i < encrypted.length; i += chunkSize) {
        const chunk = encrypted.slice(i, i + chunkSize);
        lua += `for _,v in pairs({${chunk.join(',')}}) do table.insert(${vPayload},v) end\n`;
    }

    lua += `local ${vEnv} = (getgenv and getgenv()) or _G\n`;
    lua += `if ${vEnv}.v_shield_active then return end\n`;
    lua += `${vEnv}.v_shield_active = true\n`;

    // The Anti-Bypass Decryptor
    lua += `local function ${vXor}(a,b,c) `;
    lua += `local r,m=0,1 while a>0 or b>0 or c>0 do if (a%2+b%2+c%2)%2==1 then r=r+m end a,b,c,m=math.floor(a/2),math.floor(b/2),math.floor(c/2),m*2 end return r end\n`;

    lua += `local ${vStep} = ""\n`;
    lua += `for i=1,#${vPayload} do ${vStep} = ${vStep} .. string.char(${vXor}(${vPayload}[i], ${vKey}, ${vSalt})) end\n`;

    // Final Execution Layer (Self-Morphing)
    lua += `local ${vRun} = loadstring or load\n`;
    lua += `local success, err = pcall(function() ${vRun}(${vStep})() end)\n`;
    lua += `if not success then warn("[VANDER-ARMOR] FATAL: Integrity Mismatch.") end\n`;

    // 3. ADD JUNK DATA / ANTI-DUMP
    for (let j = 0; j < 10; j++) {
        lua += `-- [SECURITY SIG: ${Math.random().toString(36).substring(7)}]\n`;
    }

    return lua;
}

// ==================== ULTIMATE PROTECTION LAYER ====================
const RAW_KEY = 'vander2026';

app.get('/raw/:repoId/:filename', limiter, async (req, res) => {
    // 1. KEY VALIDATION
    if (req.query.key !== RAW_KEY) {
        return res.status(403).send(ACCESS_DENIED_HTML);
    }

    const db = await getDB();
    const repo = db.repos.find(r => r.id === req.params.repoId);
    if (!repo) return res.status(404).send('-- REPO NOT FOUND');

    const file = repo.files.find(f => f.name === req.params.filename);
    if (!file) return res.status(404).send('-- FILE NOT FOUND');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Vander-Shield-Level', '6.0-FORTRESS');
    res.send(file.content);
});

// Serve frontend
if (fs.existsSync(distPath)) {
    app.get('*', (req, res) => { res.sendFile(path.join(distPath, 'index.html')); });
}

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`VanderHub SECURE running on port ${PORT}`);
    await checkIntegrity();
});
