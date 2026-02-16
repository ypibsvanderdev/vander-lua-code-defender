import { useState, useEffect, useRef } from 'react'
import {
    Github, Plus, BookOpen, Code2, GitPullRequest, CircleDot, PlayCircle,
    Star, GitBranch, File, ChevronRight, Bell, Layers, Search, Lock, Eye,
    Settings, X, PlusCircle, ShieldCheck, Package, User, LogOut, Copy,
    Check, Trash2, Edit3, ChevronDown, Globe, ExternalLink, FileText,
    AlertCircle, Rocket, Heart
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const API = window.location.origin.includes('localhost') ? "http://localhost:3001/api" : "/api";
const RAW = window.location.origin.includes('localhost') ? "http://localhost:3001/raw" : "/raw";

function App() {
    // --- STATE ---
    const [view, setView] = useState('login');
    const [repos, setRepos] = useState([]);
    const [selectedRepo, setSelectedRepo] = useState(null);
    const [activeTab, setActiveTab] = useState('code');
    const [copied, setCopied] = useState(false);

    // Authentication State
    const [user, setUser] = useState(JSON.parse(localStorage.getItem('vander_hub_user')) || null);
    const [isKeyVerified, setIsKeyVerified] = useState(localStorage.getItem('vander_key_verified') === 'true');
    const [accessKey, setAccessKey] = useState('');
    const [loginUsername, setLoginUsername] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [authError, setAuthError] = useState('');

    // Modals
    const [showNewRepo, setShowNewRepo] = useState(false);
    const [showAddFile, setShowAddFile] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const [showNewMenu, setShowNewMenu] = useState(false);
    const [showNotifs, setShowNotifs] = useState(false);
    const [viewingFile, setViewingFile] = useState(null);
    const [editingFile, setEditingFile] = useState(false);
    const [editContent, setEditContent] = useState('');
    const [showSettings, setShowSettings] = useState(false);

    // New Repo
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newPrivate, setNewPrivate] = useState(true);

    // Add File
    const [fileName, setFileName] = useState('');
    const [fileContent, setFileContent] = useState('');

    // New Issue
    const [newIssueTitle, setNewIssueTitle] = useState('');

    const notifications = [
        { id: 1, text: 'Vander Lua Code Defender is ready!', time: '1m ago' },
        { id: 2, text: 'Welcome to the new Hub.', time: '5m ago' }
    ];

    // --- API CALLS ---
    const fetchRepos = async () => {
        try {
            const r = await fetch(`${API}/repos`);
            const d = await r.json();
            setRepos(d);
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        if (user) {
            fetchRepos();
            if (view === 'login' || view === 'signup') setView('dashboard');
        }
    }, [user]);

    const handleSignup = async () => {
        if (!loginUsername || !loginPassword) return setAuthError('Missing fields');
        try {
            const r = await fetch(`${API}/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: loginUsername, password: loginPassword })
            });
            const d = await r.json();
            if (d.success) {
                setUser(d.user);
                localStorage.setItem('vander_hub_user', JSON.stringify(d.user));
                setAuthError('');
            } else { setAuthError(d.error); }
        } catch (e) { setAuthError('Connection failed'); }
    };

    const handleLogin = async () => {
        if (!loginUsername || !loginPassword) return setAuthError('Missing fields');
        try {
            const r = await fetch(`${API}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: loginUsername, password: loginPassword })
            });
            const d = await r.json();
            if (d.success) {
                setUser(d.user);
                localStorage.setItem('vander_hub_user', JSON.stringify(d.user));
                setAuthError('');
            } else { setAuthError(d.error); }
        } catch (e) { setAuthError('Connection failed'); }
    };

    const handleLogout = () => {
        setUser(null);
        localStorage.removeItem('vander_hub_user');
        setView('login');
    };

    const handleVerifyKey = async () => {
        if (!accessKey.trim()) return setAuthError('Please enter a key');
        try {
            const r = await fetch(`${API}/verify-key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: accessKey.trim(), hwid: navigator.userAgent }) // Simple HWID simulation
            });
            const d = await r.json();
            if (d.success) {
                setIsKeyVerified(true);
                localStorage.setItem('vander_key_verified', 'true');
                setAuthError('');
            } else { setAuthError(d.error); }
        } catch (e) { setAuthError('Connection failed'); }
    };

    const createRepo = async () => {
        if (!newName.trim() || !user) return;
        await fetch(`${API}/repos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: newName.trim().replace(/\s+/g, '-').toLowerCase(),
                desc: newDesc,
                status: newPrivate ? 'Private' : 'Public',
                owner: user.username
            })
        });
        setShowNewRepo(false);
        setNewName(''); setNewDesc(''); setNewPrivate(true);
        fetchRepos();
    };

    const addFile = async () => {
        if (!fileName.trim() || !selectedRepo || !user) return;
        await fetch(`${API}/repos/${selectedRepo.id}/files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: fileName.trim(), content: fileContent, username: user.username })
        });
        setShowAddFile(false);
        setFileName(''); setFileContent('');
        refreshRepo();
    };

    const saveEdit = async () => {
        if (!viewingFile || !selectedRepo || !user) return;
        await fetch(`${API}/repos/${selectedRepo.id}/files/${viewingFile.name}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: editContent, commitMsg: `Update ${viewingFile.name}`, username: user.username })
        });
        setEditingFile(false);
        setViewingFile({ ...viewingFile, content: editContent });
        refreshRepo();
    };

    const deleteFile = async (fname) => {
        if (!selectedRepo || !user) return;
        await fetch(`${API}/repos/${selectedRepo.id}/files/${fname}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user.username })
        });
        setViewingFile(null);
        refreshRepo();
    };

    const deleteRepo = async (id) => {
        if (!window.confirm("Are you sure you want to delete this repository? This action cannot be undone.")) return;
        await fetch(`${API}/repos/${id}`, { method: 'DELETE' });
        setView('dashboard');
        setSelectedRepo(null);
        fetchRepos();
    };

    const starRepo = async (id) => {
        await fetch(`${API}/repos/${id}/star`, { method: 'POST' });
        refreshRepo();
        fetchRepos();
    };

    const createIssue = async () => {
        if (!newIssueTitle.trim() || !selectedRepo || !user) return;
        await fetch(`${API}/repos/${selectedRepo.id}/issues`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newIssueTitle, author: user.username })
        });
        setNewIssueTitle('');
        refreshRepo();
    };

    const refreshRepo = async () => {
        const r = await fetch(`${API}/repos`);
        const d = await r.json();
        setRepos(d);
        if (selectedRepo) {
            const updated = d.find(x => x.id === selectedRepo.id);
            if (updated) setSelectedRepo(updated);
        }
    };

    const openRepo = (repo) => {
        setSelectedRepo(repo);
        setView('repo');
        setActiveTab('code');
        setViewingFile(null);
        setEditingFile(false);
    };

    const copyRaw = (repoId, fname) => {
        const fullURL = `${window.location.origin}${RAW}/${repoId}/${encodeURIComponent(fname)}?key=vander2026`;
        navigator.clipboard.writeText(fullURL);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const copyLoadstring = (repoId, fname) => {
        const fullURL = `${window.location.origin}${RAW}/${repoId}/${encodeURIComponent(fname)}?key=vander2026`;
        const url = `loadstring(game:HttpGet("${fullURL}"))()`;
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // --- CLOSE DROPDOWNS ON OUTSIDE CLICK ---
    useEffect(() => {
        const handler = () => { setShowProfile(false); setShowNewMenu(false); setShowNotifs(false); };
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, []);

    // ==================== RENDER ====================
    if (!isKeyVerified) {
        return (
            <div style={{ height: '100vh', width: '100vw', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '40%', height: '40%', background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)', filter: 'blur(100px)', opacity: 0.3 }}></div>
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="repo-card"
                    style={{ width: '420px', padding: '48px', textAlign: 'center', position: 'relative', zIndex: 10, cursor: 'default' }}
                >
                    <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(0, 255, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px' }}>
                        <Lock size={36} color="var(--accent-color)" />
                    </div>
                    <h1 style={{ fontSize: '28px', fontWeight: 800, margin: '0 0 10px', letterSpacing: '-0.5px' }}>Access Protocol</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '36px' }}>Enter your security key to unlock the ecosystem.</p>

                    <div className="input-group" style={{ textAlign: 'left', marginBottom: '24px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', display: 'block' }}>SECURITY KEY</label>
                        <input
                            type="text"
                            className="search-box"
                            style={{ width: '100%', padding: '12px' }}
                            placeholder="VANDER-XXXX-XXXX"
                            value={accessKey}
                            onChange={(e) => setAccessKey(e.target.value)}
                        />
                    </div>

                    {authError && <div style={{ color: '#f85149', fontSize: '12px', marginBottom: '20px' }}>{authError}</div>}

                    <button className="btn" style={{ width: '100%', padding: '12px', background: 'var(--accent-color)', color: '#0d1117', marginBottom: '20px' }} onClick={handleVerifyKey}>
                        Verify Access
                    </button>

                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Don't have a key? <a href="https://ypibsvanderdev.github.io/keys-for-website/" target="_blank" style={{ color: 'var(--accent-color)', textDecoration: 'none' }}>Get access here</a>
                    </p>
                </motion.div>
            </div>
        );
    }

    if (!user) {
        const isLogin = view === 'login';
        return (
            <div style={{ height: '100vh', width: '100vw', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '40%', height: '40%', background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)', filter: 'blur(100px)', opacity: 0.3 }}></div>
                <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '40%', height: '40%', background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)', filter: 'blur(100px)', opacity: 0.3 }}></div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="repo-card"
                    style={{ width: '420px', padding: '48px', textAlign: 'center', position: 'relative', zIndex: 10, cursor: 'default' }}
                >
                    <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(0, 255, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px' }}>
                        <ShieldCheck size={36} color="var(--accent-color)" />
                    </div>
                    <h1 style={{ fontSize: '28px', fontWeight: 800, margin: '0 0 10px', letterSpacing: '-0.5px' }}>
                        {isLogin ? 'Welcome Back' : 'Create Account'}
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '36px' }}>
                        {isLogin ? 'Login to access your protected scripts' : 'Sign up for Vander Lua Code Defender'}
                    </p>

                    <div style={{ textAlign: 'left', marginBottom: '20px' }}>
                        <label className="form-label" style={{ fontSize: '12px', marginBottom: '8px' }}>Username</label>
                        <div style={{ position: 'relative' }}>
                            <User size={16} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                            <input
                                type="text"
                                className="search-box form-input"
                                style={{ width: '100%', paddingLeft: '44px' }}
                                placeholder="Enter username"
                                value={loginUsername}
                                onChange={e => setLoginUsername(e.target.value)}
                            />
                        </div>
                    </div>

                    <div style={{ textAlign: 'left', marginBottom: '32px' }}>
                        <label className="form-label" style={{ fontSize: '12px', marginBottom: '8px' }}>Secret Key</label>
                        <div style={{ position: 'relative' }}>
                            <Lock size={16} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                            <input
                                type="password"
                                className="search-box form-input"
                                style={{ width: '100%', paddingLeft: '44px' }}
                                placeholder="••••••••••••"
                                value={loginPassword}
                                onChange={e => setLoginPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <AnimatePresence>
                        {authError && (
                            <motion.p
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                style={{ color: 'var(--danger-color)', fontSize: '13px', marginTop: '-16px', marginBottom: '20px', fontWeight: 600 }}
                            >
                                <AlertCircle size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                                {authError}
                            </motion.p>
                        )}
                    </AnimatePresence>

                    <button
                        className="btn-primary btn"
                        style={{ width: '100%', padding: '14px', fontSize: '15px', justifyContent: 'center', marginBottom: '24px' }}
                        onClick={isLogin ? handleLogin : handleSignup}
                    >
                        {isLogin ? 'Sign In' : 'Create Account'}
                    </button>

                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                        {isLogin ? "Don't have an account? " : "Already have an account? "}
                        <span
                            style={{ color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 600 }}
                            onClick={() => { setView(isLogin ? 'signup' : 'login'); setAuthError(''); }}
                        >
                            {isLogin ? 'Sign Up' : 'Log In'}
                        </span>
                    </p>

                    <div style={{ marginTop: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: 0.4 }}>
                        <Rocket size={14} />
                        <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px' }}>VANDER SECURITY PROTOCOL v3.0</span>
                    </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>

            {/* ========== HEADER ========== */}
            <header className="header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <Github size={32} color="#e6edf3" style={{ cursor: 'pointer' }} onClick={() => { setView('dashboard'); setShowSettings(false); }} />
                    <span style={{ fontWeight: 800, fontSize: '18px', cursor: 'pointer', letterSpacing: '-0.5px' }} onClick={() => { setView('dashboard'); setShowSettings(false); }}>Vander Lua Code Defender</span>
                    <div style={{ position: 'relative', marginLeft: '12px' }}>
                        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#7d8590' }} />
                        <input type="text" className="search-box" placeholder="Search Protected Scripts..." style={{ paddingLeft: '36px' }} />
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {/* + New Menu */}
                    <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                        <div className="header-icon" onClick={() => { setShowNewMenu(!showNewMenu); setShowNotifs(false); setShowProfile(false); }}>
                            <Plus size={18} />
                            <ChevronDown size={12} />
                        </div>
                        {showNewMenu && (
                            <div className="dropdown" style={{ right: 0, width: '200px' }}>
                                <div className="dropdown-item" onClick={() => { setShowNewRepo(true); setShowNewMenu(false); }}>
                                    <BookOpen size={16} /> New repository
                                </div>
                                <div className="dropdown-item" onClick={() => { if (selectedRepo) { setShowAddFile(true); setShowNewMenu(false); } }}>
                                    <FileText size={16} /> New file
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Issues */}
                    <div className="header-icon" onClick={() => { if (selectedRepo) { setView('repo'); setActiveTab('issues'); } }}>
                        <CircleDot size={18} />
                    </div>

                    {/* Pull Requests */}
                    <div className="header-icon" onClick={() => { if (selectedRepo) { setView('repo'); setActiveTab('pulls'); } }}>
                        <GitPullRequest size={18} />
                    </div>

                    {/* Notifications */}
                    <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                        <div className="header-icon" onClick={() => { setShowNotifs(!showNotifs); setShowNewMenu(false); setShowProfile(false); }} style={{ position: 'relative' }}>
                            <Bell size={18} />
                            {notifications.length > 0 && <div className="notif-dot"></div>}
                        </div>
                        {showNotifs && (
                            <div className="dropdown" style={{ right: 0, width: '320px' }}>
                                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', fontWeight: 600 }}>Notifications</div>
                                {notifications.map(n => (
                                    <div key={n.id} className="dropdown-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                                        <span style={{ fontSize: '13px' }}>{n.text}</span>
                                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{n.time}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Profile Avatar */}
                    <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                        <div
                            onClick={() => { setShowProfile(!showProfile); setShowNewMenu(false); setShowNotifs(false); }}
                            style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #00ffff, #2f81f7)', border: '2px solid var(--border-color)', cursor: 'pointer', marginLeft: '8px' }}
                        ></div>
                        {showProfile && (
                            <div className="dropdown" style={{ right: 0, width: '240px' }}>
                                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                                    <div style={{ fontWeight: 700, fontSize: '15px' }}>{user.username}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Protected Member</div>
                                </div>
                                <div className="dropdown-item" onClick={() => { setView('profile'); setShowProfile(false); setShowSettings(false); }}>
                                    <User size={16} /> Your profile
                                </div>
                                <div className="dropdown-item" onClick={() => { setView('dashboard'); setShowProfile(false); setShowSettings(false); }}>
                                    <BookOpen size={16} /> Your repositories
                                </div>
                                <div className="dropdown-item" onClick={() => { setView('dashboard'); setShowProfile(false); }}>
                                    <Star size={16} /> Your stars
                                </div>
                                <div style={{ borderTop: '1px solid var(--border-color)' }}>
                                    <div className="dropdown-item" onClick={() => { setShowSettings(true); setView('settings'); setShowProfile(false); }}>
                                        <Settings size={16} /> Settings
                                    </div>
                                </div>
                                <div style={{ borderTop: '1px solid var(--border-color)' }}>
                                    <div className="dropdown-item" style={{ color: '#f85149' }} onClick={handleLogout}>
                                        <LogOut size={16} /> Sign out
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* ========== MAIN CONTENT ========== */}
            <AnimatePresence mode="wait">

                {/* ===== DASHBOARD ===== */}
                {view === 'dashboard' && (
                    <motion.div key="dash" className="layout" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <aside className="sidebar">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <span style={{ fontSize: '14px', fontWeight: 600 }}>Top Repositories</span>
                                <button className="btn-primary btn" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setShowNewRepo(true)}>
                                    <BookOpen size={14} style={{ marginRight: '4px' }} /> New
                                </button>
                            </div>
                            <input type="text" placeholder="Find a repository..." className="search-box" style={{ width: '100%', fontSize: '13px', marginBottom: '16px' }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {repos.map(r => (
                                    <div key={r.id} className="nav-item" onClick={() => openRepo(r)}>
                                        {r.status === 'Private' ? <Lock size={14} color="#8b949e" /> : <Globe size={14} color="#238636" />}
                                        <span style={{ flex: 1 }}>{r.owner} / <b>{r.name}</b></span>
                                    </div>
                                ))}
                            </div>
                        </aside>
                        <main className="main-content">
                            <h2 style={{ marginTop: 0, fontSize: '20px', marginBottom: '24px' }}>
                                <Package size={22} color="var(--accent-color)" style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                                Activity Dashboard
                            </h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                                {repos.map(r => (
                                    <div key={r.id} className="repo-card" onClick={() => openRepo(r)}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' }}>
                                            <span style={{ color: 'var(--accent-color)', fontWeight: 600, fontSize: '16px' }}>{r.name}</span>
                                            <span className="badge">{r.status === 'Private' ? '🔒 Private' : '🌐 Public'}</span>
                                        </div>
                                        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', minHeight: '36px', margin: '0 0 16px 0' }}>{r.desc}</p>
                                        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Star size={14} /> {r.stars}</span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><GitBranch size={14} /> {r.forks}</span>
                                            <span style={{ marginLeft: 'auto' }}>{r.lang}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </main>
                    </motion.div>
                )}

                {/* ===== PROFILE PAGE ===== */}
                {view === 'profile' && (
                    <motion.div key="profile" style={{ flex: 1, padding: '48px max(64px, 10%)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div style={{ display: 'flex', gap: '48px', alignItems: 'flex-start' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ width: 260, height: 260, borderRadius: '50%', background: 'linear-gradient(135deg, #00ffff, #2f81f7, #a855f7)', margin: '0 auto 20px', border: '4px solid var(--border-color)' }}></div>
                                <h2 style={{ margin: '0 0 4px 0', fontSize: '26px' }}>{user.username}</h2>
                                <p style={{ color: 'var(--text-secondary)', margin: '0 0 16px' }}>Protected Scripts Developer</p>
                                <button className="btn" style={{ width: '100%', padding: '8px' }}>Edit profile</button>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '16px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                                    <span><b style={{ color: 'var(--text-primary)' }}>0</b> followers</span>
                                    <span><b style={{ color: 'var(--text-primary)' }}>0</b> following</span>
                                </div>
                                <div style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                    <Rocket size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} /> Member since Feb 2026
                                </div>
                            </div>
                            <div style={{ flex: 1 }}>
                                <h3 style={{ marginTop: 0 }}>Repositories ({repos.length})</h3>
                                {repos.map(r => (
                                    <div key={r.id} className="repo-card" onClick={() => openRepo(r)}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ color: 'var(--accent-color)', fontWeight: 600, fontSize: '16px' }}>{r.name}</span>
                                            <span className="badge">{r.status}</span>
                                        </div>
                                        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '8px 0 0' }}>{r.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* ===== SETTINGS PAGE ===== */}
                {view === 'settings' && (
                    <motion.div key="settings" style={{ flex: 1, padding: '48px max(64px, 10%)', maxWidth: '900px' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <h2 style={{ marginTop: 0 }}><Settings size={24} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> Settings</h2>
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                            {[
                                { label: 'Profile', desc: 'Change your display name, bio, and avatar.' },
                                { label: 'Account', desc: 'Manage your password and authentication.' },
                                { label: 'Appearance', desc: 'Customize your VanderHub experience.' },
                                { label: 'Notifications', desc: 'Choose what notifications you receive.' },
                                { label: 'Developer Settings', desc: 'Manage API tokens and webhooks.' },
                                { label: 'Danger Zone', desc: 'Delete your account or data.', danger: true }
                            ].map((s, i) => (
                                <div key={i} className="nav-item" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', borderRadius: 0 }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, color: s.danger ? '#f85149' : 'var(--text-primary)' }}>{s.label}</div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>{s.desc}</div>
                                    </div>
                                    <ChevronRight size={18} color="var(--text-secondary)" />
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* ===== REPO VIEW ===== */}
                {view === 'repo' && selectedRepo && (
                    <motion.div key="repo" style={{ flex: 1, padding: '32px max(32px, 5%)' }} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

                        {/* Repo Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', fontSize: '20px' }}>
                                    <BookOpen size={22} color="var(--text-secondary)" />
                                    <span style={{ color: 'var(--accent-color)', fontWeight: 500 }}>{selectedRepo.owner}</span>
                                    <span style={{ color: 'var(--border-color)' }}>/</span>
                                    <span style={{ fontWeight: 800 }}>{selectedRepo.name}</span>
                                    {selectedRepo.status === 'Private' ? <Lock size={16} color="#8b949e" /> : <Eye size={16} color="#238636" />}
                                    <span className="badge">{selectedRepo.status}</span>
                                </div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>{selectedRepo.desc}</p>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button className="btn" onClick={() => starRepo(selectedRepo.id)}><Star size={16} /> Star <span style={{ opacity: .6, marginLeft: '4px' }}>{selectedRepo.stars}</span></button>
                                <button className="btn"><GitBranch size={16} /> Fork <span style={{ opacity: .6, marginLeft: '4px' }}>{selectedRepo.forks}</span></button>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div style={{ display: 'flex', gap: '24px', borderBottom: '1px solid var(--border-color)', marginBottom: '24px', overflowX: 'auto' }}>
                            {[
                                { id: 'code', icon: <Code2 size={16} />, label: 'Code' },
                                { id: 'issues', icon: <CircleDot size={16} />, label: `Issues (${selectedRepo.issues.length})` },
                                { id: 'pulls', icon: <GitPullRequest size={16} />, label: 'Pull Requests' },
                                { id: 'actions', icon: <PlayCircle size={16} />, label: 'Actions' },
                                { id: 'security', icon: <ShieldCheck size={16} />, label: 'Security' },
                                { id: 'settings', icon: <Settings size={16} />, label: 'Settings' }
                            ].map(t => (
                                <div key={t.id} className={`nav-item ${activeTab === t.id ? 'active' : ''}`} onClick={() => { setActiveTab(t.id); setViewingFile(null); setEditingFile(false); }}
                                    style={{ borderRadius: 0, padding: '0 4px 14px', borderBottom: activeTab === t.id ? '2px solid #f78166' : 'none', background: 'transparent', gap: '8px' }}>
                                    {t.icon} <span style={{ fontWeight: activeTab === t.id ? 600 : 400 }}>{t.label}</span>
                                </div>
                            ))}
                        </div>

                        {/* ---- CODE TAB ---- */}
                        {activeTab === 'code' && !viewingFile && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                    <button className="btn"><GitBranch size={14} /> main <ChevronDown size={12} /></button>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button className="btn" onClick={() => setShowAddFile(true)}><Plus size={14} /> Add file</button>
                                        <button className="btn-primary btn"><Code2 size={14} /> Code <ChevronDown size={12} /></button>
                                    </div>
                                </div>
                                <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                                    <div style={{ background: 'var(--bg-secondary)', padding: '14px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
                                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(45deg, #2f81f7, #00ffff)' }}></div>
                                        <b>{selectedRepo.owner}</b>
                                        <span style={{ color: 'var(--text-secondary)' }}>{selectedRepo.commits[0]?.msg}</span>
                                        <span style={{ marginLeft: 'auto', color: 'var(--text-secondary)', fontSize: '12px' }}>{selectedRepo.commits[0]?.hash} · {selectedRepo.commits[0]?.time}</span>
                                    </div>
                                    {selectedRepo.files.map(f => (
                                        <div key={f.name} className="nav-item" style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)', borderRadius: 0, gap: '14px' }}
                                            onClick={() => { if (f.type === 'file') { setViewingFile(f); setEditContent(f.content); setEditingFile(false); } }}>
                                            {f.type === 'folder' ? <Layers size={18} color="#7d8590" /> : <File size={18} color="#7d8590" />}
                                            <span style={{ flex: 1 }}>{f.name}</span>
                                            <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{selectedRepo.commits[0]?.msg}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ---- FILE VIEWER ---- */}
                        {activeTab === 'code' && viewingFile && (
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                                    <button className="btn" onClick={() => { setViewingFile(null); setEditingFile(false); }}>← Back to files</button>
                                    <span style={{ fontWeight: 600, fontSize: '16px' }}>{viewingFile.name}</span>
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                                        {/* RAW BUTTON */}
                                        <button className="btn" onClick={() => copyRaw(selectedRepo.id, viewingFile.name)} title="Copy Raw URL">
                                            {copied ? <Check size={14} /> : <Copy size={14} />} Raw
                                        </button>
                                        {/* LOADSTRING BUTTON */}
                                        <button className="btn" onClick={() => copyLoadstring(selectedRepo.id, viewingFile.name)} style={{ borderColor: '#f0883e', color: '#f0883e' }}>
                                            <Rocket size={14} /> Copy Loadstring
                                        </button>
                                        <button className="btn" onClick={() => { setEditingFile(!editingFile); setEditContent(viewingFile.content); }}>
                                            <Edit3 size={14} /> {editingFile ? 'Cancel' : 'Edit'}
                                        </button>
                                        <button className="btn" style={{ borderColor: '#f85149', color: '#f85149' }} onClick={() => deleteFile(viewingFile.name)}>
                                            <Trash2 size={14} /> Delete
                                        </button>
                                    </div>
                                </div>

                                {/* Raw URL Display */}
                                <div style={{ background: '#161b22', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '10px 16px', marginBottom: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <ExternalLink size={14} color="var(--text-secondary)" />
                                    <code style={{ color: '#7ee787', flex: 1 }}>{window.location.origin}{RAW}/{selectedRepo.id}/{encodeURIComponent(viewingFile.name)}?key=vander2026</code>
                                    <button className="btn" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => copyRaw(selectedRepo.id, viewingFile.name)}>
                                        {copied ? <Check size={12} /> : <Copy size={12} />}
                                    </button>
                                </div>

                                {/* Auto Loadstring Box */}
                                <div style={{ background: 'linear-gradient(135deg, rgba(240,136,62,0.08), rgba(240,136,62,0.03))', border: '1px solid rgba(240,136,62,0.3)', borderRadius: '6px', padding: '12px 16px', marginBottom: '16px', cursor: 'pointer' }}
                                    onClick={() => copyLoadstring(selectedRepo.id, viewingFile.name)}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                        <Rocket size={14} color="#f0883e" />
                                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#f0883e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Loadstring — Click to Copy</span>
                                        <div style={{ marginLeft: 'auto' }}>
                                            {copied ? <Check size={14} color="#3fb950" /> : <Copy size={14} color="#f0883e" />}
                                        </div>
                                    </div>
                                    <code style={{ fontSize: '12px', color: '#e6edf3', wordBreak: 'break-all', lineHeight: '1.5', fontFamily: "'JetBrains Mono', monospace" }}>
                                        {`loadstring(game:HttpGet("${window.location.origin}${RAW}/${selectedRepo.id}/${encodeURIComponent(viewingFile.name)}?key=vander2026"))()`}
                                    </code>
                                </div>

                                {editingFile ? (
                                    <div>
                                        <textarea
                                            value={editContent}
                                            onChange={(e) => setEditContent(e.target.value)}
                                            style={{ width: '100%', minHeight: '400px', background: '#0d1117', color: '#e6edf3', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '16px', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', resize: 'vertical', outline: 'none' }}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', gap: '8px' }}>
                                            <button className="btn" onClick={() => setEditingFile(false)}>Cancel</button>
                                            <button className="btn-primary btn" onClick={saveEdit}>Commit changes</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                                        <div style={{ background: 'var(--bg-secondary)', padding: '10px 16px', borderBottom: '1px solid var(--border-color)', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                            {viewingFile.content.split('\n').length} lines
                                        </div>
                                        <pre style={{ margin: 0, padding: '16px', background: '#0d1117', overflowX: 'auto', fontSize: '13px', lineHeight: '1.6' }}>
                                            <code>{viewingFile.content}</code>
                                        </pre>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ---- ISSUES TAB ---- */}
                        {activeTab === 'issues' && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', gap: '12px' }}>
                                    <input type="text" className="search-box" style={{ flex: 1 }} placeholder="New issue title..."
                                        value={newIssueTitle} onChange={(e) => setNewIssueTitle(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') createIssue(); }}
                                    />
                                    <button className="btn-primary btn" onClick={createIssue} disabled={!newIssueTitle.trim()}>New Issue</button>
                                </div>
                                <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                                    <div style={{ background: 'var(--bg-secondary)', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', fontWeight: 600 }}>
                                        <CircleDot size={16} color="#3fb950" style={{ verticalAlign: 'middle', marginRight: '8px' }} /> {selectedRepo.issues.filter(i => i.status === 'Open').length} Open
                                    </div>
                                    {selectedRepo.issues.length === 0 && (
                                        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                            <AlertCircle size={48} style={{ opacity: .15, marginBottom: '12px' }} />
                                            <p>No issues yet. Type a title above and click "New Issue".</p>
                                        </div>
                                    )}
                                    {selectedRepo.issues.map(issue => (
                                        <div key={issue.id} className="nav-item" style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)', borderRadius: 0, gap: '12px' }}>
                                            <CircleDot size={16} color="#3fb950" />
                                            <div>
                                                <div style={{ fontWeight: 600 }}>{issue.title}</div>
                                                <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px' }}>#{issue.id} opened {issue.time} by {issue.author}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ---- PULL REQUESTS TAB ---- */}
                        {activeTab === 'pulls' && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <button className="btn" style={{ background: activeTab === 'pulls' ? 'rgba(47,129,247,0.1)' : '' }}><GitPullRequest size={14} color="#3fb950" /> 0 Open</button>
                                        <button className="btn"><Check size={14} /> 0 Closed</button>
                                    </div>
                                    <button className="btn-primary btn">New pull request</button>
                                </div>
                                <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                                    <div style={{ padding: '60px 40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        <GitPullRequest size={48} style={{ opacity: .15, marginBottom: '16px' }} />
                                        <h3 style={{ color: 'var(--text-primary)', margin: '0 0 8px' }}>Welcome to Pull Requests!</h3>
                                        <p style={{ margin: '0 0 20px', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' }}>
                                            Pull requests help you collaborate on code. Create a branch, make changes, and open a pull request to merge them.
                                        </p>
                                        <button className="btn-primary btn">Create your first pull request</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ---- ACTIONS TAB ---- */}
                        {activeTab === 'actions' && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                    <h3 style={{ margin: 0 }}><PlayCircle size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />Workflow Runs</h3>
                                    <button className="btn-primary btn"><Plus size={14} /> New workflow</button>
                                </div>
                                <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                                    {[
                                        { name: 'Build & Test', status: 'success', branch: 'main', time: '2m ago', duration: '45s' },
                                        { name: 'Deploy to Production', status: 'success', branch: 'main', time: '1h ago', duration: '1m 12s' },
                                        { name: 'Lint Check', status: 'failed', branch: 'dev', time: '3h ago', duration: '22s' }
                                    ].map((run, i) => (
                                        <div key={i} className="nav-item" style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)', borderRadius: 0, gap: '14px' }}>
                                            <div style={{ width: 16, height: 16, borderRadius: '50%', background: run.status === 'success' ? '#238636' : '#da3633', flexShrink: 0 }}></div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600 }}>{run.name}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                                    {run.branch} · {run.time} · {run.duration}
                                                </div>
                                            </div>
                                            <span className="badge" style={{ borderColor: run.status === 'success' ? '#238636' : '#da3633', color: run.status === 'success' ? '#3fb950' : '#f85149' }}>
                                                {run.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ---- SECURITY TAB ---- */}
                        {activeTab === 'security' && (
                            <div>
                                <h3 style={{ margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <ShieldCheck size={22} color="#3fb950" /> Security Overview
                                </h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                                    {[
                                        { label: 'Vulnerabilities', value: '0', color: '#3fb950', icon: <ShieldCheck size={24} /> },
                                        { label: 'Code Scanning', value: 'Active', color: '#2f81f7', icon: <Search size={24} /> },
                                        { label: 'Dependabot', value: 'Enabled', color: '#a855f7', icon: <Package size={24} /> }
                                    ].map((card, i) => (
                                        <div key={i} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '24px', background: 'var(--bg-secondary)' }}>
                                            <div style={{ color: card.color, marginBottom: '12px' }}>{card.icon}</div>
                                            <div style={{ fontSize: '28px', fontWeight: 800, color: card.color }}>{card.value}</div>
                                            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>{card.label}</div>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                                    <div style={{ background: 'var(--bg-secondary)', padding: '14px 20px', borderBottom: '1px solid var(--border-color)', fontWeight: 600 }}>
                                        Security Advisories
                                    </div>
                                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        <ShieldCheck size={40} style={{ opacity: .15, marginBottom: '8px' }} />
                                        <p style={{ margin: 0 }}>No security advisories found. Your repository is secure! ✓</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ---- SETTINGS TAB ---- */}
                        {activeTab === 'settings' && (
                            <div>
                                <h3 style={{ margin: '0 0 24px' }}><Settings size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />General</h3>

                                {/* Repo Name */}
                                <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '20px', marginBottom: '20px', background: 'var(--bg-secondary)' }}>
                                    <label className="form-label">Repository name</label>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <input type="text" className="search-box" style={{ flex: 1, padding: '10px' }} defaultValue={selectedRepo.name} />
                                        <button className="btn">Rename</button>
                                    </div>
                                </div>

                                {/* Description */}
                                <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '20px', marginBottom: '20px', background: 'var(--bg-secondary)' }}>
                                    <label className="form-label">Description</label>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <input type="text" className="search-box" style={{ flex: 1, padding: '10px' }} defaultValue={selectedRepo.desc} />
                                        <button className="btn">Save</button>
                                    </div>
                                </div>

                                {/* Visibility */}
                                <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '20px', marginBottom: '20px', background: 'var(--bg-secondary)' }}>
                                    <label className="form-label">Visibility</label>
                                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 12px' }}>
                                        This repository is currently <b style={{ color: selectedRepo.status === 'Private' ? '#f0883e' : '#3fb950' }}>{selectedRepo.status}</b>.
                                    </p>
                                    <button className="btn" style={{ borderColor: '#f0883e', color: '#f0883e' }}>
                                        {selectedRepo.status === 'Private' ? <><Eye size={14} /> Change to Public</> : <><Lock size={14} /> Change to Private</>}
                                    </button>
                                </div>

                                {/* Default Branch */}
                                <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '20px', marginBottom: '20px', background: 'var(--bg-secondary)' }}>
                                    <label className="form-label">Default branch</label>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                        <button className="btn"><GitBranch size={14} /> main</button>
                                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>The default branch is considered the base branch of your repository.</span>
                                    </div>
                                </div>

                                {/* Danger Zone */}
                                <div style={{ border: '1px solid #da3633', borderRadius: '8px', overflow: 'hidden', marginTop: '32px' }}>
                                    <div style={{ background: 'rgba(218,54,51,0.1)', padding: '14px 20px', borderBottom: '1px solid #da3633', fontWeight: 700, color: '#f85149' }}>
                                        Danger Zone
                                    </div>
                                    {[
                                        { label: 'Transfer ownership', desc: 'Transfer this repository to another user or organization.', btn: 'Transfer' },
                                        { label: 'Archive this repository', desc: 'Mark this repository as archived and read-only.', btn: 'Archive' },
                                        { label: 'Delete this repository', desc: 'Once deleted, there is no going back. Please be certain.', btn: 'Delete', action: () => deleteRepo(selectedRepo.id) }
                                    ].map((item, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: i < 2 ? '1px solid #da3633' : 'none', gap: '16px' }}>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '14px' }}>{item.label}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{item.desc}</div>
                                            </div>
                                            <button className="btn" style={{ borderColor: '#da3633', color: '#f85149', flexShrink: 0 }} onClick={item.action}>{item.btn}</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <button className="btn" onClick={() => setView('dashboard')} style={{ marginTop: '40px', background: 'rgba(255,255,255,0.03)' }}>
                            ← Back to Dashboard
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ========== NEW REPO MODAL ========== */}
            <AnimatePresence>
                {showNewRepo && (
                    <div className="modal-overlay" onClick={() => setShowNewRepo(false)}>
                        <motion.div className="modal" onClick={e => e.stopPropagation()} initial={{ scale: .92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: .92, opacity: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                <h2 style={{ margin: 0 }}>Create a new repository</h2>
                                <X size={24} style={{ cursor: 'pointer' }} onClick={() => setShowNewRepo(false)} />
                            </div>
                            <label className="form-label">Repository name *</label>
                            <input type="text" className="search-box form-input" placeholder="awesome-project" value={newName} onChange={e => setNewName(e.target.value)} />
                            <label className="form-label" style={{ marginTop: '16px' }}>Description (optional)</label>
                            <textarea className="search-box form-input" style={{ height: '80px', resize: 'none' }} placeholder="Short description..." value={newDesc} onChange={e => setNewDesc(e.target.value)} />
                            <div className="radio-group">
                                <div className="radio-option" onClick={() => setNewPrivate(false)}>
                                    <div className={`radio-dot ${!newPrivate ? 'active' : ''}`}></div>
                                    <div><div style={{ fontWeight: 600 }}>Public</div><div className="radio-desc">Anyone can see this repository.</div></div>
                                </div>
                                <div className="radio-option" onClick={() => setNewPrivate(true)}>
                                    <div className={`radio-dot ${newPrivate ? 'active' : ''}`}></div>
                                    <div><div style={{ fontWeight: 600 }}>Private (Default)</div><div className="radio-desc">You choose who can see this repo.</div></div>
                                </div>
                            </div>
                            <button className="btn-primary btn" style={{ width: '100%', padding: '14px', fontSize: '16px', marginTop: '24px' }} onClick={createRepo} disabled={!newName.trim()}>
                                Create repository
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ========== ADD FILE MODAL ========== */}
            <AnimatePresence>
                {showAddFile && (
                    <div className="modal-overlay" onClick={() => setShowAddFile(false)}>
                        <motion.div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }} initial={{ scale: .92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: .92, opacity: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                <h2 style={{ margin: 0 }}>Add file to {selectedRepo?.name}</h2>
                                <X size={24} style={{ cursor: 'pointer' }} onClick={() => setShowAddFile(false)} />
                            </div>
                            <label className="form-label">File name (with extension) *</label>
                            <input type="text" className="search-box form-input" placeholder="my_script.lua" value={fileName} onChange={e => setFileName(e.target.value)} />
                            <label className="form-label" style={{ marginTop: '16px' }}>File content</label>
                            <textarea
                                className="search-box form-input"
                                style={{ height: '300px', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', resize: 'vertical' }}
                                placeholder="Paste your script or code here..."
                                value={fileContent}
                                onChange={e => setFileContent(e.target.value)}
                            />
                            <button className="btn-primary btn" style={{ width: '100%', padding: '14px', fontSize: '16px', marginTop: '20px' }} onClick={addFile} disabled={!fileName.trim()}>
                                Commit new file
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ========== TOAST ========== */}
            <AnimatePresence>
                {copied && (
                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                        style={{ position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)', background: '#238636', color: '#fff', padding: '12px 24px', borderRadius: '8px', fontWeight: 600, fontSize: '14px', boxShadow: '0 8px 30px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 9999 }}
                    >
                        <Check size={18} /> Copied to clipboard!
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ========== FOOTER ========== */}
            <footer style={{ marginTop: 'auto', padding: '48px', borderTop: '1px solid var(--border-color)', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                <Github size={24} style={{ marginBottom: '20px', opacity: 0.3 }} />
                <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '16px' }}>
                    <span style={{ cursor: 'pointer' }}>Terms</span><span style={{ cursor: 'pointer' }}>Privacy</span><span style={{ cursor: 'pointer' }}>Docs</span><span style={{ cursor: 'pointer' }}>Contact</span>
                </div>
                © 2026 VanderHub, Inc.
            </footer>
        </div>
    );
}

export default App;
