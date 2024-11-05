// Configuración de Google API
const CLIENT_ID = '739966027132-j4ngpj7la2hpmkhil8l3d74dpbec1eq1.apps.googleusercontent.com';
const API_KEY = 'AIzaSyAqybdPUUYkIbeGBMxc39hMdaRrOhikD8s';
const SPREADSHEET_ID = '1jzTdEoshxRpuf9kHXI5vQLRtoCsSA-Uw-48JX8LxXaU';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

import { initializeGapiClient, loadSheetData, appendData, isUserAuthenticated } from '/RedLogistica/api/googleSheets.js';

document.addEventListener("DOMContentLoaded", async function () {
    try {
        // Inicializar Google API y autenticación
        await initializeGapiClient();

        // Verificar y actualizar el estado de conexión
        checkConnectionStatus();

        // Configurar eventos para botones
        document.getElementById("reviewStockBtn").addEventListener("click", openStockModal);
        document.getElementById("downloadSummaryBtn").addEventListener("click", downloadPDF);
        document.getElementById("closeStockModalBtn").addEventListener("click", closeStockModal);

        // Cargar datos iniciales de las tablas y actualizar contadores
        await loadInventory();
        await loadDeliveries();
        await updateSummaryCounters();

        // Configurar eventos para formularios
        document.getElementById("add-supply-form").addEventListener("submit", registerSupplyEntry);
        document.getElementById("remove-supply-form").addEventListener("submit", registerSupplyExit);
    } catch (error) {
        console.error('Error durante la inicialización:', error);
        alert("Error en la autenticación. Verifique su conexión y reinicie la aplicación.");
    }
});

// Verificar y actualizar el estado de conexión
function checkConnectionStatus() {
    const connectionStatus = document.getElementById("connection-status");
    const isConnected = isUserAuthenticated();
    connectionStatus.textContent = isConnected ? "Conectado" : "Desconectado";
    connectionStatus.classList.toggle("connected", isConnected);
}

// Función para abrir la ventana modal de stock
function openStockModal() {
    document.getElementById("stockModal").style.display = "flex";
    loadStockData();
}

// Función para cerrar la ventana modal de stock
function closeStockModal() {
    document.getElementById("stockModal").style.display = "none";
}

// Función para cargar datos de stock desde Google Sheets y combinar duplicados
async function loadStockData() {
    const stockTableBody = document.getElementById("stock-table-body");
    stockTableBody.innerHTML = '';
    const stockData = await loadSheetData("bodega!A2:E");

    const combinedStock = {};

    stockData.forEach(item => {
        const name = item[0];
        const quantityIn = parseInt(item[1], 10);
        const quantityOut = parseInt(item[2], 10);

        if (combinedStock[name]) {
            combinedStock[name].quantityIn += quantityIn;
            combinedStock[name].quantityOut += quantityOut;
        } else {
            combinedStock[name] = { quantityIn, quantityOut };
        }
    });

    Object.keys(combinedStock).forEach(name => {
        const { quantityIn, quantityOut } = combinedStock[name];
        const currentStock = quantityIn - quantityOut;
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${name}</td>
            <td>${quantityIn}</td>
            <td>${quantityOut}</td>
            <td>${currentStock}</td>
        `;
        stockTableBody.appendChild(row);
    });
}

// Función para descargar el resumen en PDF
function downloadPDF() {
    const doc = new jsPDF();
    doc.text("Resumen de Stock", 14, 20);

    const stockTable = document.getElementById("stock-table");
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

// Función para registrar ingreso de insumos en Google Sheets
async function registerSupplyEntry(e) {
    e.preventDefault();
    const itemName = document.getElementById("ingreso-item-name").value;
    const itemQuantity = document.getElementById("ingreso-item-quantity").value;
    const itemCategory = document.getElementById("ingreso-item-category").value;
    const date = new Date().toLocaleString();

    if (itemName && itemQuantity && itemCategory) {
        const values = [[itemName, itemQuantity, itemCategory, date]];
        await appendData("bodega!A2:D", values);
        await loadInventory();
        alert("Ingreso registrado exitosamente");
        e.target.reset();
        await updateSummaryCounters();
    }
}

// Función para registrar egreso de insumos en Google Sheets
async function registerSupplyExit(e) {
    e.preventDefault();
    const itemName = document.getElementById("egreso-item-name").value;
    const itemQuantity = document.getElementById("egreso-item-quantity").value;
    const personReceiving = document.getElementById("person-receiving").value;
    const date = new Date().toLocaleString();

    if (itemName && itemQuantity && personReceiving) {
        const values = [[itemName, itemQuantity, personReceiving, date]];
        await appendData("bodega!E2:H", values);
        await loadDeliveries();
        alert("Egreso registrado exitosamente");
        e.target.reset();
        await updateSummaryCounters();
    }
}

// Función para cargar el inventario desde Google Sheets
async function loadInventory() {
    const inventoryData = await loadSheetData("bodega!A2:D");
    const tableBody = document.getElementById("ingreso-table-body");
    tableBody.innerHTML = '';

    inventoryData.slice(-10).forEach(item => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${item[0]}</td>
            <td>${item[1]}</td>
            <td>${item[2]}</td>
            <td>${item[3]}</td>
        `;
        tableBody.appendChild(row);
    });
}

// Función para cargar los registros de egreso desde Google Sheets
async function loadDeliveries() {
    const deliveryData = await loadSheetData("bodega!E2:H");
    const tableBody = document.getElementById("egreso-table-body");
    tableBody.innerHTML = '';

    deliveryData.slice(-10).forEach(item => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${item[0]}</td>
            <td>${item[1]}</td>
            <td>${item[2]}</td>
            <td>${item[3]}</td>
        `;
        tableBody.appendChild(row);
    });
}

// Actualizar contadores de resumen
async function updateSummaryCounters() {
    const inventoryData = await loadSheetData("bodega!A2:D");
    const deliveryData = await loadSheetData("bodega!E2:H");
    const lowStockCount = inventoryData.filter(item => parseInt(item[1], 10) < 5).length;

    document.getElementById("total-inventory").textContent = `${inventoryData.length} artículos`;
    document.getElementById("truck-deliveries").textContent = `${deliveryData.length} entregas`;
    document.getElementById("low-stock-alerts").textContent = `${lowStockCount} alertas`;
}
