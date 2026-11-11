// ====== CONFIGURATION ======
const API_URL = "https://script.google.com/macros/s/AKfycbyJT_NBboGYXgyUuv0HBKha6-pujGtadd3RvP5jvfsjNs1xH6UZO-6oXxsgUmox1FMC/exec";

const MONTHS_FR = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
];

const RESEND_COOLDOWN_SECONDS = 60;

// Cache local des semaines (affichage immédiat des dernières données connues).
const WEEK_CACHE_PREFIX = 'agendaWeek_';
const WEEK_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000; // au-delà de 12 h, on n'affiche plus l'ancien cache
const PREFETCH_MAX_AGE_MS = 60 * 1000;              // pas de préchargement si la semaine a moins d'1 min
const MAX_WEEKS_AHEAD = 25;                          // on ne précharge pas au-delà (évite de créer des onglets inutiles)
const FUTURE_CACHE_KEY = 'agendaFuture';
let fetchCounter = 0;                                // identifie la dernière requête (évite les réponses périmées)

// ====== STATE ======
let state = {
    user: { name: '' },
    token: '',
    pendingEmail: '',      // email en attente de vérification (entre étape 1 et étape 2)
    currentWeek: '',       // Semaine réelle d'aujourd'hui (ex: "2026-W35")
    selectedWeek: '',      // Semaine affichée dans l'agenda
    mySlots: [],
    availableSlots: [],
    resendCooldownUntil: 0
};

// ====== DOM ELEMENTS ======
const sections = {
    login: document.getElementById('login-section'),
    verify: document.getElementById('verify-section'),
    dashboard: document.getElementById('dashboard-section'),
    booking: document.getElementById('booking-section'),
    future: document.getElementById('future-section')
};

const forms = {
    login: document.getElementById('login-form'),
    verify: document.getElementById('verify-form')
};

const btns = {
    logout: document.getElementById('logout-btn'),
    newBooking: document.getElementById('new-booking-btn'),
    backToDash: document.getElementById('back-to-dash-btn'),
    prevWeek: document.getElementById('prev-week-btn'),
    nextWeek: document.getElementById('next-week-btn'),
    todayBtn: document.getElementById('today-btn'),
    resendCode: document.getElementById('resend-code-btn'),
    backToLogin: document.getElementById('back-to-login-btn'),
    viewFuture: document.getElementById('view-future-btn'),
    backFromFuture: document.getElementById('back-from-future-btn')
};

const weekNav = {
    container: document.getElementById('week-nav'),
    trigger: document.getElementById('week-picker-trigger'),
    input: document.getElementById('week-input'),
    label: document.getElementById('week-label'),
    dates: document.getElementById('week-dates'),
    badge: document.getElementById('week-badge')
};

const containers = {
    mySlots: document.getElementById('my-slots-container'),
    availableSlots: document.getElementById('available-slots-container'),
    futureSlots: document.getElementById('future-slots-container')
};

const ui = {
    welcome: document.getElementById('welcome-message'),
    loader: document.getElementById('loader'),
    toast: document.getElementById('toast'),
    userEmailInput: document.getElementById('userEmail'),
    verifyCodeInput: document.getElementById('verifyCodeInput'),
    verifyTargetName: document.getElementById('verify-target-name')
};

// ====== INITIALIZATION ======
function init() {
    // Calculer la semaine ISO actuelle de manière exacte
    state.currentWeek = getISOWeekString(getEffectiveTodayForWeek());

    // Si l'app est ouverte depuis un lien de confirmation par email
    // (?week=2026-W41), on affiche directement cette semaine-là plutôt que
    // "la" semaine en cours — sinon une réservation faite pour une autre
    // semaine (passée ou future) semble ne jamais apparaître.
    const urlParams = new URLSearchParams(window.location.search);
    const linkedWeek = urlParams.get('week');
    const isValidWeek = linkedWeek && /^\d{4}-W\d{2}$/.test(linkedWeek);
    state.selectedWeek = isValidWeek ? linkedWeek : state.currentWeek;

    // Vérifier si un jeton de session valide est déjà stocké
    const savedToken = localStorage.getItem('agendaToken');
    const savedName = localStorage.getItem('agendaName');
    if (savedToken && savedName) {
        state.token = savedToken;
        state.user = { name: savedName };
        showSection('dashboard');
        renderWeekNavigator();
        fetchData();
    } else {
        showSection('login');
    }

    // Event Listeners — authentification
    forms.login.addEventListener('submit', handleRequestCode);
    forms.verify.addEventListener('submit', handleVerifyCode);
    btns.resendCode.addEventListener('click', handleResendCode);
    btns.backToLogin.addEventListener('click', resetToLoginStep);
    btns.logout.addEventListener('click', handleLogout);

    // Event Listeners — navigation
    btns.newBooking.addEventListener('click', () => showSection('booking'));
    btns.backToDash.addEventListener('click', () => showSection('dashboard'));
    btns.viewFuture.addEventListener('click', () => { showSection('future'); fetchMySessions(); });
    btns.backFromFuture.addEventListener('click', () => showSection('dashboard'));

    // Navigation semaines
    btns.prevWeek.addEventListener('click', () => shiftWeek(-1));
    btns.nextWeek.addEventListener('click', () => shiftWeek(1));
    btns.todayBtn.addEventListener('click', () => setWeek(state.currentWeek));

    // Sélecteur de date natif
    weekNav.trigger.addEventListener('click', () => {
        if (typeof weekNav.input.showPicker === 'function') {
            weekNav.input.showPicker();
        } else {
            weekNav.input.focus();
            weekNav.input.click();
        }
    });

    weekNav.input.addEventListener('change', (e) => {
        if (e.target.value) {
            setWeek(e.target.value);
        }
    });
}

// ====== AUTHENTIFICATION (code à usage unique par email) ======

async function handleRequestCode(e) {
    e.preventDefault();
    const email = ui.userEmailInput.value.trim();
    if (!email) return;

    showLoader();
    try {
        const payload = { action: 'requestCode', email };
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain' }
        });
        const data = await response.json();

        if (data.success) {
            state.pendingEmail = email;
            ui.verifyTargetName.textContent = data.name || email;
            ui.verifyCodeInput.value = '';
            showSection('verify');
            startResendCooldown();
            showToast(data.message || "Code envoyé.");
        } else {
            showToast(data.message || "Erreur lors de l'envoi du code.");
        }
    } catch (err) {
        console.error(err);
        showToast("Erreur de connexion avec Google.");
    }
    hideLoader();
}

async function handleVerifyCode(e) {
    e.preventDefault();
    const code = ui.verifyCodeInput.value.trim();
    if (!code) return;

    showLoader();
    try {
        const payload = { action: 'verifyCode', email: state.pendingEmail, code };
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain' }
        });
        const data = await response.json();

        if (data.success) {
            state.token = data.token;
            state.user = { name: data.name };
            localStorage.setItem('agendaToken', state.token);
            localStorage.setItem('agendaName', state.user.name);
            ui.verifyCodeInput.value = '';
            showSection('dashboard');
            renderWeekNavigator();
            fetchData();
        } else {
            showToast(data.message || "Code invalide.");
        }
    } catch (err) {
        console.error(err);
        showToast("Erreur de connexion avec Google.");
    }
    hideLoader();
}

async function handleResendCode() {
    if (Date.now() < state.resendCooldownUntil) return;

    showLoader();
    try {
        const payload = { action: 'requestCode', email: state.pendingEmail };
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain' }
        });
        const data = await response.json();
        showToast(data.message || (data.success ? "Nouveau code envoyé." : "Erreur."));
        if (data.success) startResendCooldown();
    } catch (err) {
        console.error(err);
        showToast("Erreur de connexion avec Google.");
    }
    hideLoader();
}

function startResendCooldown() {
    state.resendCooldownUntil = Date.now() + RESEND_COOLDOWN_SECONDS * 1000;
    btns.resendCode.disabled = true;

    const update = () => {
        const remaining = Math.ceil((state.resendCooldownUntil - Date.now()) / 1000);
        if (remaining <= 0) {
            btns.resendCode.disabled = false;
            btns.resendCode.textContent = "Renvoyer le code";
        } else {
            btns.resendCode.textContent = `Renvoyer le code (${remaining}s)`;
            setTimeout(update, 1000);
        }
    };
    update();
}

function resetToLoginStep() {
    ui.userEmailInput.value = '';
    state.pendingEmail = '';
    showSection('login');
}

function handleLogout() {
    localStorage.removeItem('agendaToken');
    localStorage.removeItem('agendaName');
    clearWeekCache();
    state.token = '';
    state.user = { name: '' };
    resetToLoginStep();
}

function handleSessionExpired() {
    handleLogout();
    showToast("Votre session a expiré, veuillez vous reconnecter.");
}

// ====== GESTION DES DATES & SEMAINES (ISO-8601 ROBUSTE) ======

function getISOWeekString(d) {
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayNr = (target.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
        target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
    const year = new Date(firstThursday).getFullYear();
    return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

// "Aujourd'hui", sauf le week-end : samedi et dimanche renvoient le lundi
// suivant. Les studios ne fonctionnant que du lundi au vendredi, "la semaine
// en cours" un week-end n'a plus rien à proposer — on pointe directement sur
// la semaine utile suivante, cohérent avec le même calcul côté serveur.
function getEffectiveTodayForWeek() {
    const now = new Date();
    const day = now.getDay(); // 0 = dimanche, 6 = samedi
    if (day === 0) { now.setDate(now.getDate() + 1); }
    else if (day === 6) { now.setDate(now.getDate() + 2); }
    return now;
}

function getMondayFromWeekString(weekStr) {
    const [yearStr, weekNumStr] = weekStr.split('-W');
    const year = parseInt(yearStr, 10);
    const week = parseInt(weekNumStr, 10);

    const jan4 = new Date(year, 0, 4);
    const day = (jan4.getDay() + 6) % 7;
    const monW1 = new Date(year, 0, 4 - day);
    return new Date(monW1.getFullYear(), monW1.getMonth(), monW1.getDate() + (week - 1) * 7);
}

function shiftWeek(offset) {
    const monday = getMondayFromWeekString(state.selectedWeek);
    monday.setDate(monday.getDate() + (offset * 7));
    setWeek(getISOWeekString(monday));
}

function setWeek(weekStr) {
    if (state.selectedWeek === weekStr) return;
    state.selectedWeek = weekStr;
    renderWeekNavigator();
    fetchData();
}

function renderWeekNavigator() {
    const parts = state.selectedWeek.split('-W');
    const weekNumber = parseInt(parts[1], 10);
    const monday = getMondayFromWeekString(state.selectedWeek);
    const friday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4);

    weekNav.label.textContent = `Semaine ${weekNumber} (${parts[0]})`;

    const sameMonth = monday.getMonth() === friday.getMonth();
    let datesStr = '';
    if (sameMonth) {
        datesStr = `${monday.getDate()} au ${friday.getDate()} ${MONTHS_FR[friday.getMonth()]} ${friday.getFullYear()}`;
    } else {
        datesStr = `${monday.getDate()} ${MONTHS_FR[monday.getMonth()]} au ${friday.getDate()} ${MONTHS_FR[friday.getMonth()]} ${friday.getFullYear()}`;
    }
    weekNav.dates.textContent = datesStr;
    weekNav.input.value = state.selectedWeek;

    if (state.selectedWeek === state.currentWeek) {
        weekNav.badge.textContent = "Semaine en cours";
        weekNav.badge.className = "week-badge current";
        btns.todayBtn.classList.add('hidden');
    } else if (state.selectedWeek > state.currentWeek) {
        weekNav.badge.textContent = "Semaine future";
        weekNav.badge.className = "week-badge";
        btns.todayBtn.classList.remove('hidden');
    } else {
        weekNav.badge.textContent = "Semaine passée";
        weekNav.badge.className = "week-badge";
        btns.todayBtn.classList.remove('hidden');
    }
}

// ====== ACTIONS (authentifiées par jeton de session) ======

// ---- Cache local des semaines ----

function readWeekCache(week) {
    try {
        const raw = localStorage.getItem(WEEK_CACHE_PREFIX + week);
        if (!raw) return null;
        const c = JSON.parse(raw);
        if (!c || !c.ts || (Date.now() - c.ts) > WEEK_CACHE_MAX_AGE_MS) return null;
        return c;
    } catch (e) { return null; }
}

function writeWeekCache(week, mySlots, availableSlots) {
    try {
        localStorage.setItem(WEEK_CACHE_PREFIX + week, JSON.stringify({ ts: Date.now(), mySlots, availableSlots }));
    } catch (e) { /* stockage plein ou indisponible : sans importance */ }
}

function clearWeekCache(week) {
    try {
        if (week) { localStorage.removeItem(WEEK_CACHE_PREFIX + week); return; }
        Object.keys(localStorage)
            .filter(k => k.indexOf(WEEK_CACHE_PREFIX) === 0)
            .forEach(k => localStorage.removeItem(k));
        localStorage.removeItem(FUTURE_CACHE_KEY);
    } catch (e) { /* ignore */ }
}

function shiftWeekId(weekStr, offset) {
    const monday = getMondayFromWeekString(weekStr);
    monday.setDate(monday.getDate() + offset * 7);
    return getISOWeekString(monday);
}

// Charge la semaine affichée.
// - Si une copie récente existe : affichage immédiat, puis mise à jour discrète en arrière-plan.
// - Sinon (ou si fresh === true, par ex. après une réservation) : écran de chargement classique.
async function fetchData(options) {
    const fresh = !!(options && options.fresh);
    const week = state.selectedWeek;
    const myFetch = ++fetchCounter;

    const cached = fresh ? null : readWeekCache(week);
    if (cached) {
        state.mySlots = cached.mySlots || [];
        state.availableSlots = cached.availableSlots || [];
        renderDashboard();
        renderBooking();
    } else {
        showLoader();
    }

    try {
        const url = `${API_URL}?action=getData&token=${encodeURIComponent(state.token)}&week=${encodeURIComponent(week)}`;
        const response = await fetch(url);
        const data = await response.json();

        // Une requête plus récente a été lancée entre-temps (changement de semaine) : on ignore cette réponse
        if (myFetch !== fetchCounter) { if (!cached) hideLoader(); return; }

        if (data.success) {
            state.mySlots = data.mySlots || [];
            state.availableSlots = data.availableSlots || [];
            writeWeekCache(week, state.mySlots, state.availableSlots);
            renderDashboard();
            renderBooking();
            prefetchNeighbourWeeks(week);
        } else if (data.sessionExpired) {
            handleSessionExpired();
        } else if (!cached) {
            showToast("Erreur lors de la récupération des données : " + (data.message || ''));
        }
    } catch (err) {
        console.error(err);
        if (myFetch === fetchCounter) {
            showToast(cached ? "Hors connexion : données de votre dernière visite." : "Erreur de connexion avec Google.");
        }
    }
    if (myFetch === fetchCounter) hideLoader();
}

// Précharge discrètement la semaine suivante (et la précédente si elle n'est pas passée),
// pour que le changement de semaine soit instantané.
async function prefetchNeighbourWeeks(week) {
    const candidates = [shiftWeekId(week, 1)];
    const prev = shiftWeekId(week, -1);
    if (prev >= state.currentWeek) candidates.push(prev);

    const limit = shiftWeekId(state.currentWeek, MAX_WEEKS_AHEAD);

    for (const w of candidates) {
        if (w > limit) continue;
        const existing = readWeekCache(w);
        if (existing && (Date.now() - existing.ts) < PREFETCH_MAX_AGE_MS) continue;
        // On s'arrête si l'utilisateur a changé de semaine ou de session entre-temps
        if (state.selectedWeek !== week || !state.token) return;
        try {
            const url = `${API_URL}?action=getData&token=${encodeURIComponent(state.token)}&week=${encodeURIComponent(w)}`;
            const response = await fetch(url);
            const data = await response.json();
            if (data.success && state.token) writeWeekCache(w, data.mySlots || [], data.availableSlots || []);
            else return; // erreur ou session expirée : on n'insiste pas
        } catch (e) { return; }
    }
}

// Vue « 6 mois » : affiche tout de suite la dernière liste connue, puis la met à jour.
async function fetchMySessions(options) {
    const fresh = !!(options && options.fresh);
    let cached = null;
    if (!fresh) {
        try {
            const raw = localStorage.getItem(FUTURE_CACHE_KEY);
            const c = raw ? JSON.parse(raw) : null;
            if (c && c.ts && (Date.now() - c.ts) <= WEEK_CACHE_MAX_AGE_MS) cached = c;
        } catch (e) { /* ignore */ }
    }

    if (cached) {
        renderFutureSlots(cached.sessions || []);
    } else {
        showLoader();
        containers.futureSlots.innerHTML = '<div class="empty-state">Chargement...</div>';
    }

    try {
        const url = `${API_URL}?action=getMySessions&token=${encodeURIComponent(state.token)}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
            try { localStorage.setItem(FUTURE_CACHE_KEY, JSON.stringify({ ts: Date.now(), sessions: data.sessions || [] })); } catch (e) { /* ignore */ }
            renderFutureSlots(data.sessions || []);
        } else if (data.sessionExpired) {
            handleSessionExpired();
        } else if (!cached) {
            showToast("Erreur lors de la récupération de vos réservations : " + (data.message || ''));
        }
    } catch (err) {
        console.error(err);
        showToast(cached ? "Hors connexion : liste de votre dernière visite." : "Erreur de connexion avec Google.");
    }
    hideLoader();
}

async function bookSlot(day, slot, studio) {
    if (!confirm(`Demander la réservation pour ${day} (${slot}) en ${studio} ?`)) return;

    showLoader();
    try {
        const payload = {
            action: 'requestBooking',
            token: state.token,
            week: state.selectedWeek,
            day: day,
            slot: slot,
            studio: studio
        };

        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain' }
        });

        const data = await response.json();
        if (data.success) {
            showToast("Demande envoyée pour validation !");
            showSection('dashboard');
            clearWeekCache(state.selectedWeek);
            fetchData({ fresh: true });
        } else if (data.sessionExpired) {
            handleSessionExpired();
        } else {
            showToast("Erreur: " + data.message);
        }
    } catch(err) {
        console.error(err);
        showToast("Erreur lors de la demande.");
    }
    hideLoader();
}

async function cancelSlot(week, day, slot, studio) {
    const targetWeek = week || state.selectedWeek;
    if (!confirm(`Êtes-vous sûr de vouloir annuler votre créneau du ${day} (${slot}) pour la ${targetWeek} ?`)) return;

    showLoader();
    try {
        const payload = {
            action: 'cancelBooking',
            token: state.token,
            week: targetWeek,
            day: day,
            slot: slot,
            studio: studio
        };

        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain' }
        });

        const data = await response.json();
        if (data.success) {
            showToast("Réservation annulée.");
            // Rafraîchir la vue actuellement affichée — la vue agrégée "6 mois"
            // n'a pas la même source de données que le tableau de bord semaine par semaine.
            clearWeekCache(targetWeek);
            try { localStorage.removeItem(FUTURE_CACHE_KEY); } catch (e) { /* ignore */ }
            if (sections.future && sections.future.classList.contains('active')) {
                fetchMySessions({ fresh: true });
            } else {
                fetchData({ fresh: true });
            }
        } else if (data.sessionExpired) {
            handleSessionExpired();
        } else {
            showToast("Erreur: " + data.message);
        }
    } catch(err) {
        console.error(err);
        showToast("Erreur lors de l'annulation.");
    }
    hideLoader();
}

// ====== RENDERING ======
function renderDashboard() {
    ui.welcome.textContent = `Bonjour, ${state.user.name}`;
    containers.mySlots.innerHTML = '';

    if (state.mySlots.length === 0) {
        containers.mySlots.innerHTML = '<div class="empty-state">Vous n\'avez aucun créneau réservé sur cette semaine.</div>';
        return;
    }

    state.mySlots.forEach(slot => {
        const card = document.createElement('div');
        card.className = 'slot-card';
        card.innerHTML = `
            <div class="slot-header">
                <div>
                    <div class="slot-day">${slot.day}</div>
                    <div class="slot-time">${slot.time}</div>
                </div>
                <div class="slot-studio">${slot.studio}</div>
            </div>
            <button class="btn-danger" onclick="cancelSlot('${slot.week || state.selectedWeek}', '${slot.day}', '${slot.time}', '${slot.studio}')">Annuler ce créneau</button>
        `;
        containers.mySlots.appendChild(card);
    });
}

// La liste arrive déjà triée chronologiquement (semaine par semaine, dans
// l'ordre où les lignes apparaissent dans chaque feuille) — pas besoin de
// re-trier côté client.
function renderFutureSlots(sessions) {
    containers.futureSlots.innerHTML = '';

    if (sessions.length === 0) {
        containers.futureSlots.innerHTML = '<div class="empty-state">Aucune réservation à venir sur les prochains mois.</div>';
        return;
    }

    let lastWeek = null;
    sessions.forEach(slot => {
        if (slot.week !== lastWeek) {
            const heading = document.createElement('div');
            heading.className = 'future-week-heading';
            heading.textContent = weekLabelFromId(slot.week);
            containers.futureSlots.appendChild(heading);
            lastWeek = slot.week;
        }

        const card = document.createElement('div');
        card.className = 'slot-card';
        card.innerHTML = `
            <div class="slot-header">
                <div>
                    <div class="slot-day">${slot.day}</div>
                    <div class="slot-time">${slot.time}</div>
                </div>
                <div class="slot-studio">${slot.studio}</div>
            </div>
            <button class="btn-danger" onclick="cancelSlot('${slot.week}', '${slot.day}', '${slot.time}', '${slot.studio}')">Annuler ce créneau</button>
        `;
        containers.futureSlots.appendChild(card);
    });
}

function weekLabelFromId(weekId) {
    const parts = weekId.split('-W');
    return `Semaine ${parseInt(parts[1], 10)} (${parts[0]})`;
}

function renderBooking() {
    containers.availableSlots.innerHTML = '';

    if (state.availableSlots.length === 0) {
        containers.availableSlots.innerHTML = '<div class="empty-state">Aucun créneau disponible pour cette semaine.</div>';
        return;
    }

    state.availableSlots.forEach(slot => {
        const card = document.createElement('div');
        card.className = 'slot-card';

        const selectId = `select-${slot.day.replace(/[^a-zA-Z0-9]/g, '')}-${slot.time.replace(/[^a-zA-Z0-9]/g, '')}`;
        const studioOptions = slot.studios.map(s => `<option value="${s}">${s}</option>`).join('');

        card.innerHTML = `
            <div class="slot-header">
                <div>
                    <div class="slot-day">${slot.day}</div>
                    <div class="slot-time">${slot.time}</div>
                </div>
            </div>
            <div class="form-group" style="margin-bottom:0.25rem;">
                <label style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.25rem;">Studio disponible :</label>
                <select id="${selectId}">
                    ${studioOptions}
                </select>
            </div>
            <button class="btn-primary" style="margin-top:0.25rem;"
                onclick="bookSlot('${slot.day}', '${slot.time}', document.getElementById('${selectId}').value)">
                Demander ce créneau
            </button>
        `;
        containers.availableSlots.appendChild(card);
    });
}

// ====== UTILS ======
function showSection(sectionName) {
    Object.values(sections).forEach(s => {
        if (s) {
            s.classList.remove('active');
            s.classList.add('hidden');
        }
    });

    if (sections[sectionName]) {
        sections[sectionName].classList.add('active');
        sections[sectionName].classList.remove('hidden');
    }

    if (sectionName === 'login' || sectionName === 'verify') {
        btns.logout.classList.add('hidden');
    } else {
        btns.logout.classList.remove('hidden');
    }

    if (sectionName === 'login' || sectionName === 'verify' || sectionName === 'future') {
        weekNav.container.classList.add('hidden');
    } else {
        weekNav.container.classList.remove('hidden');
    }
}

function showLoader() { ui.loader.classList.remove('hidden'); }
function hideLoader() { ui.loader.classList.add('hidden'); }

function showToast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.remove('hidden');
    setTimeout(() => ui.toast.classList.add('hidden'), 3500);
}

// Service worker : garde les fichiers de l'appli en cache (démarrage plus rapide, fonctionne même réseau lent)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service worker non enregistré :', err));
    });
}

// Démarrage de l'application
init();
