import { initializeGapiClient, loadSheetData, appendData, isUserAuthenticated } from '/RedLogistica/api/googleSheets.js';

document.addEventListener("DOMContentLoaded", async function () {
    // Inicializar Google API y autenticación
    await initializeGapiClient();

    // Mostrar el estado de conexión y el usuario
    checkConnectionStatus();

    // Configuración de eventos para botones
    document.getElementById("reviewStockBtn").addEventListener("click", openStockModal);
    document.getElementById("downloadSummaryBtn").addEventListener("click", downloadPDF);
    document.getElementById("closeStockModalBtn").addEventListener("click", closeStockModal);

    // Cargar datos iniciales
    await loadInventory();
    await loadDeliveries();

    // Configurar eventos para formularios
    document.getElementById("add-supply-form").addEventListener("submit", registerSupplyEntry);
    document.getElementById("remove-supply-form").addEventListener("submit", registerSupplyExit);
});

// Verificar y actualizar el estado de conexión
function checkConnectionStatus() {
    const connectionStatus = document.getElementById("connection-status");
    connectionStatus.textContent = isUserAuthenticated() ? "Conectado" : "Desconectado";
    connectionStatus.classList.toggle("connected", isUserAuthenticated());
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

// Función para cargar datos de stock desde Google Sheets
async function loadStockData() {
    const stockTableBody = document.getElementById("stock-table-body");
    stockTableBody.innerHTML = '';
    const stockData = await loadSheetData("bodega!A2:E");

    stockData.forEach(item => {
        const row = document.createElement("tr");
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
    }
}

// Función para cargar el inventario desde Google Sheets
async function loadInventory() {
    const inventoryData = await loadSheetData("bodega!A2:D");
    const tableBody = document.getElementById("ingreso-table-body");
    tableBody.innerHTML = '';

    inventoryData.forEach(item => {
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

    deliveryData.forEach(item => {
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
