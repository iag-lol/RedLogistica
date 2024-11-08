// Configuración de Google API
const CLIENT_ID = '739966027132-j4ngpj7la2hpmkhil8l3d74dpbec1eq1.apps.googleusercontent.com';
const API_KEY = 'AIzaSyAqybdPUUYkIbeGBMxc39hMdaRrOhikD8s';
const SPREADSHEET_ID = '1jzTdEoshxRpuf9kHXI5vQLRtoCsSA-Uw-48JX8LxXaU';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

let tokenClient;
let isAuthenticated = false;

// -------------------------------
// Cargar y verificar Google API
// -------------------------------
async function loadGapiScript() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/api.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Error al cargar la API de Google'));
        document.body.appendChild(script);
    });
}

// -------------------------------
// Inicializar el cliente de Google API y OAuth
// -------------------------------
async function initializeGapiClient() {
    try {
        await loadGapiScript();
        gapi.load('client', async () => {
            await gapi.client.init({
                apiKey: API_KEY,
                discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"]
            });
            console.log("Cliente GAPI inicializado.");
            loadGoogleAccountsScript();
        });
    } catch (error) {
        console.error("Error al inicializar GAPI:", error);
    }
}

// -------------------------------
// Cargar el script de google.accounts
// -------------------------------
function loadGoogleAccountsScript() {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = initializeOAuth;
    script.onerror = () => console.error("Error al cargar el cliente de Google OAuth");
    document.body.appendChild(script);
}

// -------------------------------
// Configuración de OAuth y manejo de autenticación
// -------------------------------
function initializeOAuth() {
    if (!window.google || !google.accounts) {
        console.error("La API de Google no está completamente cargada.");
        return;
    }

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse) => {
            if (tokenResponse.error) {
                console.error("Error en autenticación:", tokenResponse);
                return;
            }
            gapi.client.setToken({ access_token: tokenResponse.access_token });
            isAuthenticated = true;
            loadTablesData();
        },
    });

    const storedToken = localStorage.getItem('google_access_token');
    if (storedToken) {
        gapi.client.setToken({ access_token: storedToken });
        isAuthenticated = true;
        loadTablesData();
    } else {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    }
}



















// -------------------------------
// Función para cargar los datos de las tablas desde Google Sheets
// -------------------------------
async function loadTablesData() {
    if (!isAuthenticated) {
        console.log("Autenticación no completada. Esperando autenticación...");
        return;
    }

    try {
        await loadAssignmentData();
        await loadDailyAseoData();
        console.log("Datos cargados en las tablas.");
    } catch (error) {
        console.error("Error al cargar los datos de las tablas:", error);
    }
}

// -------------------------------
// Cargar datos de la tabla de asignación de tareas a aseadores
// -------------------------------
async function loadAssignmentData() {
    const assignmentTable = document.getElementById('assignment-table').querySelector('tbody');
    assignmentTable.innerHTML = '';

    try {
        const assignmentData = await loadSheetData('aseo!A2:F');  // Modificado para incluir el campo PPU
        assignmentData.forEach(row => {
            const tr = document.createElement('tr');
            row.forEach(cellData => {
                const td = document.createElement('td');
                td.textContent = cellData;
                tr.appendChild(td);
            });
            assignmentTable.appendChild(tr);
        });
    } catch (error) {
        console.error("Error al cargar datos de asignación de tareas:", error);
    }
}

// -------------------------------
// Cargar datos de la tabla de ingresos de aseo diarios
// -------------------------------
async function loadDailyAseoData() {
    const dailyAseoTable = document.getElementById('daily-aseo-table').querySelector('tbody');
    dailyAseoTable.innerHTML = '';

    try {
        const dailyAseoData = await loadSheetData('aseo!I2:L');
        dailyAseoData.forEach(row => {
            const tr = document.createElement('tr');
            row.forEach(cellData => {
                const td = document.createElement('td');
                td.textContent = cellData;
                tr.appendChild(td);
            });
            dailyAseoTable.appendChild(tr);
        });
    } catch (error) {
        console.error("Error al cargar datos de ingresos de aseo:", error);
    }
}

// -------------------------------
// Función para cargar datos de Google Sheets
// -------------------------------
async function loadSheetData(range) {
    if (!isAuthenticated) {
        console.log("Usuario no autenticado.");
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

// -------------------------------
// Función para agregar una nueva tarea de aseo
// -------------------------------
async function addAseoTask(busId, aseadorName, estado, fecha) {
    const values = [[busId, aseadorName, estado, fecha]];
    await appendData('aseo!I2:L', values);
    addRowToDailyAseoTable([busId, aseadorName, estado, fecha]);
}

// -------------------------------
// Función para agregar una nueva asignación de tarea con PPU
// -------------------------------
async function addAssignmentTask(cleanerName, busIdTarea, taskType, deadline) {
    const values = [[cleanerName, busIdTarea, taskType, "Pendiente", deadline]];
    await appendData('aseo!A2:F', values);  // Modificado para incluir el tipo de tarea en la asignación de tareas
    addRowToAssignmentTable([cleanerName, busIdTarea, taskType, "Pendiente", deadline]);
}

// -------------------------------
// Evento de formulario para registrar una nueva tarea de aseo
// -------------------------------
document.getElementById('aseo-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const busId = document.getElementById('bus-id').value;
    const aseadorName = document.querySelector('[name="aseadores"]').value;
    const estado = document.getElementById('aseo-status').value;
    const fecha = document.getElementById('task-deadline').value;
    await addAseoTask(busId, aseadorName, estado, fecha);
    e.target.reset();
});

// -------------------------------
// Evento de formulario para registrar una nueva asignación de tarea
// -------------------------------
document.getElementById('task-assignment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cleanerName = document.querySelector('[name="aseadorestareas"]').value;
    const busIdTarea = document.getElementById('bus-idtarea').value;  // Captura el PPU del bus
    const taskDesc = document.getElementById('task-desc').value;
    const deadline = document.getElementById('assignment-deadline').value;
    await addAssignmentTask(cleanerName, busIdTarea, taskDesc, deadline);
    e.target.reset();
});

// -------------------------------
// Añadir fila a la tabla de asignación de tareas en la interfaz
// -------------------------------
function addRowToAssignmentTable(rowData) {
    const assignmentTable = document.getElementById('assignment-table').querySelector('tbody');
    const tr = document.createElement('tr');
    rowData.forEach(cellData => {
        const td = document.createElement('td');
        td.textContent = cellData;
        tr.appendChild(td);
    });
    assignmentTable.appendChild(tr);
}

// -------------------------------
// Añadir fila a la tabla de ingresos de aseo en la interfaz
// -------------------------------
function addRowToDailyAseoTable(rowData) {
    const dailyAseoTable = document.getElementById('daily-aseo-table').querySelector('tbody');
    const tr = document.createElement('tr');
    rowData.forEach(cellData => {
        const td = document.createElement('td');
        td.textContent = cellData;
        tr.appendChild(td);
    });
    dailyAseoTable.appendChild(tr);
}

// -------------------------------
// Función para agregar una fila a Google Sheets
// -------------------------------
async function appendData(range, values) {
    if (!isAuthenticated) {
        console.log("Usuario no autenticado.");
        tokenClient.requestAccessToken({ prompt: '' });
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

// Inicializar al cargar el DOM
document.addEventListener("DOMContentLoaded", initializeGapiClient);










document.addEventListener("DOMContentLoaded", function () {
    const ROWS_PER_PAGE = 10;

    // Referencias a las tablas y sus cuerpos
    const assignmentTableBody = document.getElementById("assignment-table").querySelector("tbody");
    const dailyAseoTableBody = document.getElementById("daily-aseo-table").querySelector("tbody");

    // Inicializa la paginación
    paginateTable(assignmentTableBody, "assignment-pagination");
    paginateTable(dailyAseoTableBody, "daily-aseo-pagination");

    // Función para paginar una tabla
    function paginateTable(tableBody, paginationContainerId) {
        const paginationContainer = document.getElementById(paginationContainerId);
        let currentPage = 1;

        function renderTable() {
            // Oculta todas las filas
            Array.from(tableBody.rows).forEach((row, index) => {
                row.style.display = (index >= (currentPage - 1) * ROWS_PER_PAGE && index < currentPage * ROWS_PER_PAGE) ? "" : "none";
            });

            updatePaginationControls();
        }

        function updatePaginationControls() {
            const totalPages = Math.ceil(tableBody.rows.length / ROWS_PER_PAGE);
            paginationContainer.innerHTML = "";

            for (let i = 1; i <= totalPages; i++) {
                const pageButton = document.createElement("button");
                pageButton.textContent = i;
                pageButton.classList.add("pagination-button");
                if (i === currentPage) pageButton.classList.add("active");

                pageButton.addEventListener("click", () => {
                    currentPage = i;
                    renderTable();
                });

                paginationContainer.appendChild(pageButton);
            }
        }

        renderTable();
    }

    // Observador para actualizar la paginación cuando se cambien las filas de la tabla
    const observer = new MutationObserver(() => {
        paginateTable(assignmentTableBody, "assignment-pagination");
        paginateTable(dailyAseoTableBody, "daily-aseo-pagination");
    });

    // Configura el observador en ambas tablas
    observer.observe(assignmentTableBody, { childList: true });
    observer.observe(dailyAseoTableBody, { childList: true });
});





























document.addEventListener("DOMContentLoaded", function () {
    // Elementos del DOM para los contadores
    const totalTasksCount = document.getElementById("total-tasks-count");
    const totalAttendanceCount = document.getElementById("total-attendance-count");

    // Elementos del DOM para las tablas
    const assignmentTableBody = document.getElementById("assignment-table").querySelector("tbody");
    const dailyAseoTableBody = document.getElementById("daily-aseo-table").querySelector("tbody");

    // Función para contar registros y actualizar los contadores
    function updateCounts() {
        totalTasksCount.textContent = assignmentTableBody.rows.length;
        totalAttendanceCount.textContent = dailyAseoTableBody.rows.length;
    }

    // Configuración de gráficos con Chart.js
    const taskChartCtx = document.getElementById("taskChart").getContext("2d");
    const attendanceChartCtx = document.getElementById("attendanceChart").getContext("2d");

    let taskChart = new Chart(taskChartCtx, {
        type: 'bar',
        data: {
            labels: ["Laura Soto", "Deisy Toribio", "Virginia Mosquera", "Pierre Joseph", "Galindo Saez", "Laureano Ramirez", "Pamela Andrades", "Hugo Carrasco", "Patricia Cerda", "Gloria Angel", "Paulina Morales", "Daniela Solorza", "Silvia Gonzalez", "Silvia Villalobos", "Daniela Sanchez", "Marisol Aguirre", "Maria Lazcano", "Isaac Maguiña", "Axis Maurice", "Vitel Desrosiers", "Veronica Ortiz", "Tamara Sepulveda", "Ayleen Tabilo"],
            datasets: [{
                label: "Registros de Aseadores",
                data: new Array(21).fill(0),
                backgroundColor: "rgba(255, 99, 132, 0.5)"
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });

    let attendanceChart = new Chart(attendanceChartCtx, {
        type: 'bar',
        data: {
            labels: ["Barrido", "Trapeado", "Barrido y Trapeado", "Revisado por ICA", "Progamado por RTG", "Programado por DTPM", "Programado por APPLUS"],
            datasets: [{
                label: "Cantidad de Aseos Realizados",
                data: [0, 0, 0, 0, 0, 0, 0],
                backgroundColor: "rgba(54, 162, 235, 0.5)"
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });

    // Función para actualizar los datos del gráfico de aseadores
    function updateTaskChart() {
        const cleanerCounts = {
            "Laura Soto": 0,
            "Deisy Toribio": 0,
            "Virginia Mosquera": 0,
            "Pierre Joseph": 0,
            "Galindo Saez": 0,
            "Laureano Ramirez": 0,
            "Pamela Andrades": 0,
            "Hugo Carrasco": 0,
            "Patricia Cerda": 0,
            "Gloria Angel": 0,
            "Paulina Morales": 0,
            "Daniela Solorza": 0,
            "Silvia Gonzalez": 0,
            "Silvia Villalobos": 0,
            "Daniela Sanchez": 0,
            "Marisol Aguirre": 0,
            "Maria Lazcano": 0,
            "Isaac Maguiña": 0,
            "Axis Maurice": 0,
            "Vitel Desrosiers": 0,
            "Veronica Ortiz": 0,
            "Tamara Sepulveda": 0,
            "Ayleen Tabilo": 0
        };

        // Contar la frecuencia de cada aseador en la columna correspondiente
        Array.from(assignmentTableBody.rows).forEach(row => {
            const aseadorName = row.cells[0].textContent; // Suponiendo que la columna de aseadores es la primera
            if (cleanerCounts[aseadorName] !== undefined) {
                cleanerCounts[aseadorName]++;
            }
        });

        // Actualizar los datos del gráfico de tareas
        taskChart.data.datasets[0].data = Object.values(cleanerCounts);
        taskChart.update();
    }

    // Función para actualizar los datos del gráfico de tipos de aseo
    function updateAttendanceChart() {
        const aseoCounts = {
            "Barrido": 0,
            "Trapeado": 0,
            "Barrido y Trapeado": 0,
            "Revisado por ICA": 0,
            "Progamado por RTG": 0,
            "Programado por DTPM": 0,
            "Programado por APPLUS": 0
        };

        // Contar la frecuencia de cada tipo de aseo en la columna correspondiente
        Array.from(dailyAseoTableBody.rows).forEach(row => {
            const aseoType = row.cells[2].textContent; // Suponiendo que la columna de tipo de aseo es la tercera
            if (aseoCounts[aseoType] !== undefined) {
                aseoCounts[aseoType]++;
            }
        });

        // Actualizar los datos del gráfico de tipos de aseo
        attendanceChart.data.datasets[0].data = Object.values(aseoCounts);
        attendanceChart.update();
    }

    // Observador para detectar cambios en las tablas y actualizar contadores y gráficos
    const observer = new MutationObserver(() => {
        updateCounts();
        updateTaskChart();
        updateAttendanceChart();
    });

    // Configura el observador en ambas tablas
    observer.observe(assignmentTableBody, { childList: true });
    observer.observe(dailyAseoTableBody, { childList: true });

    // Llama a las funciones de actualización inicial para contar registros y mostrar gráficos
    updateCounts();
    updateTaskChart();
    updateAttendanceChart();
});
