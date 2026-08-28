// ====== CONFIGURATION ======
// /!\ REMPLACEZ CETTE URL PAR CELLE FOURNIE PAR GOOGLE APPS SCRIPT LORS DU DÉPLOIEMENT /!\
const API_URL = "https://script.google.com/macros/s/AKfycbyVke7L-k43hs09d8XTiuF_OVL-roPW4zDLLhZRtYbn9IZkQuIx2C2BLYdbr2VuTl0/exec";

const MONTHS_FR = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
];

// ====== STATE ======
let state = {
    user: { name: '', email: '' },
    currentWeek: '',     // Semaine réelle d'aujourd'hui (ex: "2026-W35")
    selectedWeek: '',    // Semaine affichée dans l'agenda
    mySlots: [],
    availableSlots: []
};

// ====== DOM ELEMENTS ======
const sections = {
    login: document.getElementById('login-section'),
    dashboard: document.getElementById('dashboard-section'),
    booking: document.getElementById('booking-section')
};

const forms = { login: document.getElementById('login-form') };
const btns = {
    logout: document.getElementById('logout-btn'),
    newBooking: document.getElementById('new-booking-btn'),
    backToDash: document.getElementById('back-to-dash-btn'),
    prevWeek: document.getElementById('prev-week-btn'),
    nextWeek: document.getElementById('next-week-btn'),
    todayBtn: document.getElementById('today-btn')
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
    toast: document.getElementById('toast')
};

// ====== INITIALIZATION ======
function init() {
    // Déterminer la semaine actuelle
    state.currentWeek = getCurrentISOWeek();
    state.selectedWeek = state.currentWeek;

    // Check if user is already logged in (localStorage)
    const savedUser = localStorage.getItem('agendaUser');
    if (savedUser) {
        state.user = JSON.parse(savedUser);
        showSection('dashboard');
        renderWeekNavigator();
        fetchData();
    }

    // Event Listeners
    forms.login.addEventListener('submit', handleLogin);
    btns.logout.addEventListener('click', handleLogout);
    btns.newBooking.addEventListener('click', () => showSection('booking'));
    btns.backToDash.addEventListener('click', () => showSection('dashboard'));

    // Navigation semaines
    btns.prevWeek.addEventListener('click', () => shiftWeek(-1));
    btns.nextWeek.addEventListener('click', () => shiftWeek(1));
    btns.todayBtn.addEventListener('click', () => setWeek(state.currentWeek));

    // Sélecteur de date / week natif
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

// ====== GESTION DES DATES & SEMAINES ======

function getCurrentISOWeek() {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const yyyy = monday.getFullYear();
    const wk = getISOWeekNumber(monday);
    return `${yyyy}-W${String(wk).padStart(2, '0')}`;
}

function getISOWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getMondayFromISOWeek(weekStr) {
    const parts = weekStr.split('-W');
    const year = parseInt(parts[0], 10);
    const week = parseInt(parts[1], 10);
    const jan4 = new Date(year, 0, 4);
    const dayOfW = jan4.getDay() || 7;
    const monW1 = new Date(jan4);
    monW1.setDate(jan4.getDate() - (dayOfW - 1));
    const result = new Date(monW1);
    result.setDate(monW1.getDate() + (week - 1) * 7);
    return result;
}

function shiftWeek(offset) {
    const monday = getMondayFromISOWeek(state.selectedWeek);
    monday.setDate(monday.getDate() + (offset * 7));
    const yyyy = monday.getFullYear();
    const wk = getISOWeekNumber(monday);
    const newWeekStr = `${yyyy}-W${String(wk).padStart(2, '0')}`;
    setWeek(newWeekStr);
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
    const monday = getMondayFromISOWeek(state.selectedWeek);
    
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);

    weekNav.label.textContent = `Semaine ${weekNumber} (${parts[0]})`;
    
    // Format "24 août - 28 août 2026"
    const sameMonth = monday.getMonth() === friday.getMonth();
    let datesStr = '';
    if (sameMonth) {
        datesStr = `${monday.getDate()} au ${friday.getDate()} ${MONTHS_FR[friday.getMonth()]} ${friday.getFullYear()}`;
    } else {
        datesStr = `${monday.getDate()} ${MONTHS_FR[monday.getMonth()]} au ${friday.getDate()} ${MONTHS_FR[friday.getMonth()]} ${friday.getFullYear()}`;
    }
    weekNav.dates.textContent = datesStr;
    weekNav.input.value = state.selectedWeek;

    // Badge d'indication temporelle
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

// ====== ACTIONS ======
function handleLogin(e) {
    e.preventDefault();
    const name = document.getElementById('userName').value.trim();
    const email = document.getElementById('userEmail').value.trim();
    
    if (name && email) {
        state.user = { name, email };
        localStorage.setItem('agendaUser', JSON.stringify(state.user));
        showSection('dashboard');
        renderWeekNavigator();
        fetchData();
    }
}

function handleLogout() {
    localStorage.removeItem('agendaUser');
    state.user = { name: '', email: '' };
    showSection('login');
}

async function fetchData() {
    if(API_URL === "METTEZ_VOTRE_URL_GOOGLE_APPS_SCRIPT_ICI") {
        showToast("Erreur: L'URL de l'API n'est pas configurée dans app.js");
        return;
    }
    
    showLoader();
    try {
        const url = `${API_URL}?action=getData&name=${encodeURIComponent(state.user.name)}&week=${encodeURIComponent(state.selectedWeek)}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
            state.mySlots = data.mySlots || [];
            state.availableSlots = data.availableSlots || [];
            renderDashboard();
            renderBooking();
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
    const monday = getMondayFromISOWeek(state.selectedWeek);
    if (!confirm(`Demander la réservation pour ${day} (${slot}) en ${studio} ?`)) return;
    
    showLoader();
    try {
        const payload = {
            action: 'requestBooking',
            week: state.selectedWeek,
            name: state.user.name,
            email: state.user.email,
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
        } else {
            showToast("Erreur: " + data.message);
        }
    } catch(err) {
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
            week: targetWeek,
            name: state.user.name,
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
        } else {
            showToast("Erreur: " + data.message);
        }
    } catch(err) {
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
    Object.values(sections).forEach(s => s.classList.remove('active'));
    sections[sectionName].classList.add('active');
    
    if (sectionName === 'login') {
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
