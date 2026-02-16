# 🚀 VanderHub

A premium GitHub clone built with React + Express. Host your scripts privately and serve them via raw URLs.

## Features
- 🔒 Repositories auto-set to **Private** by default
- 📁 Create, edit, and delete files in the browser
- 🔗 Raw URL endpoint for loading scripts (works with Roblox executors)
- 🐛 Issue tracker
- ⭐ Star system
- 👤 Profile, Settings, Notifications
- 💎 Premium dark mode UI with glassmorphism

## Setup

```bash
npm install
npm run start
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Backend server port |

## Raw Script Loading

Any file in a repo can be fetched via:
```
GET /raw/:repoId/:filename
```

For Roblox:
```lua
loadstring(game:HttpGet("https://YOUR-DOMAIN/raw/REPO_ID/script.lua"))()
```

## License
Private - VanderHub © 2026
