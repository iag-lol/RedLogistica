import { loadSheetData, appendData, initializeGapiClient, isUserAuthenticated } from '/RedLogistica/api/googleSheets.js';
import { getUserInfo } from '/RedLogistica/js/login.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Inicializar cliente de Google API y autenticación
        await initializeGapiClient();

        const userInfo = getUserInfo();
        document.getElementById('username').textContent = userInfo ? userInfo.name : 'Usuario';
        document.getElementById('connection-status').textContent = isUserAuthenticated() ? 'Conectado' : 'Desconectado';

        // Configurar eventos de botones
        document.getElementById('reviewStockBtn').addEventListener('click', openStockModal);
        document.getElementById('downloadSummaryBtn').addEventListener('click', downloadPDF);
        document.getElementById('closeStockModalBtn').addEventListener('click', closeStockModal);

        // Cargar datos iniciales
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

// Función para cargar datos de stock desde Google Sheets y combinar duplicados
async function loadStockData() {
    try {
        const stockTableBody = document.getElementById('stock-table-body');
        stockTableBody.innerHTML = '';
        const stockData = await loadSheetData('bodega!A2:E'); // Asegúrate de que este rango corresponda con tu hoja de cálculo

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
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${name}</td>
                <td>${quantityIn}</td>
                <td>${quantityOut}</td>
                <td>${currentStock}</td>
            `;
            stockTableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error al cargar datos de stock:', error);
    }
}

// Función para filtrar el stock por mes
function filterStockByMonth() {
    const month = document.getElementById('monthFilter').value;
    if (month) {
        displayFilteredStock(month);
    }
}

async function displayFilteredStock(month) {
    try {
        const stockTableBody = document.getElementById('stock-table-body');
        stockTableBody.innerHTML = '';
        const stockData = await loadSheetData('bodega!A2:E');

        const filteredData = stockData.filter(item => {
            const itemDate = new Date(item[3]);
            return itemDate.toISOString().slice(0, 7) === month;
        });

        filteredData.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item[0]}</td>
                <td>${item[1]}</td>
                <td>${item[2]}</td>
                <td>${item[3]}</td>
            `;
            stockTableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error al filtrar datos de stock:', error);
    }
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

// Función para registrar ingreso de insumos en Google Sheets con fecha y hora automáticas
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

// Función para registrar egreso de insumos en Google Sheets con fecha y hora automáticas
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

// Función para cargar el inventario desde Google Sheets
async function loadInventory() {
    try {
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
    } catch (error) {
        console.error('Error al cargar el inventario:', error);
    }
}

// Función para cargar los registros de egreso desde Google Sheets
async function loadDeliveries() {
    try {
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
    } catch (error) {
        console.error('Error al cargar los registros de egreso:', error);
    }
}
}
