import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BLACKLIST_PATH = path.join(__dirname, 'firewall_blacklist.json');

/**
 * Vander-Firewall v1.0
 * Behavioral IP-Blocking & Threat Mitigation
 */
class VanderFirewall {
    constructor() {
        this.blacklist = this.loadBlacklist();
        this.suspicionMap = new Map(); // IP -> { score, lastSeen }
        this.BAN_THRESHOLD = 5; // Max violations before perma-ban
        this.VIOLATION_TIMEOUT = 10 * 60 * 1000; // 10 minutes to reset score
    }

    loadBlacklist() {
        if (fs.existsSync(BLACKLIST_PATH)) {
            try {
                return JSON.parse(fs.readFileSync(BLACKLIST_PATH, 'utf-8'));
            } catch { return []; }
        }
        return [];
    }

    saveBlacklist() {
        fs.writeFileSync(BLACKLIST_PATH, JSON.stringify(this.blacklist, null, 2));
    }

    isBanned(ip) {
        return this.blacklist.includes(ip);
    }

    /**
     * Records a security violation (401, 403, 404 on sensitive paths)
     */
    addViolation(ip, reason = "Unknown") {
        if (this.isBanned(ip)) return;

        let entry = this.suspicionMap.get(ip) || { score: 0, lastSeen: Date.now() };

        // Reset score if they've been quiet for a while
        if (Date.now() - entry.lastSeen > this.VIOLATION_TIMEOUT) {
            entry.score = 0;
        }

        entry.score += 1;
        entry.lastSeen = Date.now();
        this.suspicionMap.set(ip, entry);

        console.warn(`[FIREWALL] Violation from ${ip}: ${reason} (Score: ${entry.score}/${this.BAN_THRESHOLD})`);

        if (entry.score >= this.BAN_THRESHOLD) {
            this.blacklist.push(ip);
            this.saveBlacklist();
            console.error(`[FIREWALL] IP PERMA-BANNED: ${ip}`);
        }
    }

    middleware() {
        return (req, res, next) => {
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

            if (this.isBanned(ip)) {
                console.log(`[FIREWALL] Blocked banned visitor: ${ip}`);
                return res.status(403).send('-- FIREWALL BLOCK: Your IP is blacklisted due to recurring security violations.');
            }

            // Trap bot-specific paths
            const botPaths = ['/wp-admin', '/.env', '/config', '/phpmyadmin', '/api/debug'];
            if (botPaths.some(p => req.url.toLowerCase().includes(p))) {
                this.addViolation(ip, `Attempted access to sensitive path: ${req.url}`);
                return res.status(404).send('Not Found');
            }

            // Hook into response to watch for 403s/401s from the app
            const originalSend = res.send;
            res.send = (body) => {
                if (res.statusCode === 401 || res.statusCode === 403) {
                    this.addViolation(ip, `Application rejected request with ${res.statusCode}`);
                }
                return originalSend.call(res, body);
            };

            next();
        };
    }
}

export const firewall = new VanderFirewall();
