const CLIENT_ID = '739966027132-j4ngpj7la2hpmkhil8l3d74dpbec1eq1.apps.googleusercontent.com';
const API_KEY = 'AIzaSyAqybdPUUYkIbeGBMxc39hMdaRrOhikD8s';
const SPREADSHEET_ID = '1jzTdEoshxRpuf9kHXI5vQLRtoCsSA-Uw-48JX8LxXaU';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets.readonly';

let tokenClient;
let isAuthenticated = false;

// Función para cargar la API de Google y verificar su disponibilidad
function loadGoogleApi() {
    return new Promise((resolve, reject) => {
        if (typeof gapi === 'undefined') {
            console.error("Error: La API de Google no está definida.");
            reject(new Error("La API de Google no está definida."));
        } else {
            gapi.load('client:auth2', {
                callback: () => {
                    console.log("API de Google cargada correctamente.");
                    resolve();
                },
                onerror: () => reject(new Error("Error al cargar la API de Google.")),
            });
        }
    });
}

// Inicializar el cliente de Google API
async function initializeGapiClient() {
    try {
        await loadGoogleApi();
        await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"],
        });
        console.log("Cliente GAPI inicializado.");
        initializeOAuth();
    } catch (error) {
        console.error("Error al inicializar GAPI:", error.message);
    }
}

// Inicializar OAuth y solicitar token si es necesario
function initializeOAuth() {
    if (typeof google === 'undefined') {
        console.error("Error: El objeto 'google' no está definido.");
        return;
    }

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response) => {
            if (response.error) {
                console.error('Error en autenticación:', response);
                return;
            }
            localStorage.setItem('google_access_token', response.access_token);
            gapi.client.setToken({ access_token: response.access_token });
            isAuthenticated = true;
            console.log('Autenticación exitosa.');
            loadSupervisoresData();
        },
    });

    const storedToken = localStorage.getItem('google_access_token');
    if (storedToken) {
        gapi.client.setToken({ access_token: storedToken });
        checkTokenValidity(storedToken);
    } else {
        requestConsent();
    }
}

// Verificar si el token es válido
function checkTokenValidity(token) {
    gapi.client.setToken({ access_token: token });
    gapi.client.request({ path: 'https://www.googleapis.com/oauth2/v1/tokeninfo' })
        .then(response => {
            if (response.result.error) {
                requestConsent();
            } else {
                isAuthenticated = true;
                loadSupervisoresData();
            }
        })
        .catch(() => requestConsent());
}

// Solicitar el consentimiento del usuario
function requestConsent() {
    tokenClient.requestAccessToken({ prompt: 'consent' });
}

// Función para cargar datos de la hoja "Supervisores"
async function loadSupervisoresData() {
    if (!isAuthenticated) {
        console.error("Error: No estás autenticado.");
        return;
    }

    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Supervisores!A1:H1',
        });

        const values = response.result.values[0] || [];
        
        document.getElementById("total-empleados").textContent = values[0] || "-";
        document.getElementById("tareas-asignadas").textContent = values[1] || "-";
        document.getElementById("tareas-completadas").textContent = values[2] || "-";
        document.getElementById("buses-servicio").textContent = values[3] || "-";

        console.log("Datos de supervisores cargados:", values);
    } catch (error) {
        console.error("Error al cargar los datos de la hoja Supervisores:", error.message);
    }
}

// Inicializar el cliente de la API cuando el DOM esté cargado
document.addEventListener("DOMContentLoaded", initializeGapiClient);