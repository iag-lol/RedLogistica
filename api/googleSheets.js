const CLIENT_ID = '749139679919-3bc57iab4hj1qv7uh6r7s9tn6lp8r389.apps.googleusercontent.com';
const API_KEY = 'AIzaSyDwUO5PpwoNbVbWfKViTEQO8Lnpkl12D5c';
const SPREADSHEET_ID = '1jzTdEoshxRpuf9kHXI5vQLRtoCsSA-Uw-48JX8LxXaU';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/spreadsheets.readonly';

let tokenClient;
let isAuthenticated = false;


export function initializeGapiClient() {
    return new Promise((resolve, reject) => {
        gapi.load('client', async () => {
            try {
                await gapi.client.init({
                    apiKey: API_KEY,
                    discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"]
                });
                await initializeOAuth();
                resolve();
            } catch (error) {
                console.error("Error inicializando el cliente de Google API:", error);
                reject("Las bibliotecas de Google no están cargadas completamente.");
            }
        });
    });
}

/**
 * Inicializa OAuth con Google.
 * @returns {Promise<void>}
 */
async function initializeOAuth() {
    return new Promise((resolve, reject) => {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: async (response) => {
                if (response.error) {
                    console.error('Error en autenticación:', response);
                    reject(response.error);
                    return;
                }
                // Almacena el token de acceso y su tiempo de expiración en localStorage
                const expiresAt = Date.now() + (response.expires_in * 1000);
                localStorage.setItem('google_access_token', response.access_token);
                localStorage.setItem('expires_at', expiresAt.toString());
                gapi.client.setToken({ access_token: response.access_token });
                isAuthenticated = true;
                console.log('Autenticación exitosa');
                resolve();
            },
        });

        const storedToken = localStorage.getItem('google_access_token');
        const storedExpiresAt = localStorage.getItem('expires_at');

        if (storedToken && storedExpiresAt) {
            const now = Date.now();
            if (now < parseInt(storedExpiresAt, 10)) {
                gapi.client.setToken({ access_token: storedToken });
                isAuthenticated = true;
                console.log('Autenticado con token almacenado válido');
                resolve();
            } else {
                console.log('Token almacenado expirado, intentando refrescar...');
                requestAccessToken(false)
                    .then(resolve)
                    .catch(() => {
                        // Si el refresco falla, solicita un nuevo token con consentimiento
                        requestAccessToken(true).then(resolve).catch(reject);
                    });
            }
        } else {
            requestAccessToken(true).then(resolve).catch(reject);
        }
    });
}

/**
 * Solicita un token de acceso.
 * @param {boolean} forcePrompt - Si se debe forzar el consentimiento del usuario.
 * @returns {Promise<void>}
 */
function requestAccessToken(forcePrompt = false) {
    return new Promise((resolve, reject) => {
        tokenClient.callback = (response) => {
            if (response.error) {
                console.error('Error al solicitar token:', response);
                reject(response.error);
                return;
            }
            const expiresAt = Date.now() + (response.expires_in * 1000);
            localStorage.setItem('google_access_token', response.access_token);
            localStorage.setItem('expires_at', expiresAt.toString());
            gapi.client.setToken({ access_token: response.access_token });
            isAuthenticated = true;
            console.log('Token actualizado exitosamente');
            resolve();
        };

        tokenClient.requestAccessToken({ prompt: forcePrompt ? 'consent' : 'none' });
    });
}

/**
 * Verifica si el usuario está autenticado.
 * @returns {boolean}
 */
export function isUserAuthenticated() {
    return isAuthenticated;
}

/**
 * Asegura que el usuario esté autenticado antes de realizar cualquier solicitud.
 * Refresca el token si está a punto de expirar.
 * @returns {Promise<void>}
 */
async function ensureAuthenticated() {
    if (!isAuthenticated) {
        await requestAccessToken(true);
        return;
    }

    const storedExpiresAt = localStorage.getItem('expires_at');
    const now = Date.now();

    // Refrescar el token si faltan menos de 5 minutos para que expire
    if (storedExpiresAt && (now + 5 * 60 * 1000) > parseInt(storedExpiresAt, 10)) {
        console.log('Refrescando token...');
        try {
            await requestAccessToken(false);
        } catch (error) {
            console.warn('No se pudo refrescar el token automáticamente:', error);
            await requestAccessToken(true);
        }
    }
}

/**
 * Carga datos desde una hoja específica de Google Sheets.
 * @param {string} range - Rango de celdas a cargar.
 * @returns {Promise<Array>}
 */
export async function loadSheetData(range) {
    try {
        await ensureAuthenticated();

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

/**
 * Actualiza datos en una hoja específica de Google Sheets.
 * @param {string} range - Rango de celdas a actualizar.
 * @param {Array} values - Nuevos valores.
 * @returns {Promise<void>}
 */
export async function updateSheetData(range, values) {
    try {
        await ensureAuthenticated();

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

/**
 * Agrega datos a una hoja específica de Google Sheets.
 * @param {string} range - Rango de celdas para agregar datos.
 * @param {Array} values - Valores a agregar.
 * @returns {Promise<void>}
 */
export async function appendData(range, values) {
    try {
        await ensureAuthenticated();

        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: { values: values },
        });
        console.log('Datos agregados a Google Sheets');
    } catch (error) {
        console.error('Error al agregar datos a Google Sheets:', error);
    }
}

/**
 * Redirecciona a la página según el rol del usuario.
 * @param {string} role - Rol del usuario.
 */
export function redirectToRolePage(role) {
    const baseUrl = '/RedLogistica/roles/';
    const rolePages = {
        'Supervisor': 'supervisor.html',
        'Planillero': 'planillero.html',
        'Cleaner': 'cleaner.html',
        'Aseo': 'aseo.html',
        'Bodeguero': 'bodega.html', // Añadido para redirigir a bodega.html
    };

    const page = rolePages[role];
    if (page) {
        window.location.href = `${baseUrl}${page}`;
    } else {
        alert('Rol no reconocido');
    }
}

/**
 * Maneja el cierre de sesión del usuario.
 * Actualiza el estado en Google Sheets y limpia datos locales.
 * @returns {Promise<void>}
 */
export async function handleLogout() {
    try {
        const credentials = await loadSheetData('credenciales!A2:D');
        const username = localStorage.getItem('username');
        const userIndex = credentials.findIndex(row => row[0] === username);

        if (userIndex !== -1) {
            const rowToUpdate = `credenciales!D${userIndex + 2}`;
            await updateSheetData(rowToUpdate, [['DESCONECTADO']]);
            alert('Sesión cerrada');
        }
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
    }

    // Limpiar tokens y datos del usuario
    localStorage.removeItem('username');
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('expires_at');
    isAuthenticated = false;
    window.location.href = "/login.html";
}
