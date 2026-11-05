/* =========================================================
   Glide Brands — Minimal & Wow Live Leaderboard
   100% Offline JavaScript (PIN: 1234 guaranteed)
   ========================================================= */
(() => {
    'use strict';

    const STORAGE_KEY = 'glideScoreboard.v1';
    const ADMIN_PIN = '1234'; // Guaranteed PIN as requested

    const TEAM_COLORS = [
        '#ff8c00', '#ec4899', '#06b6d4', '#10b981',
        '#a855f7', '#eab308', '#3b82f6', '#f43f5e'
    ];

    const DEFAULT_TEAMS = [
        { id: 't1', name: 'Team Pataka', points: 0, color: '#ff8c00', lastDelta: 0 },
        { id: 't2', name: 'Royal Strikers', points: 0, color: '#ec4899', lastDelta: 0 },
        { id: 't3', name: 'Dhamaka Squad', points: 0, color: '#06b6d4', lastDelta: 0 },
        { id: 't4', name: 'Golden Titans', points: 0, color: '#10b981', lastDelta: 0 }
    ];

    // ---------- State ----------
    const state = {
        title: 'LIVE LEADERBOARD',
        subtitle: 'Diwali & Sangeet Championship',
        sound: true,
        teams: DEFAULT_TEAMS.map(t => ({ ...t })),
        history: [] // snapshots for Undo
    };

    let isAdminUnlocked = false;
    let lastScoredTeamId = null;
    let pendingPinCallback = null;
    let editingTeamId = null;
    let confirmResolver = null;

    // ---------- Helpers ----------
    const $ = (sel, root = document) => root.querySelector(sel);
    const uid = () => 't_' + Math.random().toString(36).slice(2, 9);

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                title: state.title,
                subtitle: state.subtitle,
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
            if (typeof data.title === 'string' && data.title.trim()) state.title = data.title;
            if (typeof data.subtitle === 'string') state.subtitle = data.subtitle;
            if (typeof data.sound === 'boolean') state.sound = data.sound;
            if (Array.isArray(data.teams)) {
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
        boardTitle: $('#board-title'),
        boardSubtitle: $('#board-subtitle'),
        podiumBtn: $('#podium-btn'),
        soundToggle: $('#sound-toggle'),
        fullscreenToggle: $('#fullscreen-toggle'),
        adminToggle: $('#admin-toggle'),
        adminIcon: $('#admin-icon'),
        adminLabel: $('#admin-label'),
        adminBar: $('#admin-bar'),
        addTeamForm: $('#add-team-form'),
        newTeamName: $('#new-team-name'),
        newTeamPoints: $('#new-team-points'),
        undoBtn: $('#undo-btn'),
        editTitleBtn: $('#edit-title-btn'),
        resetScoresBtn: $('#reset-scores-btn'),
        clearAllBtn: $('#clear-all-btn'),
        lockAdminBtn: $('#lock-admin-btn'),
        emptyState: $('#empty-state'),
        emptyAddBtn: $('#empty-add-btn'),
        leaderboard: $('#leaderboard'),
        teamCountLabel: $('#team-count-label'),

        pinModal: $('#pin-modal'),
        pinForm: $('#pin-form'),
        pinInput: $('#pin-input'),
        pinError: $('#pin-error'),
        pinCancel: $('#pin-cancel'),

        editModal: $('#edit-modal'),
        editModalTitle: $('#edit-modal-title'),
        editTeamForm: $('#edit-team-form'),
        editTeamName: $('#edit-team-name'),
        editDeltaPoints: $('#edit-delta-points'),
        editExactPoints: $('#edit-exact-points'),
        editCancel: $('#edit-cancel'),

        confirmModal: $('#confirm-modal'),
        confirmTitle: $('#confirm-title'),
        confirmMessage: $('#confirm-message'),
        confirmCancel: $('#confirm-cancel'),
        confirmOk: $('#confirm-ok'),

        podiumModal: $('#podium-modal'),
        podiumClose: $('#podium-close'),
        podiumStage: $('#podium-stage'),
        canvas: $('#fx-canvas')
    };

    // =========================================================
    // Sound Engine (Web Audio API — 100% offline, no MP3s needed)
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
                burst(r.left + r.width * 0.85, r.top + r.height * 0.5, 36);
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
    function requirePin(actionCallback) {
        if (isAdminUnlocked) {
            actionCallback();
            return;
        }
        pendingPinCallback = actionCallback;
        el.pinInput.value = '';
        el.pinError.hidden = true;
        el.pinModal.hidden = false;
        requestAnimationFrame(() => el.pinInput.focus());
    }

    function setAdminUnlocked(unlocked) {
        isAdminUnlocked = unlocked;
        el.adminBar.hidden = !unlocked;
        el.adminToggle.classList.toggle('unlocked', unlocked);
        el.adminIcon.textContent = unlocked ? '🔓' : '🔒';
        el.adminLabel.textContent = unlocked ? 'Host Mode (Lock)' : 'Edit / Host';
        renderLeaderboard();
    }

    el.pinForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (el.pinInput.value.trim() === ADMIN_PIN) {
            el.pinModal.hidden = true;
            sfx.unlock();
            setAdminUnlocked(true);
            const cb = pendingPinCallback;
            pendingPinCallback = null;
            if (cb) cb();
        } else {
            sfx.error();
            el.pinError.hidden = false;
            el.pinInput.select();
        }
    });

    el.pinCancel.addEventListener('click', () => {
        el.pinModal.hidden = true;
        pendingPinCallback = null;
    });

    // =========================================================
    // Confirm Modal
    // =========================================================
    function confirmAction(title, message) {
        el.confirmTitle.textContent = title;
        el.confirmMessage.textContent = message;
        el.confirmModal.hidden = false;
        return new Promise((resolve) => {
            confirmResolver = resolve;
        });
    }

    function closeConfirm(result) {
        el.confirmModal.hidden = true;
        if (confirmResolver) {
            confirmResolver(result);
            confirmResolver = null;
        }
    }

    el.confirmCancel.addEventListener('click', () => closeConfirm(false));
    el.confirmOk.addEventListener('click', () => closeConfirm(true));

    // =========================================================
    // Ranking & Rendering
    // =========================================================
    function getRankedTeams() {
        // Sort descending by points; preserve original creation order on ties
        const sorted = [...state.teams].sort((a, b) => b.points - a.points);
        let currentRank = 1;
        return sorted.map((team, index) => {
            if (index > 0 && team.points < sorted[index - 1].points) {
                currentRank = index + 1;
            }
            return { ...team, rank: currentRank };
        });
    }

    function renderLeaderboard() {
        el.boardTitle.textContent = state.title;
        el.boardSubtitle.textContent = state.subtitle;
        el.undoBtn.disabled = state.history.length === 0;
        el.teamCountLabel.textContent = `${state.teams.length} Team${state.teams.length === 1 ? '' : 's'}`;

        if (state.teams.length === 0) {
            el.emptyState.hidden = false;
            el.leaderboard.replaceChildren();
            return;
        }

        el.emptyState.hidden = true;
        const ranked = getRankedTeams();
        const maxPts = Math.max(1, ...ranked.map(t => Math.max(0, t.points)));

        const rows = ranked.map((team) => {
            const row = document.createElement('div');
            const rankClass = team.rank <= 3 ? ` rank-${team.rank}` : '';
            const pulseClass = team.id === lastScoredTeamId ? ' just-scored' : '';
            row.className = `team-row${rankClass}${pulseClass}`;
            row.dataset.id = team.id;
            row.style.setProperty('--team-color', team.color);
            row.setAttribute('role', 'listitem');

            // Progress bar along bottom
            const pct = team.points > 0 ? Math.min(100, Math.round((team.points / maxPts) * 100)) : 0;
            const prog = document.createElement('div');
            prog.className = 'team-progress';
            prog.style.width = `${pct}%`;
            row.appendChild(prog);

            // 1. Rank Badge
            const badge = document.createElement('div');
            badge.className = 'rank-badge';
            badge.textContent = `#${team.rank}`;
            row.appendChild(badge);

            // 2. Team Info (Medal + Name + Last Change Pill)
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

            // 3. Right Side: Admin Quick Buttons (if unlocked) + Giant Score
            const right = document.createElement('div');
            right.className = 'team-right';

            if (isAdminUnlocked) {
                const controls = document.createElement('div');
                controls.className = 'score-controls';

                [
                    { label: '+5', delta: 5, cls: 'plus' },
                    { label: '+10', delta: 10, cls: 'plus' },
                    { label: '+25', delta: 25, cls: 'plus' },
                    { label: '-5', delta: -5, cls: 'minus' }
                ].forEach(btnCfg => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = `chip-btn ${btnCfg.cls}`;
                    b.textContent = btnCfg.label;
                    b.addEventListener('click', () => adjustScore(team.id, btnCfg.delta));
                    controls.appendChild(b);
                });

                const editBtn = document.createElement('button');
                editBtn.type = 'button';
                editBtn.className = 'chip-btn icon';
                editBtn.title = 'Edit name or set exact points';
                editBtn.textContent = '✏️';
                editBtn.addEventListener('click', () => openEditModal(team.id));
                controls.appendChild(editBtn);

                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'chip-btn icon minus';
                delBtn.title = 'Remove team';
                delBtn.textContent = '🗑️';
                delBtn.addEventListener('click', () => removeTeam(team.id));
                controls.appendChild(delBtn);

                right.appendChild(controls);
            }

            const scoreEl = document.createElement('div');
            scoreEl.className = 'team-score';
            scoreEl.textContent = team.points.toLocaleString('en-IN');
            right.appendChild(scoreEl);

            row.appendChild(right);
            return row;
        });

        el.leaderboard.replaceChildren(...rows);

        if (lastScoredTeamId) {
            const targetRow = el.leaderboard.querySelector(`[data-id="${lastScoredTeamId}"]`);
            if (targetRow) fx.burstAtElement(targetRow);
            lastScoredTeamId = null;
        }
    }

    // =========================================================
    // Team & Score Actions
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
        renderLeaderboard();
    }

    function addTeam(name, startPoints = 0) {
        const clean = name.trim();
        if (!clean) return;
        pushHistory();
        const color = TEAM_COLORS[state.teams.length % TEAM_COLORS.length];
        const newTeam = {
            id: uid(),
            name: clean,
            points: Number.isFinite(startPoints) ? startPoints : 0,
            color,
            lastDelta: 0
        };
        state.teams.push(newTeam);
        lastScoredTeamId = startPoints > 0 ? newTeam.id : null;
        sfx.scoreUp();
        save();
        renderLeaderboard();
    }

    async function removeTeam(teamId) {
        const team = state.teams.find(t => t.id === teamId);
        if (!team) return;
        const ok = await confirmAction('Remove Team?', `Remove "${team.name}" (${team.points} pts) from the leaderboard?`);
        if (!ok) return;
        pushHistory();
        state.teams = state.teams.filter(t => t.id !== teamId);
        save();
        renderLeaderboard();
    }

    function openEditModal(teamId) {
        const team = state.teams.find(t => t.id === teamId);
        if (!team) return;
        editingTeamId = teamId;
        el.editModalTitle.textContent = `Edit — ${team.name}`;
        el.editTeamName.value = team.name;
        el.editDeltaPoints.value = '';
        el.editExactPoints.value = team.points;
        el.editModal.hidden = false;
        requestAnimationFrame(() => el.editDeltaPoints.focus());
    }

    el.editDeltaPoints.addEventListener('input', () => {
        const team = state.teams.find(t => t.id === editingTeamId);
        if (!team) return;
        const delta = parseInt(el.editDeltaPoints.value, 10);
        if (Number.isFinite(delta)) {
            el.editExactPoints.value = team.points + delta;
        } else {
            el.editExactPoints.value = team.points;
        }
    });

    el.editTeamForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const team = state.teams.find(t => t.id === editingTeamId);
        if (!team) return;
        const newName = el.editTeamName.value.trim();
        const newPts = parseInt(el.editExactPoints.value, 10);
        if (!newName || !Number.isFinite(newPts)) return;

        pushHistory();
        const diff = newPts - team.points;
        team.name = newName;
        team.points = newPts;
        if (diff !== 0) {
            team.lastDelta = diff;
            if (diff > 0) {
                lastScoredTeamId = team.id;
                sfx.scoreUp();
            } else {
                sfx.scoreDown();
            }
        }
        el.editModal.hidden = true;
        editingTeamId = null;
        save();
        renderLeaderboard();
    });

    el.editCancel.addEventListener('click', () => {
        el.editModal.hidden = true;
        editingTeamId = null;
    });

    function undoLast() {
        if (state.history.length === 0) return;
        state.teams = state.history.pop();
        sfx.scoreDown();
        save();
        renderLeaderboard();
    }

    async function resetScores() {
        const ok = await confirmAction(
            'Reset All Scores to 0?',
            'All team names will stay on the board, and every team score will be set back to 0.'
        );
        if (!ok) return;
        pushHistory();
        state.teams.forEach(t => {
            t.points = 0;
            t.lastDelta = 0;
        });
        save();
        renderLeaderboard();
    }

    async function clearAllTeams() {
        const ok = await confirmAction(
            'Clear All Teams?',
            'This will remove every team from the scoreboard so you can add a brand-new set of teams.'
        );
        if (!ok) return;
        pushHistory();
        state.teams = [];
        save();
        renderLeaderboard();
    }

    function editHeaderTitle() {
        const nextTitle = prompt('Scoreboard Heading:', state.title);
        if (nextTitle !== null && nextTitle.trim()) {
            state.title = nextTitle.trim();
            const nextSub = prompt('Subtitle (leave blank to hide):', state.subtitle);
            if (nextSub !== null) state.subtitle = nextSub.trim();
            save();
            renderLeaderboard();
        }
    }

    // =========================================================
    // Podium Celebration Modal
    // =========================================================
    function showPodium() {
        const ranked = getRankedTeams();
        if (ranked.length === 0) return;
        const top3 = ranked.slice(0, 3);
        const medals = ['🥇', '🥈', '🥉'];

        el.podiumStage.replaceChildren(...top3.map((team, idx) => {
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

    // =========================================================
    // Event Listeners & Shortcuts
    // =========================================================
    el.adminToggle.addEventListener('click', () => {
        if (isAdminUnlocked) {
            setAdminUnlocked(false);
        } else {
            requirePin(() => {});
        }
    });

    el.lockAdminBtn.addEventListener('click', () => setAdminUnlocked(false));

    el.emptyAddBtn.addEventListener('click', () => {
        requirePin(() => el.newTeamName.focus());
    });

    el.addTeamForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = el.newTeamName.value.trim();
        const pts = parseInt(el.newTeamPoints.value, 10) || 0;
        if (!name) return;
        addTeam(name, pts);
        el.newTeamName.value = '';
        el.newTeamPoints.value = '0';
        el.newTeamName.focus();
    });

    el.undoBtn.addEventListener('click', undoLast);
    el.editTitleBtn.addEventListener('click', editHeaderTitle);
    el.resetScoresBtn.addEventListener('click', resetScores);
    el.clearAllBtn.addEventListener('click', clearAllTeams);

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
            el.editModal.hidden = true;
            el.podiumModal.hidden = true;
            closeConfirm(false);
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
        renderLeaderboard();

        if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        }
    }

    init();
})();
