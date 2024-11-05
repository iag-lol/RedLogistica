// Configuración de Google API
const CLIENT_ID = '739966027132-j4ngpj7la2hpmkhil8l3d74dpbec1eq1.apps.googleusercontent.com';
const API_KEY = 'AIzaSyAqybdPUUYkIbeGBMxc39hMdaRrOhikD8s';
const SPREADSHEET_ID = '1jzTdEoshxRpuf9kHXI5vQLRtoCsSA-Uw-48JX8LxXaU';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

let tokenClient;
let isAuthenticated = false;

// Inicializar el cliente de Google API y autenticación
async function initializeGapiClient() {
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

// Inicializar OAuth para la autenticación
function initializeOAuth() {
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
            console.log('Autenticación exitosa');
        },
    });

    const storedToken = localStorage.getItem('google_access_token');
    if (storedToken) {
        gapi.client.setToken({ access_token: storedToken });
        isAuthenticated = true;
        console.log('Autenticado con token almacenado');
    } else {
        requestAccessToken();
    }
}

// Solicitar un nuevo token de acceso
function requestAccessToken() {
    tokenClient.requestAccessToken({ prompt: 'consent' });
}

// Verificar si el usuario está autenticado
function isUserAuthenticated() {
    return isAuthenticated;
}

// Función para cargar datos de Google Sheets
async function loadSheetData(range) {
    if (!isAuthenticated) {
        console.log("Usuario no autenticado. Solicitando nuevo token...");
        await requestAccessToken();
        return [];
    }

    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
        });
        return response.result.values || [];
    } catch (error) {
        if (error.status === 401) {
            console.warn('Token expirado o no autorizado. Solicitando nuevo token...');
            await requestAccessToken();
            return [];
        } else {
            console.error('Error al cargar datos desde Google Sheets:', error);
            return [];
        }
    }
}

// Función para agregar datos en Google Sheets
async function appendData(range, values) {
    if (!isAuthenticated) {
        console.log("Usuario no autenticado. Solicitando nuevo token...");
        await requestAccessToken();
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
        if (error.status === 401) {
            console.warn('Token expirado o no autorizado. Solicitando nuevo token...');
            await requestAccessToken();
        } else {
            console.error('Error al agregar datos a Google Sheets:', error);
        }
    }
}

// Configuración del DOM al cargar
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initializeGapiClient();
        document.getElementById('reviewStockBtn').addEventListener('click', openStockModal);
        document.getElementById('downloadSummaryBtn').addEventListener('click', downloadPDF);
        document.getElementById('closeStockModalBtn').addEventListener('click', closeStockModal);

        await loadInventory();
        await loadDeliveries();
    } catch (error) {
        console.error('Error durante la inicialización:', error);
    }
});

// Función para abrir el modal de stock
function openStockModal() {
    document.getElementById('stockModal').style.display = 'flex';
    loadStockData();
}

// Función para cerrar el modal de stock
function closeStockModal() {
    document.getElementById('stockModal').style.display = 'none';
}

// Función para cargar datos de stock
async function loadStockData() {
    const stockTableBody = document.getElementById('stock-table-body');
    stockTableBody.innerHTML = '';
    const stockData = await loadSheetData('bodega!A2:E');

    stockData.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item[0]}</td>
            <td>${item[1]}</td>
            <td>${item[2]}</td>
            <td>${item[3]}</td>
        `;
        stockTableBody.appendChild(row);
    });
}

// Función para descargar el resumen en PDF
function downloadPDF() {
    const doc = new jsPDF();
    doc.text("Resumen de Stock", 14, 20);

    const stockTable = document.getElementById('stock-table');
    const rows = [];

    for (let i = 1; i < stockTable.rows.length; i++) {
        const cells = stockTable.rows[i].cells;
        const rowData = [];
        for (let j = 0; j < cells.length; j++) {
            rowData.push(cells[j].textContent);
        }
        rows.push(rowData);
    }

    doc.autoTable({
        head: [['Artículo', 'Cantidad Ingreso', 'Cantidad Egreso', 'Stock Actual']],
        body: rows,
        startY: 30,
    });

    doc.save("Resumen_Stock.pdf");
}

// Función para registrar ingreso de insumos
document.getElementById('add-supply-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemName = document.getElementById('ingreso-item-name').value;
    const itemQuantity = document.getElementById('ingreso-item-quantity').value;
    const itemCategory = document.getElementById('ingreso-item-category').value;
    const date = new Date().toLocaleString();

    if (itemName && itemQuantity && itemCategory) {
        const values = [[itemName, itemQuantity, itemCategory, date]];
        await appendData('bodega!A2:D', values);
        await loadInventory();
        alert('Ingreso registrado exitosamente');
        e.target.reset();
    }
});

// Función para registrar egreso de insumos
document.getElementById('remove-supply-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemName = document.getElementById('egreso-item-name').value;
    const itemQuantity = document.getElementById('egreso-item-quantity').value;
    const personReceiving = document.getElementById('person-receiving').value;
    const date = new Date().toLocaleString();

    if (itemName && itemQuantity && personReceiving) {
        const values = [[itemName, itemQuantity, personReceiving, date]];
        await appendData('bodega!E2:H', values);
        await loadDeliveries();
        alert('Egreso registrado exitosamente');
        e.target.reset();
    }
});

// Función para cargar el inventario
async function loadInventory() {
    const inventoryData = await loadSheetData('bodega!A2:D');
    const tableBody = document.getElementById('ingreso-table-body');
    tableBody.innerHTML = '';

    inventoryData.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item[0]}</td>
            <td>${item[1]}</td>
            <td>${item[2]}</td>
            <td>${item[3]}</td>
        `;
        tableBody.appendChild(row);
    });
}

// Función para cargar los registros de egreso
async function loadDeliveries() {
    const deliveryData = await loadSheetData('bodega!E2:H');
    const tableBody = document.getElementById('egreso-table-body');
    tableBody.innerHTML = '';

    deliveryData.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item[0]}</td>
            <td>${item[1]}</td>
            <td>${item[2]}</td>
            <td>${item[3]}</td>
        `;
        tableBody.appendChild(row);
    });
}
