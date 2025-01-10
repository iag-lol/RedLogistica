// Configuración de Google API
const CLIENT_ID = '749139679919-3bc57iab4hj1qv7uh6r7s9tn6lp8r389.apps.googleusercontent.com';
const API_KEY = 'AIzaSyDwUO5PpwoNbVbWfKViTEQO8Lnpkl12D5c';
const SPREADSHEET_ID = '1jzTdEoshxRpuf9kHXI5vQLRtoCsSA-Uw-48JX8LxXaU';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

// Variables de autenticación y seguimiento
let tokenClient;
let isAuthenticated = false;

// Sets para rastrear registros existentes y detectar nuevos
const existingAseoRecords = new Set();
const existingAssignmentRecords = new Set();

// Referencias a los elementos de la tabla
const assignmentTableBody = document.getElementById('assignment-table').querySelector('tbody');
const dailyAseoTableBody = document.getElementById('daily-aseo-table').querySelector('tbody');

// Audio para notificaciones
const notificationSound = new Audio('https://www.soundjay.com/buttons/sounds/button-3.mp3');
notificationSound.preload = 'auto';

// -------------------------------
// Función para cargar el script de la API de Google
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
// Función para inicializar el cliente de Google API
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
// Función para cargar el script de Google Accounts para OAuth
// -------------------------------
function loadGoogleAccountsScript() {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = initializeOAuth;
    script.onerror = () => console.error("Error al cargar el cliente de Google OAuth");
    document.body.appendChild(script);
}

// -------------------------------
// Función para inicializar OAuth y manejar la autenticación
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
            localStorage.setItem('google_access_token', tokenResponse.access_token);
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
// Función para cargar datos de la tabla de asignación de tareas a aseadores
// -------------------------------
async function loadAssignmentData() {
    try {
        const assignmentData = await loadSheetData('aseo!A2:F');  // Ajusta el rango según tus datos
        assignmentData.forEach(row => {
            const uniqueId = `${row[0]}|${row[1]}|${row[2]}|${row[3]}|${row[4]}`; // Crear un ID único
            if (!existingAssignmentRecords.has(uniqueId)) {
                existingAssignmentRecords.add(uniqueId);
                addRowToAssignmentTable(row);
            }
        });
    } catch (error) {
        console.error("Error al cargar datos de asignación de tareas:", error);
    }
}

// -------------------------------
// Función para cargar datos de la tabla de ingresos de aseo diarios
// -------------------------------
async function loadDailyAseoData() {
    try {
        const dailyAseoData = await loadSheetData('aseo!I2:L'); // Ajusta el rango según tus datos
        dailyAseoData.forEach(row => {
            const uniqueId = `${row[0]}|${row[1]}|${row[2]}|${row[3]}`; // Crear un ID único
            if (!existingAseoRecords.has(uniqueId)) {
                existingAseoRecords.add(uniqueId);
                addRowToDailyAseoTable(row);
                // Mostrar alerta para el nuevo registro
                showAseoToast(row[1], row[2], row[0]);
            }
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

// -------------------------------
// Función para mostrar una alerta flotante (toast)
// -------------------------------
function showAseoToast(cleanerName, aseoType, busPPU) {
    // Crear el contenedor de toasts si no existe
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.position = 'fixed';
        toastContainer.style.top = '20px';
        toastContainer.style.right = '20px';
        toastContainer.style.zIndex = '3000';
        toastContainer.style.display = 'flex';
        toastContainer.style.flexDirection = 'column';
        toastContainer.style.gap = '10px';
        document.body.appendChild(toastContainer);
    }

    // Crear el toast
    const toast = document.createElement('div');
    toast.classList.add('toast');
    toast.style.minWidth = '250px';
    toast.style.backgroundColor = '#ffffff';
    toast.style.borderLeft = '5px solid #4a90e2'; // Color primario
    toast.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
    toast.style.padding = '10px 15px';
    toast.style.borderRadius = '8px';
    toast.style.display = 'flex';
    toast.style.justifyContent = 'space-between';
    toast.style.alignItems = 'center';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'opacity 0.5s ease, transform 0.5s ease';

    // Contenido del toast
    const message = document.createElement('div');
    message.innerHTML = `<strong>${cleanerName}</strong> realizó <strong>${aseoType}</strong> en el bus <strong>${busPPU}</strong>.`;
    message.style.fontSize = '0.9rem';
    message.style.color = '#333333';

    // Botón de cierre
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.style.background = 'none';
    closeButton.style.border = 'none';
    closeButton.style.color = '#aaaaaa';
    closeButton.style.fontSize = '1.2rem';
    closeButton.style.cursor = 'pointer';
    closeButton.style.marginLeft = '10px';
    closeButton.style.transition = 'color 0.3s';
    closeButton.onclick = () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            toast.remove();
        }, 500);
    };
    closeButton.onmouseover = () => {
        closeButton.style.color = '#000000';
    };
    closeButton.onmouseout = () => {
        closeButton.style.color = '#aaaaaa';
    };

    toast.appendChild(message);
    toast.appendChild(closeButton);
    toastContainer.appendChild(toast);

    // Mostrar el toast
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    }, 100);

    // Reproducir sonido de notificación
    notificationSound.currentTime = 0; // Reiniciar el sonido
    notificationSound.play().catch(error => {
        console.warn("No se pudo reproducir el sonido automáticamente:", error);
    });

    // Remover el toast después de 10 segundos si no se cierra manualmente
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            toast.remove();
        }, 500);
    }, 10000);
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
    await appendData('aseo!A2:F', values);  // Ajusta el rango según tus datos
    addRowToAssignmentTable([cleanerName, busIdTarea, taskType, "Pendiente", deadline]);
}

// -------------------------------
// Evento de formulario para registrar una nueva tarea de aseo
// -------------------------------
document.getElementById('aseo-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const busId = document.getElementById('bus-id').value.trim();
    const aseadorName = document.querySelector('[name="aseadores"]').value;
    const estado = document.getElementById('aseo-status').value;
    const fecha = document.getElementById('task-deadline').value;

    if (busId && aseadorName && estado && fecha) {
        await addAseoTask(busId, aseadorName, estado, fecha);
        e.target.reset();
    } else {
        console.warn("Por favor, completa todos los campos del formulario de aseo.");
    }
});

// -------------------------------
// Evento de formulario para registrar una nueva asignación de tarea
// -------------------------------
document.getElementById('task-assignment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cleanerName = document.querySelector('[name="aseadorestareas"]').value;
    const busIdTarea = document.getElementById('bus-idtarea').value.trim();
    const taskDesc = document.getElementById('task-desc').value.trim();
    const deadline = document.getElementById('assignment-deadline').value;

    if (cleanerName && busIdTarea && taskDesc && deadline) {
        await addAssignmentTask(cleanerName, busIdTarea, taskDesc, deadline);
        e.target.reset();
    } else {
        console.warn("Por favor, completa todos los campos del formulario de asignación de tareas.");
    }
});

// -------------------------------
// Función para añadir una fila a la tabla de asignación de tareas en la interfaz
// -------------------------------
function addRowToAssignmentTable(rowData) {
    const tr = document.createElement('tr');
    rowData.forEach(cellData => {
        const td = document.createElement('td');
        td.textContent = cellData;
        tr.appendChild(td);
    });
    assignmentTableBody.appendChild(tr);
}

// -------------------------------
// Función para añadir una fila a la tabla de ingresos de aseo en la interfaz
// -------------------------------
function addRowToDailyAseoTable(rowData) {
    const tr = document.createElement('tr');
    rowData.forEach(cellData => {
        const td = document.createElement('td');
        td.textContent = cellData;
        tr.appendChild(td);
    });
    dailyAseoTableBody.appendChild(tr);
}

// -------------------------------
// Función para inicializar y configurar los gráficos y contadores
// -------------------------------
function initializeChartsAndCounters() {
    const ROWS_PER_PAGE = 10;

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

    // Elementos del DOM para los contadores
    const totalTasksCount = document.getElementById("total-tasks-count");
    const totalAttendanceCount = document.getElementById("total-attendance-count");

    // Configuración de gráficos con Chart.js
    const taskChartCtx = document.getElementById("taskChart").getContext("2d");
    const attendanceChartCtx = document.getElementById("attendanceChart").getContext("2d");
    const aseadoresChartCtx = document.getElementById("aseadoresChart").getContext("2d"); // Nuevo gráfico

    // Gráfico de tareas
    let taskChart = new Chart(taskChartCtx, {
        type: 'bar',
        data: {
            labels: ["Laura Soto","Galindo Saez", "Laureano Ramirez", "Pamela Andrades", "Hugo Carrasco","Gloria Angel","Daniela Solorza", "Silvia Gonzalez", "Silvia Villalobos","Marisol Aguirre", "Maria Lazcano", "Isaac Maguiña", "Axis Maurice", "Vitel Desrosiers", "Veronica Ortiz", "Rosa Smart", "Patricia Quirilao"],
            datasets: [{
                label: "Registros de Aseadores",
                data: new Array(17).fill(0), // Inicialmente 0
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

    // Gráfico de asistencia
    let attendanceChart = new Chart(attendanceChartCtx, {
        type: 'bar',
        data: {
            labels: ["Barrido", "Trapeado", "Barrido y Trapeado","Revisado por Inspeccion",  "Revisado por ICA", "Programado por RTG", "Programado por DTPM", "Programado por APPLUS"],
            datasets: [{
                label: "Cantidad de Aseos Realizados",
                data: [0, 0, 0, 0, 0, 0, 0, 0], // Inicialmente 0
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

    // Nuevo Gráfico para Aseadores
    let aseadoresChart = new Chart(aseadoresChartCtx, {
        type: 'bar',
        data: {
            labels: ["Laura Soto","Galindo Saez", "Laureano Ramirez", "Pamela Andrades", "Hugo Carrasco","Gloria Angel","Daniela Solorza", "Silvia Gonzalez", "Silvia Villalobos","Marisol Aguirre", "Maria Lazcano", "Isaac Maguiña", "Axis Maurice", "Vitel Desrosiers", "Veronica Ortiz", "Rosa Smart", "Patricia Quirilao"],
            datasets: [{
                label: "Registros de Ingresos Diarios por Aseador",
                data: new Array(17).fill(0), // Inicialmente 0
                backgroundColor: "rgba(75, 192, 192, 0.5)"
            }]
        },
        options: {
            responsive: true,
            animation: {
                duration: 500, // Animación suave
                easing: 'easeOutQuad'
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });

    // Función para contar registros y actualizar los contadores
    function updateCounts() {
        totalTasksCount.textContent = assignmentTableBody.rows.length;
        totalAttendanceCount.textContent = dailyAseoTableBody.rows.length;
    }

    // Función para actualizar los datos del gráfico de tareas
    function updateTaskChart() {
        const cleanerCounts = {
            "Laura Soto": 0,
            "Galindo Saez": 0,
            "Laureano Ramirez": 0,
            "Pamela Andrades": 0,
            "Hugo Carrasco": 0,
            "Gloria Angel": 0,
            "Daniela Solorza": 0,
            "Silvia Gonzalez": 0,
            "Silvia Villalobos": 0,
            "Marisol Aguirre": 0,
            "Maria Lazcano": 0,
            "Isaac Maguiña": 0,
            "Axis Maurice": 0,
            "Vitel Desrosiers": 0,
            "Veronica Ortiz": 0,
            "Rosa Smart": 0,
            "Patricia Quirilao": 0
        };

        // Contar la frecuencia de cada aseador en la columna correspondiente
        Array.from(assignmentTableBody.rows).forEach(row => {
            const aseadorName = row.cells[0].textContent.trim(); // Suponiendo que la columna de aseadores es la primera
            if (cleanerCounts.hasOwnProperty(aseadorName)) {
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
            "Revisado por Inspeccion": 0,
            "Revisado por ICA": 0,
            "Programado por RTG": 0,
            "Programado por DTPM": 0,
            "Programado por APPLUS": 0
        };

        // Contar la frecuencia de cada tipo de aseo en la columna correspondiente
        Array.from(dailyAseoTableBody.rows).forEach(row => {
            const aseoType = row.cells[2].textContent.trim(); // Suponiendo que la columna de tipo de aseo es la tercera
            if (aseoCounts.hasOwnProperty(aseoType)) {
                aseoCounts[aseoType]++;
            }
        });

        // Actualizar los datos del gráfico de tipos de aseo
        attendanceChart.data.datasets[0].data = Object.values(aseoCounts);
        attendanceChart.update();
    }

    // Función para actualizar el gráfico de aseadores
    async function updateAseadoresChart() {
        try {
            const dailyAseoData = await loadSheetData('aseo!I2:L'); // Ajusta el rango según tus datos
            const aseadoresCount = {
                "Laura Soto": 0,
                "Galindo Saez": 0,
                "Laureano Ramirez": 0,
                "Pamela Andrades": 0,
                "Hugo Carrasco": 0,
                "Gloria Angel": 0,
                "Daniela Solorza": 0,
                "Silvia Gonzalez": 0,
                "Silvia Villalobos": 0,
                "Marisol Aguirre": 0,
                "Maria Lazcano": 0,
                "Isaac Maguiña": 0,
                "Axis Maurice": 0,
                "Vitel Desrosiers": 0,
                "Veronica Ortiz": 0,
                "Rosa Smart": 0,
                "Patricia Quirilao": 0
            };

            // Contar la frecuencia de cada aseador en la columna correspondiente
            dailyAseoData.forEach(row => {
                const aseadorName = row[1].trim(); // Suponiendo que el nombre del aseador está en la segunda columna (índice 1)
                if (aseadoresCount.hasOwnProperty(aseadorName)) {
                    aseadoresCount[aseadorName]++;
                }
            });

            // Actualizar los datos del gráfico de aseadores
            aseadoresChart.data.datasets[0].data = Object.values(aseadoresCount);
            aseadoresChart.update();
        } catch (error) {
            console.error("Error al actualizar el gráfico de aseadores:", error);
        }
    }

    // Función para actualizar todos los gráficos
    async function updateAllCharts() {
        updateTaskChart();
        updateAttendanceChart();
        await updateAseadoresChart();
    }

    // Configurar la actualización automática cada 5 segundos
    setInterval(async () => {
        try {
            await loadTablesData();
            await updateAllCharts();
            updateCounts();
        } catch (error) {
            console.error("Error en la actualización automática:", error);
        }
    }, 5000); // 5000 ms = 5 segundos

    // Función para actualizar los contadores
    function updateCounts() {
        const totalTasksCount = document.getElementById("total-tasks-count");
        const totalAttendanceCount = document.getElementById("total-attendance-count");
        totalTasksCount.textContent = assignmentTableBody.rows.length;
        totalAttendanceCount.textContent = dailyAseoTableBody.rows.length;
    }

    // Observador para detectar cambios en las tablas y actualizar contadores y gráficos
    const observer = new MutationObserver(() => {
        updateCounts();
        updateTaskChart();
        updateAttendanceChart();
        aseadoresChart.update(); // Asegura que el gráfico de aseadores se actualice si hay cambios
    });

    // Configura el observador en ambas tablas
    observer.observe(assignmentTableBody, { childList: true });
    observer.observe(dailyAseoTableBody, { childList: true });

    // Inicializa los contadores y gráficos al cargar la página
    updateCounts();
    updateTaskChart();
    updateAttendanceChart();
    updateAseadoresChart();
}

// Función para inicializar todo al cargar el DOM
document.addEventListener("DOMContentLoaded", () => {
    initializeGapiClient();
    initializeChartsAndCounters();
});
