/* =========================================================
   Glide Brands — Minimal & Wow Live Leaderboard
   100% Offline JavaScript (PIN: 1234 guaranteed)
   Default Teams: "Champi Company" & "Gola Gang"
   ========================================================= */
(() => {
    'use strict';

    const STORAGE_KEY = 'glideScoreboard.v3';
    const ADMIN_PIN = '1234'; // Guaranteed password

    const TEAM_COLORS = [
        '#ff8c00', '#ec4899', '#06b6d4', '#10b981',
        '#a855f7', '#eab308', '#3b82f6', '#f43f5e'
    ];

    const DEFAULT_TEAMS = [
        { id: 't1', name: 'Champi Company', points: 0, color: '#ff8c00', lastDelta: 0 },
        { id: 't2', name: 'Gola Gang', points: 0, color: '#ec4899', lastDelta: 0 },
        { id: 't3', name: 'Ghoda Gadi Gang', points: 0, color: '#06b6d4', lastDelta: 0 }
    ];

    // ---------- State ----------
    const state = {
        sound: true,
        teams: DEFAULT_TEAMS.map(t => ({ ...t })),
        history: []
    };

    let lastScoredTeamId = null;
    let pendingPinAction = null;

    // ---------- Helpers ----------
    const $ = (sel, root = document) => root.querySelector(sel);
    const uid = () => 't_' + Math.random().toString(36).slice(2, 9);

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                sound: state.sound,
                teams: state.teams
            }));
        } catch (err) {
            console.warn('Could not save state:', err);
        }
    }

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (!data || typeof data !== 'object') return;
            if (typeof data.sound === 'boolean') state.sound = data.sound;
            if (Array.isArray(data.teams) && data.teams.length > 0) {
                state.teams = data.teams
                    .filter(t => t && typeof t.name === 'string')
                    .map((t, idx) => ({
                        id: t.id || uid(),
                        name: t.name.trim() || `Team ${idx + 1}`,
                        points: Number.isFinite(Number(t.points)) ? Number(t.points) : 0,
                        color: t.color || TEAM_COLORS[idx % TEAM_COLORS.length],
                        lastDelta: Number.isFinite(Number(t.lastDelta)) ? Number(t.lastDelta) : 0
                    }));
            }
        } catch (err) {
            console.warn('Could not load saved state:', err);
        }
    }

    function pushHistory() {
        state.history.push(state.teams.map(t => ({ ...t })));
        if (state.history.length > 25) state.history.shift();
    }

    // ---------- DOM Elements ----------
    const el = {
        podiumBtn: $('#podium-btn'),
        soundToggle: $('#sound-toggle'),
        fullscreenToggle: $('#fullscreen-toggle'),
        leaderboard: $('#leaderboard'),
        dockTeams: $('#dock-teams'),
        undoBtn: $('#undo-btn'),
        addTeamBtn: $('#add-team-btn'),
        editBtn: $('#edit-btn'),
        resetBtn: $('#reset-btn'),

        pinModal: $('#pin-modal'),
        pinTitle: $('#pin-title'),
        pinDesc: $('#pin-desc'),
        pinForm: $('#pin-form'),
        pinInput: $('#pin-input'),
        pinError: $('#pin-error'),
        pinCancel: $('#pin-cancel'),

        addModal: $('#add-modal'),
        addTeamForm: $('#add-team-form'),
        newTeamName: $('#new-team-name'),
        newTeamPoints: $('#new-team-points'),
        addCancel: $('#add-cancel'),

        editModal: $('#edit-modal'),
        editTeamsList: $('#edit-teams-list'),
        editCancel: $('#edit-cancel'),
        editSave: $('#edit-save'),

        podiumModal: $('#podium-modal'),
        podiumClose: $('#podium-close'),
        podiumStage: $('#podium-stage'),
        canvas: $('#fx-canvas')
    };

    // =========================================================
    // Sound Engine (Web Audio API — 100% offline, zero MP3s)
    // =========================================================
    let audioCtx = null;

    function unlockAudio() {
        if (!state.sound) return;
        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state !== 'running') audioCtx.resume();
        } catch { /* ignore */ }
    }

    function playTone(freq, dur, { type = 'triangle', vol = 0.16, delay = 0 } = {}) {
        if (!state.sound || !audioCtx || audioCtx.state !== 'running') return;
        const t = audioCtx.currentTime + delay;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(vol, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.04);
    }

    const sfx = {
        scoreUp() {
            unlockAudio();
            [587.33, 880, 1174.66].forEach((f, i) => playTone(f, 0.22, { type: 'triangle', vol: 0.18, delay: i * 0.06 }));
        },
        scoreDown() {
            unlockAudio();
            [440, 330].forEach((f, i) => playTone(f, 0.2, { type: 'sine', vol: 0.14, delay: i * 0.07 }));
        },
        unlock() {
            unlockAudio();
            [523.25, 783.99].forEach((f, i) => playTone(f, 0.18, { type: 'sine', vol: 0.14, delay: i * 0.06 }));
        },
        error() {
            unlockAudio();
            playTone(180, 0.25, { type: 'sawtooth', vol: 0.12 });
        },
        fanfare() {
            unlockAudio();
            [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((f, i) =>
                playTone(f, 0.32, { type: 'triangle', vol: 0.16, delay: i * 0.11 })
            );
        }
    };

    // =========================================================
    // Confetti & Sparkle Canvas Engine (100% offline)
    // =========================================================
    const fx = (() => {
        const canvas = el.canvas;
        const ctx = canvas.getContext('2d');
        let particles = [];
        let running = false;

        function resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        resize();
        window.addEventListener('resize', resize);

        const COLORS = ['#ffd700', '#ff8c00', '#ec4899', '#06b6d4', '#10b981', '#ffffff'];

        function burst(x, y, count = 45) {
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 3 + Math.random() * 8;
                particles.push({
                    x, y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 2,
                    w: 6 + Math.random() * 5,
                    h: 4 + Math.random() * 4,
                    rot: Math.random() * Math.PI,
                    vr: (Math.random() - 0.5) * 0.25,
                    color: COLORS[i % COLORS.length],
                    life: 1,
                    decay: 0.012 + Math.random() * 0.01
                });
            }
            if (!running) {
                running = true;
                requestAnimationFrame(frame);
            }
        }

        function frame() {
            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            particles = particles.filter(p => p.life > 0 && p.y < window.innerHeight + 30);
            for (const p of particles) {
                p.vx *= 0.985;
                p.vy = p.vy * 0.985 + 0.22;
                p.x += p.vx;
                p.y += p.vy;
                p.rot += p.vr;
                p.life -= p.decay;

                ctx.save();
                ctx.globalAlpha = Math.max(p.life, 0);
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();
            }
            if (particles.length > 0) {
                requestAnimationFrame(frame);
            } else {
                running = false;
                ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            }
        }

        return {
            burstAtElement(node) {
                if (!node) return;
                const r = node.getBoundingClientRect();
                burst(r.left + r.width * 0.85, r.top + r.height * 0.5, 42);
            },
            grandCelebration() {
                for (let i = 0; i < 6; i++) {
                    setTimeout(() => {
                        burst(window.innerWidth * (0.15 + Math.random() * 0.7), window.innerHeight * (0.2 + Math.random() * 0.35), 75);
                    }, i * 240);
                }
            }
        };
    })();

    // =========================================================
    // PIN 1234 Gate
    // =========================================================
    function askPin(title, desc, callback) {
        pendingPinAction = callback;
        el.pinTitle.textContent = title;
        el.pinDesc.textContent = desc;
        el.pinInput.value = '';
        el.pinError.hidden = true;
        el.pinModal.hidden = false;
        requestAnimationFrame(() => el.pinInput.focus());
    }

    el.pinForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (el.pinInput.value.trim() === ADMIN_PIN) {
            el.pinModal.hidden = true;
            sfx.unlock();
            const fn = pendingPinAction;
            pendingPinAction = null;
            if (fn) fn();
        } else {
            sfx.error();
            el.pinError.hidden = false;
            el.pinInput.select();
        }
    });

    el.pinCancel.addEventListener('click', () => {
        el.pinModal.hidden = true;
        pendingPinAction = null;
    });

    // =========================================================
    // Ranking & Rendering (Giant Leaderboard + Slim Bottom Dock)
    // =========================================================
    function getRankedTeams() {
        const sorted = [...state.teams].sort((a, b) => b.points - a.points);
        let currentRank = 1;
        return sorted.map((team, index) => {
            if (index > 0 && team.points < sorted[index - 1].points) {
                currentRank = index + 1;
            }
            return { ...team, rank: currentRank };
        });
    }

    function renderAll() {
        el.undoBtn.disabled = state.history.length === 0;
        el.leaderboard.classList.toggle('many-teams', state.teams.length > 3);

        const ranked = getRankedTeams();
        const maxPts = Math.max(1, ...ranked.map(t => Math.max(0, t.points)));

        // 1. Render Giant Leaderboard Cards (Sorted by Rank #1 -> Last)
        const rows = ranked.map((team) => {
            const row = document.createElement('div');
            const rankClass = team.rank <= 3 ? ` rank-${team.rank}` : '';
            const pulseClass = team.id === lastScoredTeamId ? ' just-scored' : '';
            row.className = `team-row${rankClass}${pulseClass}`;
            row.dataset.id = team.id;
            row.style.setProperty('--team-color', team.color);
            row.setAttribute('role', 'listitem');

            // Bottom progress bar relative to #1
            const pct = team.points > 0 ? Math.min(100, Math.round((team.points / maxPts) * 100)) : 0;
            const prog = document.createElement('div');
            prog.className = 'team-progress';
            prog.style.width = `${pct}%`;
            row.appendChild(prog);

            // Rank Badge (#1, #2...)
            const badge = document.createElement('div');
            badge.className = 'rank-badge';
            badge.textContent = `#${team.rank}`;
            row.appendChild(badge);

            // Team Info (Crown + Team Name + Last Delta Pill)
            const info = document.createElement('div');
            info.className = 'team-info';
            if (team.rank <= 3 && team.points > 0) {
                const crown = document.createElement('span');
                crown.className = 'rank-crown';
                crown.textContent = team.rank === 1 ? '👑' : team.rank === 2 ? '🥈' : '🥉';
                info.appendChild(crown);
            }

            const nameEl = document.createElement('span');
            nameEl.className = 'team-name';
            nameEl.textContent = team.name;
            info.appendChild(nameEl);

            if (team.lastDelta !== 0) {
                const delta = document.createElement('span');
                delta.className = `delta-pill ${team.lastDelta > 0 ? 'pos' : 'neg'}`;
                delta.textContent = team.lastDelta > 0 ? `+${team.lastDelta}` : `${team.lastDelta}`;
                info.appendChild(delta);
            }
            row.appendChild(info);

            // Giant Score on Right
            const scoreEl = document.createElement('div');
            scoreEl.className = 'team-score';
            scoreEl.textContent = team.points.toLocaleString('en-IN');
            row.appendChild(scoreEl);

            return row;
        });

        el.leaderboard.replaceChildren(...rows);

        // 2. Render Ultra-Low Bottom Dock Pills (Fixed team order so buttons never jump under your mouse!)
        const dockPills = state.teams.map((team) => {
            const pill = document.createElement('div');
            pill.className = 'dock-team-pill';
            pill.style.setProperty('--team-color', team.color);

            const nameSpan = document.createElement('span');
            nameSpan.className = 'dock-team-name';
            nameSpan.textContent = team.name;
            pill.appendChild(nameSpan);

            [
                { label: '+5', delta: 5, cls: 'plus' },
                { label: '+10', delta: 10, cls: 'plus' },
                { label: '+25', delta: 25, cls: 'plus' },
                { label: '-5', delta: -5, cls: 'minus' }
            ].forEach(cfg => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = `q-btn ${cfg.cls}`;
                b.textContent = cfg.label;
                b.addEventListener('click', () => adjustScore(team.id, cfg.delta));
                pill.appendChild(b);
            });

            return pill;
        });

        el.dockTeams.replaceChildren(...dockPills);

        if (lastScoredTeamId) {
            const targetRow = el.leaderboard.querySelector(`[data-id="${lastScoredTeamId}"]`);
            if (targetRow) fx.burstAtElement(targetRow);
            lastScoredTeamId = null;
        }
    }

    // =========================================================
    // Scoring & Team Operations
    // =========================================================
    function adjustScore(teamId, delta) {
        const team = state.teams.find(t => t.id === teamId);
        if (!team || delta === 0) return;
        pushHistory();
        team.points += delta;
        team.lastDelta = delta;
        lastScoredTeamId = delta > 0 ? teamId : null;
        if (delta > 0) sfx.scoreUp(); else sfx.scoreDown();
        save();
        renderAll();
    }

    function undoLast() {
        if (state.history.length === 0) return;
        state.teams = state.history.pop();
        sfx.scoreDown();
        save();
        renderAll();
    }

    // Add Team (PIN 1234 protected)
    el.addTeamBtn.addEventListener('click', () => {
        askPin('Add New Team', 'Enter password (1234) to add a team.', () => {
            el.newTeamName.value = '';
            el.newTeamPoints.value = '0';
            el.addModal.hidden = false;
            requestAnimationFrame(() => el.newTeamName.focus());
        });
    });

    el.addTeamForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = el.newTeamName.value.trim();
        const pts = parseInt(el.newTeamPoints.value, 10) || 0;
        if (!name) return;
        pushHistory();
        const color = TEAM_COLORS[state.teams.length % TEAM_COLORS.length];
        state.teams.push({ id: uid(), name, points: pts, color, lastDelta: 0 });
        el.addModal.hidden = true;
        sfx.scoreUp();
        save();
        renderAll();
    });

    el.addCancel.addEventListener('click', () => { el.addModal.hidden = true; });

    // Edit Teams & Exact Points (PIN 1234 protected)
    el.editBtn.addEventListener('click', () => {
        askPin('Edit Scores & Teams', 'Enter password (1234) to edit team names or exact points.', openEditModal);
    });

    function openEditModal() {
        const rows = state.teams.map((team) => {
            const row = document.createElement('div');
            row.className = 'edit-team-row';
            row.dataset.id = team.id;

            const nameIn = document.createElement('input');
            nameIn.type = 'text';
            nameIn.className = 'input edit-name';
            nameIn.value = team.name;
            nameIn.maxLength = 36;

            const ptsIn = document.createElement('input');
            ptsIn.type = 'number';
            ptsIn.className = 'input mono edit-pts';
            ptsIn.value = team.points;
            ptsIn.step = '1';

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'del-row-btn';
            delBtn.title = 'Remove this team';
            delBtn.textContent = '🗑️';
            delBtn.addEventListener('click', () => {
                if (el.editTeamsList.querySelectorAll('.edit-team-row').length <= 1) {
                    alert('At least 1 team must remain on the leaderboard.');
                    return;
                }
                row.remove();
            });

            row.append(nameIn, ptsIn, delBtn);
            return row;
        });

        el.editTeamsList.replaceChildren(...rows);
        el.editModal.hidden = false;
    }

    el.editSave.addEventListener('click', () => {
        const rows = Array.from(el.editTeamsList.querySelectorAll('.edit-team-row'));
        if (rows.length === 0) return;
        pushHistory();

        const updated = [];
        rows.forEach((r, idx) => {
            const id = r.dataset.id;
            const prev = state.teams.find(t => t.id === id);
            const name = r.querySelector('.edit-name').value.trim() || `Team ${idx + 1}`;
            const pts = parseInt(r.querySelector('.edit-pts').value, 10) || 0;
            const diff = prev ? pts - prev.points : 0;
            updated.push({
                id: id || uid(),
                name,
                points: pts,
                color: prev ? prev.color : TEAM_COLORS[idx % TEAM_COLORS.length],
                lastDelta: diff !== 0 ? diff : (prev ? prev.lastDelta : 0)
            });
        });

        state.teams = updated;
        el.editModal.hidden = true;
        sfx.scoreUp();
        save();
        renderAll();
    });

    el.editCancel.addEventListener('click', () => { el.editModal.hidden = true; });

    // Reset All Scores to 0 (PIN 1234 protected)
    el.resetBtn.addEventListener('click', () => {
        askPin('Reset All Scores to 0?', 'Enter password (1234) to reset every team back to 0 points.', () => {
            pushHistory();
            state.teams.forEach(t => {
                t.points = 0;
                t.lastDelta = 0;
            });
            sfx.scoreDown();
            save();
            renderAll();
        });
    });

    el.undoBtn.addEventListener('click', undoLast);

    // =========================================================
    // Winner / Podium Reveal Modal
    // =========================================================
    function showPodium() {
        const ranked = getRankedTeams();
        if (ranked.length === 0) return;
        const top = ranked.slice(0, 3);
        const medals = ['👑', '🥈', '🥉'];

        el.podiumStage.replaceChildren(...top.map((team, idx) => {
            const col = document.createElement('div');
            col.className = `podium-col place-${idx + 1}`;
            col.innerHTML = `
                <div class="podium-medal">${medals[idx]}</div>
                <div class="podium-name"></div>
                <div class="podium-pts">${team.points.toLocaleString('en-IN')}</div>
            `;
            col.querySelector('.podium-name').textContent = team.name;
            return col;
        }));

        el.podiumModal.hidden = false;
        sfx.fanfare();
        fx.grandCelebration();
    }

    el.podiumBtn.addEventListener('click', showPodium);
    el.podiumClose.addEventListener('click', () => { el.podiumModal.hidden = true; });
    el.podiumModal.addEventListener('click', (e) => {
        if (e.target === el.podiumModal) el.podiumModal.hidden = true;
    });

    el.soundToggle.addEventListener('click', () => {
        state.sound = !state.sound;
        if (state.sound) unlockAudio();
        el.soundToggle.setAttribute('aria-pressed', String(state.sound));
        el.soundToggle.textContent = state.sound ? '🔊' : '🔇';
        save();
    });

    function toggleFullscreen() {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else document.documentElement.requestFullscreen?.().catch(() => {});
    }
    el.fullscreenToggle.addEventListener('click', toggleFullscreen);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            el.pinModal.hidden = true;
            el.addModal.hidden = true;
            el.editModal.hidden = true;
            el.podiumModal.hidden = true;
            return;
        }
        const tag = (e.target.tagName || '').toLowerCase();
        if (['input', 'textarea', 'select'].includes(tag)) return;
        if (e.key === 'f' || e.key === 'F') toggleFullscreen();
        if (e.key === 'p' || e.key === 'P') showPodium();
    });

    // =========================================================
    // Init
    // =========================================================
    function init() {
        load();
        el.soundToggle.setAttribute('aria-pressed', String(state.sound));
        el.soundToggle.textContent = state.sound ? '🔊' : '🔇';
        renderAll();

        if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        }
    }

    init();
})();
