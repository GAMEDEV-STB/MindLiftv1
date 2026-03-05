// ═══════════════════════════════════════════════
// MindLift — Mental Health Micro Support System
// Fully offline • No API keys • Pure JS + Web APIs
// ═══════════════════════════════════════════════

// ══════════════════════════════════════
// 1. EMOTION DETECTION (Real-time)
// ══════════════════════════════════════
const emotionProfiles = [
    { name: 'Happy', emoji: '😊', color: '#2cb67d', tips: ['Keep spreading positivity!', 'Share your joy with a friend.', 'Great time to journal your gratitude.', 'Smile at someone today!'] },
    { name: 'Calm', emoji: '😌', color: '#7f5af0', tips: ['Maintain this balance.', 'Perfect state for mindful studying.', 'Use this calm for deep focus.'] },
    { name: 'Stressed', emoji: '😰', color: '#ff8906', tips: ['Take a 5-minute break now.', 'Try the breathing exercise.', 'Step outside for fresh air.', 'Write down what\'s on your mind.'] },
    { name: 'Sad', emoji: '😢', color: '#e53170', tips: ['Talk to someone you trust.', 'It\'s okay to not be okay.', 'Try the breathing exercise.', 'Journal your feelings.'] },
    { name: 'Anxious', emoji: '😟', color: '#e16162', tips: ['Ground yourself: name 5 things you see.', 'Deep breaths — try 4-7-8 breathing.', 'This feeling is temporary.'] },
    { name: 'Tired', emoji: '😴', color: '#94a1b2', tips: ['Consider a 20-min power nap.', 'Hydrate and stretch.', 'Reduce screen brightness.', 'Take a short break.'] },
    { name: 'Focused', emoji: '🎯', color: '#2cb67d', tips: ['Great flow state! Keep going.', 'Set a timer to avoid burnout.', 'Reward yourself after this session.'] },
];

let cameraStream = null;
let autoDetectInterval = null;
let currentEmotion = null;

// ── Emotion Stability & Real-time AI System ──
let confirmedEmotion = null;       // Currently displayed emotion
let pendingEmotion = null;         // Candidate emotion waiting to be confirmed
let pendingEmotionTime = 0;        // When the pending emotion was first detected
let lastSwitchTime = 0;            // When we last switched the displayed emotion
const EMOTION_HOLD_MS = 500;       // Fast 0.5s hold time for real-time feel
const CONFIDENCE_THRESHOLD = 50;   // 50% confidence for actual face tracking

let faceModelsLoaded = false;
let modelsInitStarted = false;

async function loadFaceModels() {
    if (modelsInitStarted) return;
    modelsInitStarted = true;
    try {
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri('./models'),
            faceapi.nets.faceExpressionNet.loadFromUri('./models')
        ]);
        faceModelsLoaded = true;
    } catch (e) {
        console.error("Error loading face models", e);
    }
}
// Start loading AI models in background immediately
loadFaceModels();

function startCamera() {
    if (!faceModelsLoaded) {
        showEmotionResult(null, 'Loading AI models... please wait a few seconds and try again.');
        return;
    }
    const video = document.getElementById('cam');
    const btn = document.getElementById('btnStartCam');
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then(stream => {
            cameraStream = stream;
            video.srcObject = stream;
            video.onplay = () => {
                btn.textContent = '📷 Camera On';
                btn.style.opacity = '.6';
                // Fast 400ms auto-detect interval for real-time responsiveness
                autoDetectInterval = setInterval(detectEmotion, 400);
            };
        })
        .catch(() => showEmotionResult(null, 'Camera access denied. Please grant permission.'));
}

function stopCamera() {
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
    if (autoDetectInterval) { clearInterval(autoDetectInterval); autoDetectInterval = null; }
    const video = document.getElementById('cam');
    video.srcObject = null;
    const btn = document.getElementById('btnStartCam');
    btn.textContent = '📷 Start Camera';
    btn.style.opacity = '1';
    const overlay = document.getElementById('liveEmotionOverlay');
    overlay.classList.remove('visible');
    overlay.innerHTML = '';
    // Reset stability state
    confirmedEmotion = null;
    pendingEmotion = null;
    pendingEmotionTime = 0;
}

async function detectEmotion() {
    if (!cameraStream || !faceModelsLoaded) return;
    const video = document.getElementById('cam');
    if (video.paused || video.ended) return;

    try {
        // Actual Face Detection via face-api.js
        const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceExpressions();
        if (!detection) return; // No face found

        // Find the expression with the highest probability
        let maxVal = 0; let maxEmo = '';
        const exps = detection.expressions;
        for (const e in exps) {
            if (exps[e] > maxVal) { maxVal = exps[e]; maxEmo = e; }
        }

        // Map face-api output to our custom emotion profiles
        let mappedName = 'Calm';
        if (maxEmo === 'happy') mappedName = 'Happy';
        else if (maxEmo === 'sad') mappedName = 'Sad';
        else if (maxEmo === 'angry' || maxEmo === 'disgusted') mappedName = 'Stressed';
        else if (maxEmo === 'fearful') mappedName = 'Anxious';
        else if (maxEmo === 'surprised') mappedName = 'Focused';

        const conf = Math.floor(maxVal * 100);

        // ── Stability Gate ──
        if (conf < CONFIDENCE_THRESHOLD) return;

        let picked = emotionProfiles.find(p => p.name === mappedName) || emotionProfiles[1];
        const now = Date.now();

        // 1) First detection
        if (!confirmedEmotion) {
            confirmEmotion(picked, conf, now);
            return;
        }

        // 2) Same emotion detected — stay steady
        if (picked.name === confirmedEmotion.name) {
            pendingEmotion = null;
            return;
        }

        // 3) Different emotion — start hold timer
        if (!pendingEmotion || pendingEmotion.name !== picked.name) {
            pendingEmotion = picked;
            pendingEmotionTime = now;
            return;
        }

        // 4) Check if fast hold time has passed
        if (now - pendingEmotionTime >= EMOTION_HOLD_MS && now - lastSwitchTime >= EMOTION_HOLD_MS) {
            confirmEmotion(picked, conf, now);
        }
    } catch (err) {
        // Silently ignore video bound errors during fast refresh
    }
}

function confirmEmotion(emotion, confidence, now) {
    confirmedEmotion = emotion;
    currentEmotion = emotion;
    pendingEmotion = null;
    lastSwitchTime = now;
    showEmotionResult(emotion, null, confidence);
    updateLiveOverlay(emotion);
    updateSmartSuggestions(emotion.name);
}

function showEmotionResult(emotion, error, confidence) {
    const box = document.getElementById('emotion-result');
    box.classList.add('show');
    if (error) {
        box.innerHTML = `<p style="color:var(--danger)">${error}</p>`;
        return;
    }
    const tip = emotion.tips[Math.floor(Math.random() * emotion.tips.length)];
    box.innerHTML = `
    <div class="emotion-label" style="color:${emotion.color}">
      <span style="display:inline-block;animation:emojiPop .5s ease">${emotion.emoji}</span> ${emotion.name}
    </div>
    <div class="emotion-suggestion">${tip}</div>
    <div class="emotion-bar-wrap">
      <div class="emotion-bar-label"><span>Confidence</span><span>${confidence}%</span></div>
      <div class="emotion-bar"><div class="emotion-bar-fill" style="width:${confidence}%;background:${emotion.color}"></div></div>
    </div>`;
}

function updateLiveOverlay(emotion) {
    const overlay = document.getElementById('liveEmotionOverlay');
    overlay.innerHTML = `<span style="animation:emojiPop .4s ease">${emotion.emoji}</span> ${emotion.name}`;
    overlay.style.color = emotion.color;
    overlay.classList.add('visible');
}

// ── Smart Suggestions ──
function updateSmartSuggestions(emotionName) {
    const container = document.getElementById('smartSuggestions');
    const suggestions = getSuggestions(emotionName);
    container.innerHTML = `
    <h3>💡 Suggested for "${emotionName}"</h3>
    ${suggestions.map(s => `
      <a href="${s.href}" class="suggestion-card">
        <span class="suggestion-icon">${s.icon}</span>
        <span>${s.text}</span>
      </a>`).join('')}`;
    container.style.display = 'block';
}

function getSuggestions(emotion) {
    switch (emotion) {
        case 'Sad':
            return [
                { icon: '🎈', text: 'Play Balloon Pop — pop away the sadness', href: '#games-section' },
                { icon: '🙏', text: 'Write a gratitude entry', href: '#gratitude-section' },
                { icon: '💬', text: 'Talk to MindBot', href: '#chat-section' },
            ];
        case 'Stressed':
            return [
                { icon: '🌬️', text: 'Try Deep Calm Breathing (4-7-8)', href: '#breathing-section' },
                { icon: '⏱️', text: 'Start a Focus Timer session', href: '#focus-section' },
                { icon: '🎨', text: 'Play Color Calm game', href: '#games-section' },
            ];
        case 'Anxious':
            return [
                { icon: '🌬️', text: 'Deep Calm Breathing (4-7-8)', href: '#breathing-section' },
                { icon: '🎨', text: 'Color Calm game — distract & relax', href: '#games-section' },
                { icon: '💬', text: 'Talk to MindBot', href: '#chat-section' },
            ];
        case 'Tired':
            return [
                { icon: '🧘', text: 'Quick Calm Breathing (3-3)', href: '#breathing-section' },
                { icon: '⏱️', text: 'Short Focus Timer session', href: '#focus-section' },
                { icon: '🎨', text: 'Color Calm — gentle relaxation', href: '#games-section' },
            ];
        case 'Happy':
            return [
                { icon: '🙏', text: 'Write a gratitude entry — save this joy', href: '#gratitude-section' },
                { icon: '📝', text: 'Journal this happy moment', href: '#journal-section' },
                { icon: '😊', text: 'Play Catch the Smile', href: '#games-section' },
            ];
        case 'Focused':
            return [
                { icon: '⏱️', text: 'Start a Focus Timer — ride the wave', href: '#focus-section' },
                { icon: '📝', text: 'Journal your progress', href: '#journal-section' },
                { icon: '🌬️', text: 'Relax Breathing when done', href: '#breathing-section' },
            ];
        default:
            return [
                { icon: '🌬️', text: 'Try a Breathing Exercise', href: '#breathing-section' },
                { icon: '📊', text: 'Log your Mood', href: '#mood-section' },
                { icon: '🎈', text: 'Play a Game', href: '#games-section' },
            ];
    }
}

// ══════════════════════════════════════
// 2. ADVANCED BREATHING (3 Modes)
// ══════════════════════════════════════
const breathModes = {
    relax: { name: 'Relax Mode', inhale: 4, hold: 0, exhale: 4, label: '4-4' },
    deep: { name: 'Deep Calm', inhale: 4, hold: 7, exhale: 8, label: '4-7-8' },
    quick: { name: 'Quick Calm', inhale: 3, hold: 0, exhale: 3, label: '3-3' },
};

let currentBreathMode = 'relax';
let breathInterval = null;
let breathTimeouts = [];
let breathSeconds = 0;
let breathTickInterval = null;

function selectBreathMode(mode) {
    currentBreathMode = mode;
    document.querySelectorAll('.breath-mode-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`[data-mode="${mode}"]`);
    if (btn) btn.classList.add('active');
    // Restart if running
    if (breathInterval) { stopBreathing(); startBreathing(); }
}

function startBreathing() {
    if (breathInterval) return;
    const mode = breathModes[currentBreathMode];
    const circle = document.getElementById('breathCircle');
    const label = document.getElementById('breathLabel');
    const timer = document.getElementById('breathTimer');
    breathSeconds = 0;

    function cycle() {
        // Inhale
        circle.style.transitionDuration = mode.inhale + 's';
        circle.classList.remove('exhale');
        circle.classList.add('inhale');
        label.textContent = 'Inhale…';

        let delay = mode.inhale * 1000;

        // Hold phase (if any)
        if (mode.hold > 0) {
            breathTimeouts.push(setTimeout(() => {
                label.textContent = 'Hold…';
            }, delay));
            delay += mode.hold * 1000;
        }

        // Exhale
        breathTimeouts.push(setTimeout(() => {
            circle.style.transitionDuration = mode.exhale + 's';
            circle.classList.remove('inhale');
            circle.classList.add('exhale');
            label.textContent = 'Exhale…';
        }, delay));
    }

    cycle();
    const totalCycle = (mode.inhale + mode.hold + mode.exhale) * 1000;
    breathInterval = setInterval(cycle, totalCycle);

    // Timer tick
    breathTickInterval = setInterval(() => {
        breathSeconds++;
        const m = String(Math.floor(breathSeconds / 60)).padStart(2, '0');
        const s = String(breathSeconds % 60).padStart(2, '0');
        timer.textContent = `${m}:${s}`;
    }, 1000);
}

function stopBreathing() {
    clearInterval(breathInterval);
    clearInterval(breathTickInterval);
    breathTimeouts.forEach(t => clearTimeout(t));
    breathTimeouts = [];
    breathInterval = null;
    breathTickInterval = null;
    const circle = document.getElementById('breathCircle');
    const label = document.getElementById('breathLabel');
    circle.style.transitionDuration = '0.5s';
    circle.classList.remove('inhale', 'exhale');
    label.textContent = 'Press Start';
}

// ══════════════════════════════════════
// 3. MOOD TRACKER DASHBOARD
// ══════════════════════════════════════
const MOOD_KEY = 'mindlift_moods';
const moodEmojiMap = { Happy: '😀', Neutral: '😐', Sad: '😔', Angry: '😡', Tired: '😴', Stressed: '😰' };

function getMoods() { return JSON.parse(localStorage.getItem(MOOD_KEY) || '[]'); }

function saveMood(val, label) {
    const moods = getMoods();
    moods.push({ val, label, ts: Date.now() });
    if (moods.length > 100) moods.shift();
    localStorage.setItem(MOOD_KEY, JSON.stringify(moods));
    renderMoodChart();
    renderMoodInsights();
    renderMoodHistory();
}

function selectMood(btn, val, label) {
    document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    saveMood(val, label);
}

function renderMoodChart() {
    const moods = getMoods().slice(-14);
    const wrap = document.getElementById('moodChartContent') || document.getElementById('moodBars');
    if (!moods.length) {
        wrap.innerHTML = '<p style="color:var(--text-dim);font-size:.85rem;margin:auto;display:flex;align-items:center;justify-content:center;height:100%">No mood data yet. Tap an emoji above!</p>';
        return;
    }

    // SVG Line Chart Dimensions
    const w = 550;
    const h = 140;
    const padX = 35;
    const padY = 25;

    // Map each mood to a data point
    const points = moods.map((m, i) => {
        const x = padX + (i / Math.max(1, moods.length - 1)) * (w - padX * 2);
        // Mood val is 1-5, we map 5 to top, 1 to bottom
        const y = h - padY - ((m.val - 1) / 4) * (h - padY * 2);
        return {
            x, y,
            label: m.label,
            d: new Date(m.ts).toLocaleDateString('en', { weekday: 'short' })
        };
    });

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    wrap.innerHTML = `
        <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" class="mood-svg">
            <!-- Grid lines -->
            <line x1="${padX}" y1="${padY}" x2="${w - padX}" y2="${padY}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4" />
            <line x1="${padX}" y1="${h / 2}" x2="${w - padX}" y2="${h / 2}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4" />
            <line x1="${padX}" y1="${h - padY}" x2="${w - padX}" y2="${h - padY}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4" />
            
            <!-- Connection line -->
            <path d="${pathD}" fill="none" stroke="var(--primary)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" class="mood-line-path" />
            
            <!-- Points and labels -->
            ${points.map(p => `
                <circle cx="${p.x}" cy="${p.y}" r="5.5" fill="var(--card)" stroke="var(--accent)" stroke-width="3" class="mood-line-point">
                    <title>${p.label}</title>
                </circle>
                <text x="${p.x}" y="${h - 4}" fill="var(--text-dim)" font-size="10" text-anchor="middle" class="mood-line-text">${p.d}</text>
            `).join('')}
        </svg>
    `;
}

function renderMoodInsights() {
    const moods = getMoods();
    const insight = document.getElementById('moodInsight');
    if (!moods.length) { insight.classList.remove('show'); return; }

    // Count moods from last 7 days
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weekMoods = moods.filter(m => m.ts >= weekAgo);
    if (!weekMoods.length) { insight.classList.remove('show'); return; }

    const counts = {};
    weekMoods.forEach(m => { counts[m.label] = (counts[m.label] || 0) + 1; });

    const lines = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => `${moodEmojiMap[label] || '🔹'} You felt ${label.toLowerCase()} ${count} time${count > 1 ? 's' : ''} this week.`)
        .join(' ');

    insight.textContent = `📊 Weekly Insight: ${lines}`;
    insight.classList.add('show');
}

function renderMoodHistory() {
    const moods = getMoods().slice(-8).reverse();
    const wrap = document.getElementById('moodHistory');
    if (!moods.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = '<h4 style="font-size:.95rem;margin-bottom:10px;color:var(--text)">Recent Logs</h4>' +
        moods.map(m => {
            const emoji = moodEmojiMap[m.label] || '🔹';
            const time = new Date(m.ts).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            return `<div class="mood-history-item"><span class="mood-history-emoji">${emoji}</span><span class="mood-history-label">${m.label}</span><span class="mood-history-time">${time}</span></div>`;
        }).join('');
}

// ══════════════════════════════════════
// 4. PRIVATE JOURNAL
// ══════════════════════════════════════
const JOURNAL_KEY = 'mindlift_journal';
function getJournalEntries() { return JSON.parse(localStorage.getItem(JOURNAL_KEY) || '[]'); }

function saveJournal() {
    const area = document.getElementById('journalArea');
    const text = area.value.trim();
    if (!text) return;
    const entries = getJournalEntries();
    entries.unshift({ text, ts: Date.now() });
    if (entries.length > 50) entries.pop();
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(entries));
    area.value = '';
    renderJournal();
}

function renderJournal() {
    const entries = getJournalEntries().slice(0, 5);
    const wrap = document.getElementById('journalEntries');
    if (!entries.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = entries.map(e => `
    <div class="journal-entry">
      <div class="journal-entry-date">${new Date(e.ts).toLocaleString()}</div>
      <div class="journal-entry-text">${escHtml(e.text)}</div>
    </div>`).join('');
}

// ══════════════════════════════════════
// 5. GRATITUDE JOURNAL
// ══════════════════════════════════════
const GRAT_KEY = 'mindlift_gratitude';
function getGratEntries() { return JSON.parse(localStorage.getItem(GRAT_KEY) || '[]'); }

function saveGratitude() {
    const area = document.getElementById('gratitudeArea');
    const text = area.value.trim();
    if (!text) return;
    const entries = getGratEntries();
    entries.unshift({ text, ts: Date.now() });
    if (entries.length > 50) entries.pop();
    localStorage.setItem(GRAT_KEY, JSON.stringify(entries));
    area.value = '';
    renderGratitude();
}

function renderGratitude() {
    const entries = getGratEntries().slice(0, 5);
    const wrap = document.getElementById('gratitudeEntries');
    if (!entries.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = entries.map(e => `
    <div class="journal-entry">
      <div class="journal-entry-date">🙏 ${new Date(e.ts).toLocaleString()}</div>
      <div class="journal-entry-text">${escHtml(e.text)}</div>
    </div>`).join('');
}

function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// ══════════════════════════════════════
// 6. FOCUS TIMER (Pomodoro)
// ══════════════════════════════════════
const FOCUS_DURATION = 25 * 60; // 25 minutes
let focusRemaining = FOCUS_DURATION;
let focusInterval = null;
let focusRunning = false;
const CIRCUMFERENCE = 2 * Math.PI * 96; // matches SVG circle r=96

function startFocusTimer() {
    if (focusRunning) return;
    focusRunning = true;
    document.getElementById('focusComplete').style.display = 'none';
    focusInterval = setInterval(() => {
        focusRemaining--;
        updateFocusDisplay();
        if (focusRemaining <= 0) {
            clearInterval(focusInterval);
            focusRunning = false;
            document.getElementById('focusComplete').style.display = 'block';
        }
    }, 1000);
}

function pauseFocusTimer() {
    clearInterval(focusInterval);
    focusRunning = false;
}

function resetFocusTimer() {
    clearInterval(focusInterval);
    focusRunning = false;
    focusRemaining = FOCUS_DURATION;
    updateFocusDisplay();
    document.getElementById('focusComplete').style.display = 'none';
}

function updateFocusDisplay() {
    const mins = Math.floor(focusRemaining / 60);
    const secs = focusRemaining % 60;
    document.getElementById('focusDisplay').textContent =
        String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    // Update SVG ring
    const progress = focusRemaining / FOCUS_DURATION;
    const ring = document.getElementById('focusRing');
    if (ring) {
        ring.style.strokeDasharray = CIRCUMFERENCE;
        ring.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);
    }
}

// ══════════════════════════════════════
// 7. GAMES
// ══════════════════════════════════════

// ── Game Tab Switching ──
function switchGame(name, btn) {
    document.querySelectorAll('.game-panel').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.game-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('game-' + name).style.display = 'block';
    if (btn) btn.classList.add('active');
    // Stop other games
    stopBalloonGame();
    stopSmileGame();
}

// ─────────────────────────────────
// 7a. BALLOON POP
// ─────────────────────────────────
let balloonScore = 0;
let balloonGameActive = false;
let balloonSpawnInterval = null;

const positiveMessages = [
    "You are amazing! ✨", "You matter! 💛", "Stay strong! 💪",
    "Keep going! 🌟", "You're doing great! 🎉", "Believe in yourself! 🌈",
    "You are enough! 💙", "Shine bright! ⭐", "You're incredible! 🎊",
    "Be proud! 🏆", "You're a warrior! ⚔️", "Keep shining! 🌞",
    "You rock! 🎸", "Dream big! 🚀", "Stay awesome! 😎",
];

function startBalloonGame() {
    balloonScore = 0;
    balloonGameActive = true;
    updateBalloonScore();
    const area = document.getElementById('balloonArea');
    area.innerHTML = '';
    document.getElementById('balloonMsg').textContent = '';
    spawnBalloon(); // immediate first
    balloonSpawnInterval = setInterval(() => {
        if (!balloonGameActive) return;
        spawnBalloon();
    }, 900);
}

function spawnBalloon() {
    const area = document.getElementById('balloonArea');
    if (!area || !balloonGameActive) return;
    const balloon = document.createElement('div');
    balloon.className = 'balloon';
    const colors = ['#e53170', '#7f5af0', '#2cb67d', '#ff8906', '#3da9fc', '#f25f4c', '#e16162', '#4db6ac'];
    balloon.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    balloon.style.left = (Math.random() * (area.offsetWidth - 50)) + 'px';

    balloon.addEventListener('click', () => {
        if (!balloonGameActive || balloon.classList.contains('popped')) return;
        balloonScore++;
        updateBalloonScore();
        const msg = positiveMessages[Math.floor(Math.random() * positiveMessages.length)];
        document.getElementById('balloonMsg').textContent = msg;
        balloon.classList.add('popped');
        setTimeout(() => { if (balloon.parentNode) balloon.remove(); }, 300);
    });

    area.appendChild(balloon);
    // Remove if not popped
    setTimeout(() => { if (balloon.parentNode) balloon.remove(); }, 4800);
}

function stopBalloonGame() {
    balloonGameActive = false;
    clearInterval(balloonSpawnInterval);
}

function updateBalloonScore() {
    const el = document.getElementById('balloonScore');
    if (el) el.textContent = balloonScore;
}

// ─────────────────────────────────
// 7b. COLOR CALM GAME
// ─────────────────────────────────
let colorScore = 0;
let targetColorIndex = -1;

const calmingColors = [
    { name: 'Calming Blue', color: '#5b8fb9' },
    { name: 'Soft Lavender', color: '#b47ae8' },
    { name: 'Gentle Green', color: '#6bcb77' },
    { name: 'Warm Peach', color: '#ffa07a' },
    { name: 'Soothing Teal', color: '#4db6ac' },
    { name: 'Soft Pink', color: '#f48fb1' },
    { name: 'Mellow Yellow', color: '#fff176' },
    { name: 'Ocean Aqua', color: '#4dd0e1' },
    { name: 'Misty Rose', color: '#ffe4e1' },
    { name: 'Sky Blue', color: '#87ceeb' },
];

function startColorGame() {
    colorScore = 0;
    updateColorScore();
    generateColorRound();
}

function generateColorRound() {
    const grid = document.getElementById('colorGrid');
    const instruction = document.getElementById('colorInstruction');

    targetColorIndex = Math.floor(Math.random() * calmingColors.length);
    instruction.textContent = `Tap the ${calmingColors[targetColorIndex].name}`;

    // Pick 5 random + target = 6 buttons
    let options = new Set([targetColorIndex]);
    while (options.size < 6) {
        options.add(Math.floor(Math.random() * calmingColors.length));
    }
    const shuffled = [...options].sort(() => Math.random() - 0.5);

    grid.innerHTML = shuffled.map(i =>
        `<button class="color-btn" style="background:${calmingColors[i].color}" onclick="pickColor(${i})" title="${calmingColors[i].name}"></button>`
    ).join('');
}

function pickColor(i) {
    if (i === targetColorIndex) {
        colorScore++;
        updateColorScore();
        generateColorRound();
    } else {
        const grid = document.getElementById('colorGrid');
        grid.classList.add('shake');
        setTimeout(() => grid.classList.remove('shake'), 400);
    }
}

function updateColorScore() {
    const el = document.getElementById('colorScore');
    if (el) el.textContent = colorScore;
}

// ─────────────────────────────────
// 7c. CATCH THE SMILE
// ─────────────────────────────────
let smileCanvas, smileCtx;
let smileCatches = 0;
let smileGameActive = false;
let smileys = [];
let mouseX = 300, mouseY = 300;
let smileAnimFrame = null;

function startSmileGame() {
    smileCanvas = document.getElementById('smileCanvas');
    smileCtx = smileCanvas.getContext('2d');
    // Set actual pixel size
    smileCanvas.width = smileCanvas.offsetWidth;
    smileCanvas.height = smileCanvas.offsetHeight || 380;
    smileCatches = 0;
    smileys = [];
    smileGameActive = true;
    updateSmileScore();
    document.getElementById('smileComplete').style.display = 'none';

    smileCanvas.onmousemove = (e) => {
        const rect = smileCanvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
    };
    // Touch support
    smileCanvas.ontouchmove = (e) => {
        e.preventDefault();
        const rect = smileCanvas.getBoundingClientRect();
        mouseX = e.touches[0].clientX - rect.left;
        mouseY = e.touches[0].clientY - rect.top;
    };

    smileLoop();
}

function smileLoop() {
    if (!smileGameActive) return;
    const W = smileCanvas.width;
    const H = smileCanvas.height;

    // Spawn smileys
    if (Math.random() < 0.04) {
        smileys.push({
            x: Math.random() * (W - 40) + 20,
            y: -25,
            speed: 1.2 + Math.random() * 2.5,
            size: 18 + Math.random() * 10,
        });
    }

    // Clear
    smileCtx.clearRect(0, 0, W, H);

    // Draw catcher (mouse circle)
    smileCtx.beginPath();
    smileCtx.arc(mouseX, mouseY, 28, 0, Math.PI * 2);
    smileCtx.fillStyle = 'rgba(127, 90, 240, 0.2)';
    smileCtx.fill();
    smileCtx.strokeStyle = 'rgba(127, 90, 240, 0.7)';
    smileCtx.lineWidth = 2.5;
    smileCtx.stroke();

    // Draw + inner glow
    smileCtx.beginPath();
    smileCtx.arc(mouseX, mouseY, 8, 0, Math.PI * 2);
    smileCtx.fillStyle = 'rgba(127, 90, 240, 0.5)';
    smileCtx.fill();

    // Update smileys
    for (let i = smileys.length - 1; i >= 0; i--) {
        const s = smileys[i];
        s.y += s.speed;

        // Draw smiley emoji
        smileCtx.font = `${s.size * 2}px serif`;
        smileCtx.textAlign = 'center';
        smileCtx.textBaseline = 'middle';
        smileCtx.fillText('😊', s.x, s.y);

        // Collision check
        const dx = s.x - mouseX;
        const dy = s.y - mouseY;
        if (Math.sqrt(dx * dx + dy * dy) < 38) {
            smileys.splice(i, 1);
            smileCatches++;
            updateSmileScore();
            if (smileCatches >= 10) {
                smileGameActive = false;
                document.getElementById('smileComplete').style.display = 'block';
                return;
            }
            continue;
        }

        // Off screen
        if (s.y > H + 30) smileys.splice(i, 1);
    }

    smileAnimFrame = requestAnimationFrame(smileLoop);
}

function stopSmileGame() {
    smileGameActive = false;
    if (smileAnimFrame) cancelAnimationFrame(smileAnimFrame);
}

function updateSmileScore() {
    const el = document.getElementById('smileScore');
    if (el) el.textContent = smileCatches;
}

// ══════════════════════════════════════
// 8. CHATBOT (Context-Aware, No Repeats)
// ══════════════════════════════════════
const chatHistory = [];     // {role:'user'|'bot', text:''}
const usedResponses = new Set(); // tracks responses already given

const botRules = [
    {
        keys: ['suicide', 'kill myself', 'end my life', 'want to die', 'self harm'],
        replies: [
            "I'm really concerned about you. Please reach out now — iCall: 9152987821 or Vandrevala: 1860-2662-345 (24/7). You matter, and help is available. 💛",
            "Your life has value. Please call a crisis helpline immediately — NIMHANS: 080-46110007 or Snehi: 044-24640050. Someone is waiting to help you right now. 💛",
            "I care about you. Please reach out to iCall TISS: 022-25521111 or Vandrevala: 1860-2662-345. You don't have to face this alone. 💛",
        ],
        priority: 100
    },
    {
        keys: ['stress', 'pressure', 'overwhelm', 'overwork', 'burned out', 'burnout'],
        replies: [
            "Let's try a breathing exercise together. 🌬️ Write down 3 things stressing you, then tackle the smallest one first. Small wins build momentum.",
            "Stress can feel heavy. Try the Deep Calm (4-7-8) breathing mode above — it activates your body's relaxation response. You've got this. 🌬️",
            "When overwhelmed, try this: close your eyes, take 3 deep breaths, then ask yourself 'What's the one smallest step I can take right now?' Start there. 💙",
        ]
    },
    {
        keys: ['sad', 'unhappy', 'down', 'depressed', 'lonely', 'alone', 'cry'],
        replies: [
            "I hear you. Your feelings are valid. 💙 Try writing in your gratitude journal — even one positive thing can gently shift your perspective.",
            "It's okay to feel sad. Sometimes writing it out helps — try the Private Journal above. And remember, reaching out to someone you trust can make a big difference. 💙",
            "Sadness is part of being human, and you're not alone in this. Try the Balloon Pop game above — each pop shows a positive message just for you. 🎈",
        ]
    },
    {
        keys: ['anxious', 'anxiety', 'nervous', 'panic', 'worried', 'fear', 'scared'],
        replies: [
            "Let's ground you: name 5 things you see, 4 you can touch, 3 you can hear, 2 you can smell, 1 you can taste. This brings you back to the present. 🌬️",
            "Anxiety can feel overwhelming, but it will pass. Try the Deep Calm breathing (4-7-8) above — it's scientifically proven to activate your calm response. 💙",
            "When anxiety spikes, try this: place both feet flat on the floor, press your palms together for 10 seconds, then slowly release. Repeat 3 times. You're safe. 🌿",
        ]
    },
    {
        keys: ['exam', 'test', 'study', 'grade', 'fail', 'assignment', 'deadline'],
        replies: [
            "Academic pressure is real. Try the Pomodoro technique — 25 min focus blocks with 5 min breaks. Use the Focus Timer above! 📚 You've got this!",
            "Break your study material into small chunks. Do one chunk, take a 5-min break with the breathing exercise, then the next chunk. Progress over perfection! 📚",
            "Feeling overwhelmed by academics? Write down all your tasks, pick the most urgent one, and set the Focus Timer for just 25 minutes. Start small. You can do this! ⏱️",
        ]
    },
    {
        keys: ['sleep', 'insomnia', 'tired', 'exhausted', 'fatigue', 'rest'],
        replies: [
            "Sleep is crucial for mental health. Try this tonight: no screens 30 min before bed, keep the room cool & dark, and try 4-7-8 breathing. 😴",
            "Your body needs rest to recharge. Try the Quick Calm breathing mode (3-3) before bed — it helps quiet the mind. Sweet dreams. 🌙",
            "Being tired affects everything — mood, focus, motivation. Even a 20-minute power nap or a short walk outside can help reset your energy. Take care. 😴",
        ]
    },
    {
        keys: ['friend', 'relationship', 'fight', 'argument', 'breakup', 'conflict'],
        replies: [
            "Relationship challenges are tough. It's okay to set boundaries. Take some space, then address the issue calmly. Would you like to journal about it? 💙",
            "Conflicts with people we care about hurt deeply. Try writing down your feelings in the journal before responding — it helps clarify your thoughts. 📝",
            "Sometimes the best thing is to take a step back and breathe. Give yourself permission to process before reacting. Your feelings matter too. 💙",
        ]
    },
    {
        keys: ['happy', 'great', 'good', 'amazing', 'wonderful', 'excited', 'joy'],
        replies: [
            "That's wonderful! 🎉 Savor this feeling. Write it in your gratitude journal so you can revisit it on harder days!",
            "I love hearing that! 😊 Your positive energy is contagious. Consider sharing a kind word with someone today — happiness multiplies when shared!",
            "Yay! 🌟 This is a great moment to capture. Write what made you happy in the gratitude journal — future you will thank you for it!",
        ]
    },
    {
        keys: ['thank', 'thanks', 'thank you'],
        replies: [
            "You're welcome! I'm always here whenever you need to talk. Take care of yourself. 💙",
            "Anytime! Remember, you deserve support. Don't hesitate to come back. 🌱",
            "Glad I could help! You're doing great just by showing up and taking care of your mental health. 💙",
        ]
    },
    {
        keys: ['help', 'support', 'need someone', 'talk'],
        replies: [
            "I'm here for you. You can try the breathing exercise, play a mood-boosting game, or just tell me what's on your mind. 💙",
            "You've already taken a brave step by reaching out. Tell me what's troubling you — or try the mood tracker to check in with yourself. 🌱",
            "I'm listening. Whether you want to vent, get a coping tip, or just be heard — I'm here. What's going on? 💙",
        ]
    },
    {
        keys: ['hello', 'hi', 'hey', 'howdy', 'sup', 'morning', 'evening'],
        replies: [
            "Hey there! 👋 How are you feeling right now? I'm here to listen.",
            "Hi! 😊 Welcome back. How's your day going? Let me know if you need anything.",
            "Hello! 🌱 Great to see you. What's on your mind today? I'm all ears.",
        ]
    },
    {
        keys: ['bored', 'boring', 'nothing'],
        replies: [
            "Try playing one of the mood-boosting games above! 🎮 Balloon Pop is great for a quick pick-me-up.",
            "Boredom can sometimes hide deeper feelings. What's one tiny thing that usually makes you smile? Even trying Color Calm above might help! 🎨",
            "How about a challenge? Try Catch the Smile — catch 10 smileys and boost your mood! 😊 Or write something you're grateful for today.",
        ]
    },
    {
        keys: ['angry', 'mad', 'frustrated', 'furious', 'rage'],
        replies: [
            "Clench your fists tight for 5 seconds, then slowly release. Repeat 3 times. Physical release can help calm the mind. 💪",
            "Anger is a valid emotion — it's telling you something matters. Try writing about what triggered it in the journal, then do a breathing exercise. 🌬️",
            "When anger rises, try this: breathe in for 4 counts, hold for 4, breathe out for 4. This 'box breathing' gives your brain time to catch up. 💪",
        ]
    },
    {
        keys: ['motivation', 'motivated', 'lazy', 'procrastinat'],
        replies: [
            "Start with just 2 minutes on the task. Use the Focus Timer above! ⏱️ Often, starting is the hardest part — momentum builds from there.",
            "The secret to beating procrastination: make the first step ridiculously small. 'Open the book' instead of 'study chapter 5.' Your brain loves easy wins! 🧠",
            "Motivation comes and goes — that's totally normal. What helped you feel motivated in the past? Try recreating that environment. And use the timer! ⏱️",
        ]
    },
    {
        keys: ['confident', 'confidence', 'self esteem', 'insecure'],
        replies: [
            "Write 3 things you did well today in the gratitude journal. You deserve to recognize your own strengths! 💪",
            "Confidence builds with small wins. Set a tiny goal today, accomplish it, and celebrate it — no matter how small. You're more capable than you think! 🌟",
            "Everyone feels insecure sometimes. Try this: replace 'I can't' with 'I'm learning to.' Be your own biggest supporter. 💙",
        ]
    },
    {
        keys: ['game', 'play', 'fun'],
        replies: [
            "Try the mood-boosting games! 🎮 Balloon Pop shows positive messages, Color Calm helps you relax, and Catch the Smile boosts happiness!",
            "Games are a great way to shift your mood! I'd recommend starting with Balloon Pop — each pop gives you an uplifting message. 🎈",
            "Want a calming challenge? Try Color Calm — matching calming colors is surprisingly soothing. Or go for Catch the Smile for a quick mood boost! 😊",
        ]
    },
    {
        keys: ['breathe', 'breathing', 'calm down', 'relax'],
        replies: [
            "Great idea! Try the Breathing Therapy section above. I recommend Deep Calm (4-7-8) for anxiety or Relax (4-4) for general calm. 🌬️",
            "Breathing is one of the most powerful tools you have. The Quick Calm (3-3) mode above is perfect for a fast reset. Try it now! 🌬️",
            "Your breath is your superpower. Try scrolling up to the Breathing Therapy section — pick a mode that feels right and follow the circle. 🌿",
        ]
    },
    {
        keys: ['what can you do', 'who are you', 'what are you', 'your name'],
        replies: [
            "I'm MindBot! 🤖 I can chat about your feelings, suggest coping tools, recommend games, breathing exercises, and more. Everything here is private and offline. 💙",
            "I'm MindBot, your mental health companion! 🌱 I can help with stress, sadness, anxiety, motivation — or just listen. Try asking me about anything on your mind!",
            "I'm MindBot! I offer support through conversation, and I can point you to breathing exercises, mood games, journals, and focus tools — all right on this page. 🤖",
        ]
    },
];

// Sentiment word banks for fallback
const posWords = ['good', 'great', 'fine', 'okay', 'nice', 'love', 'better', 'well', 'hope', 'happy', 'yes', 'awesome', 'cool', 'wonderful', 'fantastic', 'bright'];
const negWords = ['bad', 'not', 'wrong', 'hard', 'tough', 'difficult', 'hurt', 'pain', 'suffer', 'hate', 'worst', 'terrible', 'no', 'never', 'awful', 'horrible', 'miserable'];

const fallbackReplies = {
    positive: [
        "Glad things seem positive! Keep nurturing that energy. Is there anything specific on your mind?",
        "That sounds good! 😊 What's been the highlight of your day so far?",
        "Love your positive energy! Consider writing about this moment in the gratitude journal. 🌟",
    ],
    negative: [
        "It sounds like you're going through something difficult. I'm here to listen — tell me more. 💙",
        "I can sense things are tough right now. Would you like to try a breathing exercise, or tell me more about what's happening? 🌬️",
        "That sounds hard. Remember, it's okay to not be okay. I'm here, and so are the tools on this page. 💙",
    ],
    neutral: [
        "I'm here to support you. Tell me more about how you're feeling, or try one of the tools above. 🌱",
        "I'd love to help! Can you tell me a bit more about what's on your mind? 💙",
        "Sometimes just talking helps. What's been on your mind today? I'm listening. 🌿",
        "Feel free to explore the games, breathing exercises, or journal above — or just keep chatting with me! 😊",
    ],
};

function getBotReply(input) {
    const lower = input.toLowerCase();

    // 1) Match rules by keyword (highest priority wins)
    let best = null, bestPriority = -1;
    for (const rule of botRules) {
        const p = rule.priority || 0;
        if (rule.keys.some(k => lower.includes(k)) && p >= bestPriority) {
            best = rule; bestPriority = p;
        }
    }

    // 2) If rule matched, pick an unused response from that rule
    if (best) {
        const reply = pickUnused(best.replies);
        // Optionally add emotion context
        return addEmotionContext(reply);
    }

    // 3) Sentiment fallback
    let score = 0;
    posWords.forEach(w => { if (lower.includes(w)) score++; });
    negWords.forEach(w => { if (lower.includes(w)) score--; });

    if (score < 0) return addEmotionContext(pickUnused(fallbackReplies.negative));
    if (score > 0) return addEmotionContext(pickUnused(fallbackReplies.positive));
    return addEmotionContext(pickUnused(fallbackReplies.neutral));
}

// Pick a response that hasn't been used yet; reset pool if all used
function pickUnused(replies) {
    const available = replies.filter(r => !usedResponses.has(r));
    let chosen;
    if (available.length > 0) {
        chosen = available[Math.floor(Math.random() * available.length)];
    } else {
        // All used — clear history for this pool and pick fresh
        replies.forEach(r => usedResponses.delete(r));
        chosen = replies[Math.floor(Math.random() * replies.length)];
    }
    usedResponses.add(chosen);
    return chosen;
}

// Weave in the current detected emotion for contextual awareness
function addEmotionContext(reply) {
    if (!currentEmotion || !confirmedEmotion) return reply;
    const emo = confirmedEmotion.name;
    // Only add context sometimes, and only if the reply doesn't already address the emotion
    const emoLower = emo.toLowerCase();
    if (reply.toLowerCase().includes(emoLower)) return reply;
    // 30% chance to prepend emotion awareness
    if (Math.random() < 0.3) {
        const contextPrefixes = {
            Happy: "I can see you're feeling happy — that's great! ",
            Sad: "I notice you might be feeling sad right now. ",
            Stressed: "It looks like you might be stressed. ",
            Anxious: "I sense some anxiety. ",
            Tired: "You seem a bit tired. ",
            Calm: "You seem calm and centered. ",
            Focused: "You look focused — awesome! ",
        };
        const prefix = contextPrefixes[emo];
        if (prefix) return prefix + reply;
    }
    return reply;
}

function sendMessage() {
    const inp = document.getElementById('chatInput');
    const text = inp.value.trim();
    if (!text) return;
    chatHistory.push({ role: 'user', text });
    appendMsg(text, 'user');
    inp.value = '';
    setTimeout(() => {
        const reply = getBotReply(text);
        chatHistory.push({ role: 'bot', text: reply });
        appendMsg(reply, 'bot');
    }, 400 + Math.random() * 400);
}

function appendMsg(text, type) {
    const wrap = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = `msg ${type}`;
    div.innerHTML = type === 'bot' ? `<div class="bot-name">MindBot</div>${text}` : text;
    wrap.appendChild(div);
    wrap.scrollTop = wrap.scrollHeight;
}

// ══════════════════════════════════════
// 9. INIT
// ══════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    // Render existing data
    renderMoodChart();
    renderMoodInsights();
    renderMoodHistory();
    renderJournal();
    renderGratitude();
    updateFocusDisplay();

    // Welcome chat message
    setTimeout(() => appendMsg("Hi! I'm MindBot 🌱 — your supportive companion. Tell me how you're feeling, or try any of the tools on this page.", "bot"), 600);

    // Enter key for chat
    document.getElementById('chatInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') sendMessage();
    });
});
