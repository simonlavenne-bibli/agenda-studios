// ====== CONFIGURATION ======
// /!\ REMPLACEZ CETTE URL PAR CELLE FOURNIE PAR GOOGLE APPS SCRIPT LORS DU DÉPLOIEMENT /!\
const API_URL = "https://script.google.com/macros/s/1V__oIykN4ExZOPPjd84yv62Qn5I5Sd41Obv6_REHAU8/exec";

// ====== STATE ======
let state = {
    user: { name: '', email: '' },
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
    backToDash: document.getElementById('back-to-dash-btn')
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
    // Check if user is already logged in (localStorage)
    const savedUser = localStorage.getItem('agendaUser');
    if (savedUser) {
        state.user = JSON.parse(savedUser);
        showSection('dashboard');
        fetchData();
    }

    // Event Listeners
    forms.login.addEventListener('submit', handleLogin);
    btns.logout.addEventListener('click', handleLogout);
    btns.newBooking.addEventListener('click', () => showSection('booking'));
    btns.backToDash.addEventListener('click', () => showSection('dashboard'));
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
        const response = await fetch(`${API_URL}?action=getData&name=${encodeURIComponent(state.user.name)}`);
        const data = await response.json();
        
        if (data.success) {
            state.mySlots = data.mySlots;
            state.availableSlots = data.availableSlots;
            renderDashboard();
            renderBooking();
        } else {
            showToast("Erreur lors de la récupération des données.");
        }
    } catch (err) {
        console.error(err);
        showToast("Erreur de connexion avec Google.");
    }
    hideLoader();
}

async function bookSlot(day, slot, studio) {
    if (!confirm(`Demander la réservation du ${day} (${slot}) en ${studio} ?`)) return;
    
    showLoader();
    try {
        const payload = {
            action: 'requestBooking',
            name: state.user.name,
            email: state.user.email,
            day: day,
            slot: slot,
            studio: studio
        };
        
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain' } // Evite les problèmes de CORS preflight
        });
        
        const data = await response.json();
        if (data.success) {
            showToast("Demande envoyée pour approbation !");
            showSection('dashboard');
            fetchData(); // Refresh data
        } else {
            showToast("Erreur: " + data.message);
        }
    } catch(err) {
        showToast("Erreur lors de la demande.");
    }
    hideLoader();
}

async function cancelSlot(day, slot, studio) {
    if (!confirm(`Êtes-vous sûr de vouloir annuler votre créneau du ${day} (${slot}) ?`)) return;
    
    showLoader();
    try {
        const payload = {
            action: 'cancelBooking',
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
            fetchData(); // Refresh data
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
        containers.mySlots.innerHTML = '<div class="empty-state">Vous n\'avez aucune réservation future.</div>';
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
            <button class="btn-danger" onclick="cancelSlot('${slot.day}', '${slot.time}', '${slot.studio}')">Annuler</button>
        `;
        containers.mySlots.appendChild(card);
    });
}

function renderBooking() {
    containers.availableSlots.innerHTML = '';
    
    if (state.availableSlots.length === 0) {
        containers.availableSlots.innerHTML = '<div class="empty-state">Aucun créneau disponible pour le moment.</div>';
        return;
    }
    
    state.availableSlots.forEach(slot => {
        const card = document.createElement('div');
        card.className = 'slot-card';
        
        // Créer un select pour les studios disponibles
        let studioOptions = slot.studios.map(s => `<option value="${s}">${s}</option>`).join('');
        
        card.innerHTML = `
            <div class="slot-header">
                <div>
                    <div class="slot-day">${slot.day}</div>
                    <div class="slot-time">${slot.time}</div>
                </div>
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <select id="select-${slot.day}-${slot.time.replace(/ /g, '')}">
                    ${studioOptions}
                </select>
            </div>
            <button class="btn-primary" style="margin-top:0.5rem;" 
                onclick="bookSlot('${slot.day}', '${slot.time}', document.getElementById('select-${slot.day}-${slot.time.replace(/ /g, '')}').value)">
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
    } else {
        btns.logout.classList.remove('hidden');
    }
}

function showLoader() { ui.loader.classList.remove('hidden'); }
function hideLoader() { ui.loader.classList.add('hidden'); }

function showToast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.remove('hidden');
    setTimeout(() => ui.toast.classList.add('hidden'), 3000);
}

// Start app
init();
