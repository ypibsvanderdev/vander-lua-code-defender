import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, 'vanderhub_db.json');
const FIREBASE_URL = 'https://vanderhub-default-rtdb.firebaseio.com/.json';

async function migrate() {
    if (!fs.existsSync(DB_PATH)) {
        console.log("No local database found. Skipping migration.");
        return;
    }

    try {
        console.log("Reading local database...");
        const localData = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));

        console.log("Uploading to Firebase...");
        await axios.put(FIREBASE_URL, localData);

        console.log("✅ MIGRATION SUCCESSFUL! Your data is now safe in the cloud.");
    } catch (e) {
        console.error("❌ MIGRATION FAILED:", e.message);
    }
}

migrate();
