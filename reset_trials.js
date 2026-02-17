import axios from 'axios';

const FIREBASE_URL = 'https://vanderhub-default-rtdb.firebaseio.com/.json';

async function resetTrials() {
    try {
        console.log("🌀 Fetching database...");
        const res = await axios.get(FIREBASE_URL);
        const db = res.data;

        if (!db || !db.keys) {
            console.log("❌ No keys found in database.");
            return;
        }

        const initialCount = db.keys.length;
        // Keep only non-trial keys (or you can just delete the trial keys associated with the user's HWID, but wiping all trials is cleaner for a full reset)
        db.keys = db.keys.filter(key => key.type !== 'trial');

        const removedCount = initialCount - db.keys.length;
        console.log(`🧹 Removed ${removedCount} trial keys from the database.`);

        await axios.put(FIREBASE_URL, db);
        console.log("✅ Database reset. You can now claim a free trial again!");

    } catch (e) {
        console.error("❌ Error resetting trials:", e.message);
    }
}

resetTrials();
