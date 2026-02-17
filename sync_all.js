import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIREBASE_URL = 'https://vanderhub-default-rtdb.firebaseio.com/.json';

// INTELLIGENT PATHS: Checks both Local Windows and Relative (for Render)
const FILES = [
    { id: 'r1', name: 'vander_tp_mobile.lua', paths: ['c:/Users/meqda/.gemini/antigravity/scratch/qwery-tp-block/vander_tp_mobile.lua', '../qwery-tp-block/vander_tp_mobile.lua', './scripts/vander_tp_mobile.lua'] },
    { id: 'r2', name: 'admin_panel.lua', paths: ['c:/Users/meqda/.gemini/antigravity/scratch/zenith-admin/admin_panel.lua', '../zenith-admin/admin_panel.lua', './scripts/admin_panel.lua'] },
    { id: 'r3', name: 'zenith_mobile_v5.2.1.lua', paths: ['c:/Users/meqda/.gemini/antigravity/scratch/example/zenith_mobile_v5.2.1.lua', '../example/zenith_mobile_v5.2.1.lua', './zenith_mobile_v5.2.1.lua'] },
    { id: 'r4', name: 'zenith_pc_v5.3.1.lua', paths: ['c:/Users/meqda/.gemini/antigravity/scratch/example/zenith_pc_v5.3.1.lua', '../example/zenith_pc_v5.3.1.lua', './zenith_pc_v5.3.1.lua'] }
];

async function syncAll() {
    try {
        console.log("📡 Starting Cloud Sync...");
        const res = await axios.get(FIREBASE_URL);
        const db = res.data || { users: [], repos: [], keys: [], notifications: 0 };

        let updateCount = 0;

        for (const f of FILES) {
            let content = null;
            // Find the first path that actually exists
            for (const p of f.paths) {
                const resolved = path.resolve(__dirname, p);
                if (fs.existsSync(resolved)) {
                    content = fs.readFileSync(resolved, 'utf-8');
                    break;
                }
            }

            if (content) {
                let repo = db.repos.find(r => r.id === f.id);
                if (!repo) {
                    repo = { id: f.id, name: f.id, files: [], owner: 'yahia', status: 'Private' };
                    db.repos.push(repo);
                }

                let file = repo.files.find(fo => fo.name === f.name || fo.name.includes('tp'));
                if (file) {
                    file.content = content;
                } else {
                    repo.files.push({ name: f.name, content: content, type: 'file' });
                }
                updateCount++;
                console.log(`✅ Ready to sync: ${f.name}`);
            } else {
                console.warn(`⚠️ Skipped: ${f.name} (File not found)`);
            }
        }

        // CRITICAL PROTECTION: Never push if nothing was found
        if (updateCount === 0) {
            console.error("⛔ [SYNC BLOCKED] No local files were found. Firebase will NOT be updated to prevent wipe.");
            return;
        }

        await axios.put(FIREBASE_URL, db);
        console.log(`🚀 SUCCESS: ${updateCount} scripts pushed to Cloud.`);
    } catch (e) {
        console.error("❌ Sync Error:", e.message);
    }
}

syncAll();
