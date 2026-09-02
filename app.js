// ====== CONFIGURATION ======
const API_URL = "https://script.google.com/macros/s/AKfycbyVke7L-k43hs09d8XTiuF_OVL-roPW4zDLLhZRtYbn9IZkQuIx2C2BLYdbr2VuTl0/exec";

const MONTHS_FR = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
];

const RESEND_COOLDOWN_SECONDS = 60;

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
    booking: document.getElementById('booking-section')
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
    backToLogin: document.getElementById('back-to-login-btn')
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
    availableSlots: document.getElementById('available-slots-container')
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
    state.currentWeek = getISOWeekString(new Date());

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

async function fetchData() {
    showLoader();
    try {
        const url = `${API_URL}?action=getData&token=${encodeURIComponent(state.token)}&week=${encodeURIComponent(state.selectedWeek)}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
            state.mySlots = data.mySlots || [];
            state.availableSlots = data.availableSlots || [];
            renderDashboard();
            renderBooking();
        } else if (data.sessionExpired) {
            handleSessionExpired();
        } else {
            showToast("Erreur lors de la récupération des données : " + (data.message || ''));
        }
    } catch (err) {
        console.error(err);
        showToast("Erreur de connexion avec Google.");
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
            fetchData();
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
            fetchData();
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
        weekNav.container.classList.add('hidden');
    } else {
        btns.logout.classList.remove('hidden');
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

// Démarrage de l'application
init();
