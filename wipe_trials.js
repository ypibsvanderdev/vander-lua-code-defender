import axios from 'axios';

const FIREBASE_URL = 'https://vanderhub-default-rtdb.firebaseio.com/.json';

async function wipeTrials() {
    try {
        console.log("🌀 Fetching database...");
        const res = await axios.get(FIREBASE_URL);
        const db = res.data;

        if (!db || !db.keys) {
            console.log("❌ No keys found in database.");
            return;
        }

        let wipedCount = 0;
        const pastDate = new Date('2024-01-01').toISOString();

        db.keys = db.keys.map(key => {
            if (key.type === 'trial') {
                wipedCount++;
                return { ...key, expiresAt: pastDate };
            }
            return key;
        });

        console.log(`🧹 Found ${wipedCount} trial keys. Setting expiration to 2024...`);

        await axios.put(FIREBASE_URL, db);
        console.log("✅ Database updated. All trials are now EXPIRED.");

    } catch (e) {
        console.error("❌ Error wiping trials:", e.message);
    }
}

wipeTrials();
