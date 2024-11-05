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
    await updateCounters();

    // Configurar eventos para formularios
    document.getElementById("add-supply-form").addEventListener("submit", registerSupplyEntry);
    document.getElementById("remove-supply-form").addEventListener("submit", registerSupplyExit);
    document.getElementById("monthFilter").addEventListener("change", filterStockByMonth);

    // Configurar evento para registrar una descarga de camión
    document.getElementById("registerTruckDeliveryBtn").addEventListener("click", openTruckDeliveryModal);
    document.getElementById("submitTruckDeliveryBtn").addEventListener("click", registerTruckDelivery);
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

// Función para cargar datos de stock desde Google Sheets y consolidar duplicados
async function loadStockData() {
    const stockTableBody = document.getElementById("stock-table-body");
    stockTableBody.innerHTML = '';
    const stockData = await loadSheetData("bodega!A2:E");

    const consolidatedData = {};

    stockData.forEach(item => {
        const name = item[0];
        const quantityIn = parseInt(item[1], 10);
        const quantityOut = parseInt(item[2], 10);

        if (consolidatedData[name]) {
            consolidatedData[name].quantityIn += quantityIn;
            consolidatedData[name].quantityOut += quantityOut;
        } else {
            consolidatedData[name] = { quantityIn, quantityOut };
        }
    });

    Object.keys(consolidatedData).forEach(name => {
        const { quantityIn, quantityOut } = consolidatedData[name];
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
        await updateCounters();
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
        await updateCounters();
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

// Actualizar contadores de resumen
async function updateCounters() {
    const inventoryData = await loadSheetData("bodega!A2:D");
    const deliveryData = await loadSheetData("bodega!E2:H");
    const lowStockCount = inventoryData.filter(item => parseInt(item[1], 10) < 5).length;

    document.getElementById("total-inventory").textContent = `${inventoryData.length} artículos`;
    document.getElementById("truck-deliveries").textContent = `${deliveryData.length} entregas`;
    document.getElementById("low-stock-alerts").textContent = `${lowStockCount} alertas`;
}

// Filtrar datos de stock por mes
function filterStockByMonth() {
    const selectedMonth = document.getElementById("monthFilter").value;
    // Implementar lógica de filtro para cargar solo datos del mes seleccionado
}

// Función para abrir el modal de descarga de camión
function openTruckDeliveryModal() {
    // Lógica para mostrar modal y agregar formulario de descarga de camión
}

// Función para registrar descarga de camión en Google Sheets
async function registerTruckDelivery() {
    // Lógica para registrar descarga de camión en Google Sheets
}
