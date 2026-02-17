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
        { id: 'r3', name: 'zenith_mobile_v5.2.1.lua', relative: '../example/zenith_mobile_v5.2.1.lua' },
        { id: 'r4', name: 'zenith_pc_v5.3.1.lua', relative: '../example/zenith_pc_v5.3.1.lua' }
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

        // Load local backup for comparison
        let localData = null;
        if (fs.existsSync(path.join(__dirname, 'vanderhub_db.json'))) {
            localData = JSON.parse(fs.readFileSync(path.join(__dirname, 'vanderhub_db.json'), 'utf-8'));
        }

        // PROTECTION: If Firebase is empty/null but we have local backup, USE LOCAL BACKUP.
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

        if (db.repos && db.repos.length > 0) {
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

app.get('/api/repos', async (req, res) => {
    const db = await getDB();
    res.json(db.repos);
});

app.post('/api/repos', async (req, res) => {
    const { name, desc, status, owner } = req.body;
    const db = await getDB();
    const newRepo = {
        id: 'r' + Math.random().toString(36).substr(2, 9),
        name: name || 'new-repo',
        owner: owner || 'meqda',
        status: status || 'Private',
        lang: 'Plain Text',
        stars: 0, forks: 0,
        desc: desc || 'Repository created with VanderHub',
        files: [{ name: 'README.md', content: `# ${name}\n\n${desc}`, type: 'file' }],
        issues: [],
        commits: [{ hash: Math.random().toString(16).substr(2, 7), msg: 'Initial commit', user: owner || 'meqda', time: 'Just now' }]
    };
    db.repos.push(newRepo);
    await saveDB(db);
    res.json(newRepo);
});

app.post('/api/repos/:id/files', async (req, res) => {
    const { name, content } = req.body;
    const db = await getDB();
    const repo = db.repos.find(r => r.id === req.params.id);
    if (!repo) return res.status(404).json({ error: 'Repo not found' });
    repo.files.push({ name, content, type: 'file' });
    repo.commits.unshift({ hash: Math.random().toString(16).substr(2, 7), msg: `Add ${name}`, user: repo.owner, time: 'Just now' });
    await saveDB(db);
    res.json(repo);
});

app.put('/api/repos/:id/files/:filename', async (req, res) => {
    const { content } = req.body;
    const db = await getDB();
    const repo = db.repos.find(r => r.id === req.params.id);
    if (!repo) return res.status(404).json({ error: 'Repo not found' });
    const file = repo.files.find(f => f.name === req.params.filename);
    if (file) file.content = content;
    repo.commits.unshift({ hash: Math.random().toString(16).substr(2, 7), msg: `Update ${req.params.filename}`, user: repo.owner, time: 'Just now' });
    await saveDB(db);
    res.json(repo);
});

app.delete('/api/repos/:id/files/:filename', async (req, res) => {
    const db = await getDB();
    const repo = db.repos.find(r => r.id === req.params.id);
    if (!repo) return res.status(404).json({ error: 'Repo not found' });
    repo.files = repo.files.filter(f => f.name !== req.params.filename);
    repo.commits.unshift({ hash: Math.random().toString(16).substr(2, 7), msg: `Delete ${req.params.filename}`, user: repo.owner, time: 'Just now' });
    await saveDB(db);
    res.json(repo);
});

app.delete('/api/repos/:id', async (req, res) => {
    const db = await getDB();
    db.repos = db.repos.filter(r => r.id !== req.params.id);
    await saveDB(db);
    res.json({ success: true });
});

app.post('/api/repos/:id/star', async (req, res) => {
    const db = await getDB();
    const repo = db.repos.find(r => r.id === req.params.id);
    if (repo) repo.stars += 1;
    await saveDB(db);
    res.json(repo);
});

app.post('/api/repos/:id/issues', async (req, res) => {
    const { title } = req.body;
    const db = await getDB();
    const repo = db.repos.find(r => r.id === req.params.id);
    if (repo) {
        repo.issues.push({ id: repo.issues.length + 1, title, status: 'Open', author: 'meqda', time: 'Just now' });
        await saveDB(db);
    }
    res.json(repo);
});

// ==================== RAW ENDPOINT ====================
const RAW_KEY = 'vander2026';

app.get('/raw/:repoId/:filename', async (req, res) => {
    // Basic Key Validation
    if (req.query.key !== RAW_KEY) {
        return res.status(403).send('-- ACCESS DENIED: Handshake Key Mismatch');
    }

    const db = await getDB();
    const repo = db.repos.find(r => r.id === req.params.repoId);
    if (!repo) return res.status(404).send('-- REPO NOT FOUND');

    const file = repo.files.find(f => f.name === req.params.filename);
    if (!file) return res.status(404).send('-- FILE NOT FOUND');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
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
