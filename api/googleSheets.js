const CLIENT_ID = '739966027132-j4ngpj7la2hpmkhil8l3d74dpbec1eq1.apps.googleusercontent.com';
const API_KEY = 'AIzaSyAqybdPUUYkIbeGBMxc39hMdaRrOhikD8s';
const SPREADSHEET_ID = '1jzTdEoshxRpuf9kHXI5vQLRtoCsSA-Uw-48JX8LxXaU';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/spreadsheets.readonly';

// Variables globales
let tokenClient;
let isAuthenticated = false;

// Cargar la API de Google
export function initializeGapiClient() {
    return new Promise((resolve, reject) => {
        gapi.load('client', async () => {
            try {
                await gapi.client.init({
                    apiKey: API_KEY,
                    discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"]
                });
                initializeOAuth();
                resolve();
            } catch (error) {
                console.error("Error inicializando el cliente de Google API:", error);
                reject("Las bibliotecas de Google no están cargadas completamente.");
            }
        });
    });
}

// Inicializar OAuth con Google
function initializeOAuth() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response) => {
            if (response.error) {
                console.error('Error en autenticación:', response);
                return;
            }
            // Almacena el token de acceso en localStorage
            localStorage.setItem('google_access_token', response.access_token);
            gapi.client.setToken({ access_token: response.access_token });
            isAuthenticated = true;
            console.log('Autenticación exitosa');
        },
    });

    const storedToken = localStorage.getItem('google_access_token');
    if (storedToken) {
        gapi.client.setToken({ access_token: storedToken });
        isAuthenticated = true;
        console.log('Autenticado con token almacenado');
    } else {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    }
}

// Función para verificar si el usuario está autenticado
export function isUserAuthenticated() {
    return isAuthenticated;
}

// Función para cargar datos de Google Sheets
export async function loadSheetData(range) {
    if (!isAuthenticated) {
        console.log("Usuario no autenticado.");
        tokenClient.requestAccessToken({ prompt: '' });
        return [];
    }

    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
        });
        return response.result.values || [];
    } catch (error) {
        console.error('Error al cargar datos desde Google Sheets:', error);
        return [];
    }
}

// Función para actualizar datos en Google Sheets
export async function updateSheetData(range, values) {
    if (!isAuthenticated) {
        console.log("Usuario no autenticado.");
        tokenClient.requestAccessToken({ prompt: '' });
        return;
    }

    try {
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: values },
        });
        console.log('Datos actualizados en Google Sheets');
    } catch (error) {
        console.error('Error al actualizar datos en Google Sheets:', error);
    }
}

// Función para agregar datos en Google Sheets
export async function appendData(range, values) {
    if (!isAuthenticated) {
        console.log("Usuario no autenticado.");
        tokenClient.requestAccessToken({ prompt: '' });
        return;
    }

    try {
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: values },
        });
        console.log('Datos agregados a Google Sheets');
    } catch (error) {
        console.error('Error al agregar datos a Google Sheets:', error);
    }
}

// Función para redirigir según el rol (Supervisor, Planillero, Cleaner, Movilizador)
export function redirectToRolePage(role) {
    const baseUrl = '/roles/';
    switch (role) {
        case 'Supervisor':
            window.location.href = `${baseUrl}supervisor.html`;
            break;
        case 'Planillero':
            window.location.href = `${baseUrl}planillero.html`;
            break;
        case 'Cleaner':
            window.location.href = `${baseUrl}cleaner.html`;
            break;
        case 'Movilizador':
            window.location.href = `${baseUrl}movilizador.html`;
            break;
        default:
            alert('Rol no reconocido');
            break;
    }
}

// Cierra sesión y actualiza el estado en Google Sheets
export async function handleLogout() {
    const credentials = await loadSheetData('credenciales!A2:D');
    const username = localStorage.getItem('username');
    const userIndex = credentials.findIndex(row => row[0] === username);

    if (userIndex !== -1) {
        const rowToUpdate = `credenciales!D${userIndex + 2}`;
        await updateSheetData(rowToUpdate, [['DESCONECTADO']]);
        alert('Sesión cerrada');
    }

    // Limpiar el nombre de usuario en localStorage
    localStorage.removeItem('username');
    localStorage.removeItem('google_access_token'); // Elimina el token de acceso
    window.location.href = "/login.html"; // Redirigir al usuario a la página de inicio de sesión
}
