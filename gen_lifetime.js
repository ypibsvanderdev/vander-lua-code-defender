import axios from 'axios';

const FIREBASE_URL = 'https://vanderhub-default-rtdb.firebaseio.com/.json';

async function generateLifetimeKey() {
    try {
        console.log("🌀 Fetching database...");
        const res = await axios.get(FIREBASE_URL);
        const db = res.data;

        if (!db) {
            console.log("❌ Could not fetch database.");
            return;
        }

        db.keys = db.keys || [];

        // Generate a unique lifetime key
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const seg = () => { let s = ''; for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)]; return s; };
        const lifetimeKey = `LIFE-${seg()}-${seg()}-${seg()}`;

        const newKey = {
            id: lifetimeKey,
            type: 'lifetime',
            used: false,
            createdAt: new Date().toISOString(),
            expiresAt: null // Lifetime access
        };

        db.keys.push(newKey);

        await axios.put(FIREBASE_URL, db);
        console.log(`\n👑 LIFETIME KEY GENERATED: ${lifetimeKey}`);
        console.log("✅ Key added to database and ready for use.");

    } catch (e) {
        console.error("❌ Error generating lifetime key:", e.message);
    }
}

generateLifetimeKey();
