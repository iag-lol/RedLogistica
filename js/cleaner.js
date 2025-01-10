// cleaner.js

import { initializeGapiClient, loadSheetData, appendData, isUserAuthenticated, updateSheetData } from './googleSheets.js';

// Función para reproducir sonido
function playSound(soundPath) {
    const audio = new Audio(soundPath);
    audio.play().catch(error => {
        console.warn("Reproducción de sonido bloqueada o archivo no encontrado:", error);
    });
}

// Función para mostrar alerta flotante persistente hasta que el usuario la cierre
function showPersistentAlert(type, title, message) {
    let icon, color, soundPath;

    switch (type) {
        case 'info':
            icon = 'info';
            color = '#17a2b8';
            soundPath = '/sounds/nueva-tarea.mp3';
            break;
        case 'success':
            icon = 'success';
            color = '#28a745';
            soundPath = '/sounds/success.mp3';
            break;
        case 'warning':
            icon = 'warning';
            color = '#ffc107';
            soundPath = '/sounds/warning.mp3';
            break;
        case 'error':
            icon = 'error';
            color = '#dc3545';
            soundPath = '/sounds/error.mp3';
            break;
        default:
            icon = 'info';
            color = '#17a2b8';
    }

    Swal.fire({
        title: title,
        text: message,
        icon: icon,
        background: color,
        color: '#fff',
        showConfirmButton: true,
        confirmButtonText: 'Entendido',
        position: 'top-end',
        toast: true,
        timerProgressBar: true
    }).then(() => {
        if (soundPath) {
            playSound(soundPath);
        }
    });
}

document.addEventListener("DOMContentLoaded", async function () {
    const currentUser = localStorage.getItem("username");
    const usernameDisplay = document.getElementById("username-display");
    const connectionStatus = document.getElementById("connection-status");

    if (currentUser) {
        usernameDisplay.textContent = currentUser.toUpperCase(); // Convertir a mayúsculas
    } else {
        usernameDisplay.textContent = "USUARIO NO IDENTIFICADO";
    }

    await initializeGapiClient();

    checkConnectionStatus();
    if (isUserAuthenticated()) {
        connectionStatus.textContent = 'CONECTADO';
        connectionStatus.classList.add('connected');
        await initializeData();
        setInterval(updateAssignedTasks, 5000); // Actualizar tareas cada 5 segundos
        loadAssignmentAndBreakTime(currentUser); // Cargar asignación y hora de colación
    } else {
        connectionStatus.textContent = 'DESCONECTADO';
        connectionStatus.classList.remove('connected');
        Swal.fire({
            icon: 'error',
            title: 'Error de Autenticación',
            text: 'No se pudo autenticar con Google Sheets.',
        });
    }

    document.getElementById("register-aseo-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        await registerAseo();
    });

    document.getElementById("pending-buses-btn").addEventListener("click", () => {
        document.getElementById("pending-buses-modal").style.display = "flex";
        loadPendingBuses();
    });

    document.getElementById("close-modal").addEventListener("click", () => {
        document.getElementById("pending-buses-modal").style.display = "none";
    });
});

async function initializeData() {
    await loadAssignedTasks();
    await loadCompletedRecords();
    initializeChartsAndCounters();
    initializePagination();
    setupTableObservers();
}

// Función para verificar el estado de conexión y actualizar visualmente
function checkConnectionStatus() {
    const statusElement = document.getElementById('connection-status');
    const usernameElement = document.getElementById('username-display');
    
    if (isUserAuthenticated()) {
        statusElement.textContent = 'CONECTADO';
        statusElement.classList.remove('disconnected');
        statusElement.classList.add('connected');
    } else {
        statusElement.textContent = 'DESCONECTADO';
        statusElement.classList.remove('connected');
        statusElement.classList.add('disconnected');
    }

    const username = localStorage.getItem('username');
    usernameElement.textContent = username ? username.toUpperCase() : 'USUARIO DESCONOCIDO';
}

// Cargar asignación y hora de colación desde Google Sheets
async function loadAssignmentAndBreakTime(username) {
    const cleanerData = await loadSheetData("cleaner!A2:C");
    const userData = cleanerData.find(row => row[0].toUpperCase() === username.toUpperCase());

    if (userData) {
        document.getElementById("assignment-display").textContent = userData[1];
        document.getElementById("break-time-display").textContent = userData[2];
    } else {
        document.getElementById("assignment-display").textContent = "No asignado";
        document.getElementById("break-time-display").textContent = "No asignado";
    }
}

let lastTaskIds = new Set();
let lastCompletedIds = new Set();
let lastPendingBusIds = new Set();

// Cargar tareas asignadas para el usuario
async function loadAssignedTasks() {
    const tasksTable = document.getElementById("assigned-tasks-table").querySelector("tbody");
    const assignedTasks = await loadSheetData("aseo!A2:F");
    const currentUser = localStorage.getItem("username").toUpperCase();

    const userTasks = assignedTasks.filter(task => task[0].toUpperCase() === currentUser);
    const newTaskIds = new Set(userTasks.map(task => task[1])); // IDs actuales de tareas

    // Mostrar nuevas tareas sin borrar toda la tabla
    userTasks.forEach(task => {
        if (!lastTaskIds.has(task[1])) {
            const tr = document.createElement("tr");
            ["0", "1", "4"].forEach(i => { // PPU BUS, Tarea, Fecha Límite
                const td = document.createElement("td");
                td.textContent = task[i];
                tr.appendChild(td);
            });
            tr.dataset.taskId = task[1];
            tr.addEventListener("click", () => openTaskModal(task));
            tasksTable.appendChild(tr);
            showPersistentAlert('info', 'Nueva Asignación', 'Tienes nuevas tareas asignadas.');
        }
    });

    lastTaskIds = newTaskIds;

    // Actualizar gráficos y contadores
    updateCounts();
    updateTaskChart();
}

// Abrir modal de tarea realizada
function openTaskModal(task) {
    Swal.fire({
        title: 'Confirmación de Tarea',
        text: `¿Marcar la tarea "${task[2]}" en el bus "${task[0]}" como realizada?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Realizado',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#28a745',
        cancelButtonColor: '#dc3545'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await markTaskAsCompleted(task);
            showPersistentAlert('success', 'Tarea Realizada', 'La tarea ha sido marcada como realizada.');
            loadAssignedTasks(); // Recargar la tabla de asignadas
            loadCompletedRecords(); // Recargar la tabla de completadas
        }
    });
}

// Marcar tarea como realizada
async function markTaskAsCompleted(task) {
    // Añadir la tarea a la tabla de completadas
    const completedRecordsTable = document.getElementById("completed-records-table").querySelector("tbody");
    const tr = document.createElement("tr");
    [0, 1, 2, 4].forEach(i => { // PPU BUS, Cleaner (usuario), Aseo Realizado, Fecha
        const td = document.createElement("td");
        td.textContent = (i === 1) ? localStorage.getItem("username").toUpperCase() : task[i];
        tr.appendChild(td);
    });
    completedRecordsTable.appendChild(tr);

    // Actualizar el estado de la tarea en Google Sheets (columna D)
    await updateSheetData(`aseo!D${task.rowNumber}`, [["Realizado"]]); // Asegúrate de que `rowNumber` esté correctamente definido
}

// Cargar registros completados
async function loadCompletedRecords() {
    const recordsTable = document.getElementById("completed-records-table").querySelector("tbody");
    const completedRecords = await loadSheetData("aseo!I2:L");
    const currentUser = localStorage.getItem("username").toUpperCase();

    const userCompleted = completedRecords.filter(record => record[1].toUpperCase() === currentUser);
    const newCompletedIds = new Set(userCompleted.map(record => record[1])); // IDs únicos si aplica

    // Mostrar nuevos registros sin borrar toda la tabla
    userCompleted.forEach(record => {
        if (!lastCompletedIds.has(record[1])) {
            const tr = document.createElement("tr");
            record.forEach(cellData => {
                const td = document.createElement("td");
                td.textContent = cellData;
                tr.appendChild(td);
            });
            recordsTable.appendChild(tr);
        }
    });

    lastCompletedIds = newCompletedIds;

    // Actualizar gráficos y contadores
    updateCounts();
    updateAttendanceChart();
    updateAseadoresChart();
}

// Actualizar tareas
async function updateAssignedTasks() {
    await loadAssignedTasks();
}

// Registrar el aseo y limpiar el campo `bus-id`
async function registerAseo() {
    const busIdInput = document.getElementById("bus-id");
    const aseoType = document.getElementById("aseo-type").value;
    const dateInput = document.getElementById("date");

    const busId = busIdInput.value.trim().toUpperCase(); // Convertir a mayúsculas
    const aseoRealizado = aseoType;
    const fecha = dateInput.value;

    if (!busId || !aseoRealizado || !fecha) {
        Swal.fire({
            icon: 'warning',
            title: 'Campos Incompletos',
            text: 'Por favor, completa todos los campos del formulario de aseo.',
        });
        return;
    }

    const values = [[busId, localStorage.getItem("username").toUpperCase(), aseoRealizado, fecha]];
    await appendData("aseo!I2:L", values);
    loadCompletedRecords();

    // Mostrar alerta de éxito y limpiar el formulario
    Swal.fire({
        title: 'Registro Exitoso',
        text: 'Se ha registrado el aseo correctamente.',
        icon: 'success',
        confirmButtonText: 'OK'
    }).then(() => {
        busIdInput.value = "";
        aseoType.selectedIndex = 0;
        dateInput.value = "";
    });
}

// Cargar buses pendientes
async function loadPendingBuses() {
    const pendingBusesTable = document.getElementById("pending-buses-table").querySelector("tbody");
    const pendingBusesData = await loadSheetData("cleaner!A2:C");
    const currentUser = localStorage.getItem("username").toUpperCase();

    const userPendingBuses = pendingBusesData.filter(bus => bus[0].toUpperCase() === currentUser);
    const newPendingBusIds = new Set(userPendingBuses.map(bus => bus[0].toUpperCase())); // IDs únicos

    // Mostrar nuevos buses pendientes sin duplicados
    userPendingBuses.forEach(bus => {
        if (!lastPendingBusIds.has(bus[0].toUpperCase())) {
            const tr = document.createElement("tr");
            bus.forEach(cellData => {
                const td = document.createElement("td");
                td.textContent = cellData;
                tr.appendChild(td);
            });
            tr.addEventListener("click", () => handlePendingBusClick(bus[0]));
            pendingBusesTable.appendChild(tr);
            showPersistentAlert('info', 'Nuevo Bus Pendiente', `Bus ${bus[0]} tiene una tarea pendiente.`);
        }
    });

    lastPendingBusIds = newPendingBusIds;

    // Actualizar paginación si es necesario
    paginateTable(pendingBusesTable, "pending-buses-pagination");
}

// Función para llenar automáticamente el input de PPU Bus al clicar en un bus pendiente
function handlePendingBusClick(busId) {
    const busIdInput = document.getElementById("bus-id");
    busIdInput.value = busId.toUpperCase();
    document.getElementById("pending-buses-modal").style.display = 'none';
}

// Función para actualizar contadores
function updateCounts() {
    const totalTasksCount = document.getElementById("total-tasks-count");
    const totalAttendanceCount = document.getElementById("total-attendance-count");
    const assignedTasksCount = document.getElementById("assigned-tasks-table").querySelector("tbody").rows.length;
    const completedRecordsCount = document.getElementById("completed-records-table").querySelector("tbody").rows.length;

    totalTasksCount.textContent = assignedTasksCount;
    totalAttendanceCount.textContent = completedRecordsCount;
}

// -------------------------------
// Funciones para manejar los gráficos con Chart.js
// -------------------------------

let taskChart, attendanceChart, aseadoresChart;

function initializeCharts() {
    const taskChartCtx = document.getElementById("taskChart").getContext("2d");
    const attendanceChartCtx = document.getElementById("attendanceChart").getContext("2d");
    const aseadoresChartCtx = document.getElementById("aseadoresChart").getContext("2d");

    // Gráfico de Tareas Asignadas
    taskChart = new Chart(taskChartCtx, {
        type: 'bar',
        data: {
            labels: ["LAURA SOTO", "GALINDO SAEZ", "LAUREANO RAMIREZ", "PAMELA ANDRADES", "HUGO CARRASCO", "GLORIA ANGEL", "DANIELA SOLORZA", "SILVIA GONZALEZ", "SILVIA VILLALOBOS", "MARISOL AGUIRRE", "MARIA LAZCANO", "ISAAC MAGUINA", "AXIS MAURICE", "VITEL DESROSIERS", "VERONICA ORTIZ", "ROSA SMART", "PATRICIA QUIRILAO"],
            datasets: [{
                label: "Tareas Asignadas",
                data: new Array(17).fill(0),
                backgroundColor: "rgba(30, 61, 89, 0.7)"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: 'Tareas Asignadas por Aseador'
                }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });

    // Gráfico de Aseos Realizados por Tipo
    attendanceChart = new Chart(attendanceChartCtx, {
        type: 'bar',
        data: {
            labels: ["Barrido", "Trapeado", "Barrido y Trapeado", "Buses por Inspección", "Revisado por ICA", "Programado por RTG", "Programado por DTPM", "Programado por APPLUS"],
            datasets: [{
                label: "Aseos Realizados",
                data: [0, 0, 0, 0, 0, 0, 0, 0],
                backgroundColor: "rgba(23, 162, 184, 0.7)"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: 'Aseos Realizados por Tipo'
                }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });

    // Gráfico de Registros de Aseadores
    aseadoresChart = new Chart(aseadoresChartCtx, {
        type: 'bar',
        data: {
            labels: ["LAURA SOTO", "GALINDO SAEZ", "LAUREANO RAMIREZ", "PAMELA ANDRADES", "HUGO CARRASCO", "GLORIA ANGEL", "DANIELA SOLORZA", "SILVIA GONZALEZ", "SILVIA VILLALOBOS", "MARISOL AGUIRRE", "MARIA LAZCANO", "ISAAC MAGUINA", "AXIS MAURICE", "VITEL DESROSIERS", "VERONICA ORTIZ", "ROSA SMART", "PATRICIA QUIRILAO"],
            datasets: [{
                label: "Registros de Aseos",
                data: new Array(17).fill(0),
                backgroundColor: "rgba(75, 192, 192, 0.7)"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: 'Registros de Aseos por Aseador'
                }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// Función para actualizar el gráfico de tareas asignadas
async function updateTaskChart() {
    const assignedTasks = await loadSheetData("aseo!A2:F");
    const currentUser = localStorage.getItem("username").toUpperCase();

    const taskCounts = {
        "LAURA SOTO": 0,
        "GALINDO SAEZ": 0,
        "LAUREANO RAMIREZ": 0,
        "PAMELA ANDRADES": 0,
        "HUGO CARRASCO": 0,
        "GLORIA ANGEL": 0,
        "DANIELA SOLORZA": 0,
        "SILVIA GONZALEZ": 0,
        "SILVIA VILLALOBOS": 0,
        "MARISOL AGUIRRE": 0,
        "MARIA LAZCANO": 0,
        "ISAAC MAGUINA": 0,
        "AXIS MAURICE": 0,
        "VITEL DESROSIERS": 0,
        "VERONICA ORTIZ": 0,
        "ROSA SMART": 0,
        "PATRICIA QUIRILAO": 0
    };

    assignedTasks.forEach(task => {
        const cleanerName = task[0].toUpperCase();
        if (taskCounts.hasOwnProperty(cleanerName)) {
            taskCounts[cleanerName]++;
        }
    });

    taskChart.data.datasets[0].data = Object.values(taskCounts);
    taskChart.update();
}

// Función para actualizar el gráfico de aseos realizados por tipo
async function updateAttendanceChart() {
    const completedRecords = await loadSheetData("aseo!I2:L");

    const aseoCounts = {
        "Barrido": 0,
        "Trapeado": 0,
        "Barrido y Trapeado": 0,
        "Buses por Inspección": 0,
        "Revisado por ICA": 0,
        "Programado por RTG": 0,
        "Programado por DTPM": 0,
        "Programado por APPLUS": 0
    };

    completedRecords.forEach(record => {
        const aseoType = record[2];
        if (aseoCounts.hasOwnProperty(aseoType)) {
            aseoCounts[aseoType]++;
        }
    });

    attendanceChart.data.datasets[0].data = Object.values(aseoCounts);
    attendanceChart.update();
}

// Función para actualizar el gráfico de registros de aseadores
async function updateAseadoresChart() {
    const completedRecords = await loadSheetData("aseo!I2:L");

    const aseadoresCount = {
        "LAURA SOTO": 0,
        "GALINDO SAEZ": 0,
        "LAUREANO RAMIREZ": 0,
        "PAMELA ANDRADES": 0,
        "HUGO CARRASCO": 0,
        "GLORIA ANGEL": 0,
        "DANIELA SOLORZA": 0,
        "SILVIA GONZALEZ": 0,
        "SILVIA VILLALOBOS": 0,
        "MARISOL AGUIRRE": 0,
        "MARIA LAZCANO": 0,
        "ISAAC MAGUINA": 0,
        "AXIS MAURICE": 0,
        "VITEL DESROSIERS": 0,
        "VERONICA ORTIZ": 0,
        "ROSA SMART": 0,
        "PATRICIA QUIRILAO": 0
    };

    completedRecords.forEach(record => {
        const cleanerName = record[1].toUpperCase();
        if (aseadoresCount.hasOwnProperty(cleanerName)) {
            aseadoresCount[cleanerName]++;
        }
    });

    aseadoresChart.data.datasets[0].data = Object.values(aseadoresCount);
    aseadoresChart.update();
}

// Función para inicializar y configurar los gráficos y contadores
function initializeChartsAndCounters() {
    initializeCharts();
    updateTaskChart();
    updateAttendanceChart();
    updateAseadoresChart();
    updateCounts();
}

// Función para actualizar todos los gráficos y contadores
async function updateAllChartsAndCounters() {
    await loadAssignedTasks();
    await loadCompletedRecords();
    updateAllCharts();
    updateCounts();
}

// Función para configurar la actualización automática cada 5 segundos
function setupAutoUpdate() {
    setInterval(async () => {
        try {
            await updateAllChartsAndCounters();
        } catch (error) {
            console.error("Error en la actualización automática:", error);
            showAlert('error', 'Error de Actualización', 'Ocurrió un error al actualizar los datos.');
        }
    }, 5000); // 5000 ms = 5 segundos
}

// -------------------------------
// Funciones para manejar los modales
// -------------------------------
const taskModal = document.getElementById('task-modal');
const closeTaskModalBtn = document.getElementById('close-task-modal');
const taskCompletedBtn = document.getElementById('task-completed-btn');

const pendingBusesModal = document.getElementById('pending-buses-modal');
const closePendingBusesModalBtn = document.getElementById('close-modal');
const pendingBusesBtn = document.getElementById('pending-buses-btn');

// Cerrar modal de tarea realizada
closeTaskModalBtn.addEventListener('click', () => {
    taskModal.style.display = 'none';
});

// Cerrar modal de buses pendientes
closePendingBusesModalBtn.addEventListener('click', () => {
    pendingBusesModal.style.display = 'none';
});

// Cerrar modales al hacer clic fuera del contenido
window.addEventListener('click', (event) => {
    if (event.target === taskModal) {
        taskModal.style.display = 'none';
    }
    if (event.target === pendingBusesModal) {
        pendingBusesModal.style.display = 'none';
    }
});

// -------------------------------
// Funciones para paginación de tablas
// -------------------------------
function paginateTable(tableBody, paginationContainerId, rowsPerPage = 10) {
    const paginationContainer = document.getElementById(paginationContainerId);
    let currentPage = 1;

    function renderTable() {
        const rows = Array.from(tableBody.rows);
        const totalPages = Math.ceil(rows.length / rowsPerPage);

        // Ocultar todas las filas
        rows.forEach((row, index) => {
            row.style.display = (index >= (currentPage - 1) * rowsPerPage && index < currentPage * rowsPerPage) ? "" : "none";
        });

        // Limpiar paginación
        paginationContainer.innerHTML = "";

        // Crear botones de paginación
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

// Inicializar paginación para cada tabla
function initializePagination() {
    paginateTable(document.getElementById("assigned-tasks-table").querySelector("tbody"), "assignment-pagination");
    paginateTable(document.getElementById("completed-records-table").querySelector("tbody"), "completed-records-pagination");
    paginateTable(document.getElementById("pending-buses-table").querySelector("tbody"), "pending-buses-pagination");
}

// Observador para detectar cambios en las tablas y actualizar paginación
function setupTableObservers() {
    const observerOptions = { childList: true };

    const assignmentObserver = new MutationObserver(() => {
        paginateTable(document.getElementById("assigned-tasks-table").querySelector("tbody"), "assignment-pagination");
        updateCounts();
        updateTaskChart();
    });

    const completedRecordsObserver = new MutationObserver(() => {
        paginateTable(document.getElementById("completed-records-table").querySelector("tbody"), "completed-records-pagination");
        updateCounts();
        updateAttendanceChart();
        updateAseadoresChart();
    });

    const pendingBusesObserver = new MutationObserver(() => {
        paginateTable(document.getElementById("pending-buses-table").querySelector("tbody"), "pending-buses-pagination");
    });

    assignmentObserver.observe(document.getElementById("assigned-tasks-table").querySelector("tbody"), observerOptions);
    completedRecordsObserver.observe(document.getElementById("completed-records-table").querySelector("tbody"), observerOptions);
    pendingBusesObserver.observe(document.getElementById("pending-buses-table").querySelector("tbody"), observerOptions);
}

// -------------------------------
// Funciones para manejar las alertas
// -------------------------------
function showAlert(type, title, message) {
    Swal.fire({
        title: title,
        text: message,
        icon: type,
        confirmButtonText: 'OK',
        position: 'top-end',
        toast: true,
        timer: 3000,
        timerProgressBar: true
    });
}

// -------------------------------
// Inicialización y configuración general
// -------------------------------
async function initializeData() {
    await loadAssignedTasks();
    await loadCompletedRecords();
    initializeChartsAndCounters();
    initializePagination();
    setupTableObservers();
    setupAutoUpdate();
}

// Función para actualizar todos los gráficos y contadores
async function updateAllChartsAndCounters() {
    await loadAssignedTasks();
    await loadCompletedRecords();
    updateAllCharts();
    updateCounts();
}
