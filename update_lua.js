import axios from 'axios';
import fs from 'fs';

const FIREBASE_URL = 'https://vanderhub-default-rtdb.firebaseio.com/.json';
const LUA_PATH = 'c:/Users/meqda/.gemini/antigravity/scratch/qwery-tp-block/vander_tp_mobile.lua';

async function updateRepo() {
    try {
        const luaContent = fs.readFileSync(LUA_PATH, 'utf-8');
        const res = await axios.get(FIREBASE_URL);
        const db = res.data;

        // Find r1 and update vander_tp_mobile.lua
        const repo = db.repos.find(r => r.id === 'r1');
        if (repo) {
            const file = repo.files.find(f => f.name === 'vander_tp_mobile.lua');
            if (file) {
                file.content = luaContent;
                console.log("Updated vander_tp_mobile.lua in r1");
            } else {
                repo.files.push({ name: 'vander_tp_mobile.lua', content: luaContent, type: 'file' });
                console.log("Added vander_tp_mobile.lua to r1");
            }
        }

        await axios.put(FIREBASE_URL, db);
        console.log("✅ Database updated successfully");
    } catch (e) {
        console.error("❌ Error:", e.message);
    }
}

updateRepo();
