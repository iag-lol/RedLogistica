// cleaner.js

import { 
    initializeGapiClient, 
    loadSheetData, 
    appendData, 
    updateSheetData, 
    isUserAuthenticated, 
    redirectToRolePage, 
    handleLogout 
} from '/RedLogistica/api/googleSheets.js';

let lastTaskIds = new Set();
let lastCompletedIds = new Set();
let lastPendingBusIds = new Set();

document.addEventListener("DOMContentLoaded", async function () {
    try {
        console.log("Inicializando cliente de Google API...");
        await initializeGapiClient();

        if (isUserAuthenticated()) {
            console.log("Usuario autenticado.");
            updateConnectionStatus(true);
            await initializeCleanerData();
            setInterval(updateAllChartsAndCounters, 5000); // Actualizar cada 5 segundos
        } else {
            console.log("Usuario no autenticado.");
            updateConnectionStatus(false);
            alert('No se pudo autenticar con Google Sheets.');
        }

        document.getElementById("register-aseo-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            await registerAseo();
        });

        document.getElementById("pending-buses-btn").addEventListener("click", () => {
            openPendingBusesModal();
        });

        document.getElementById("close-modal").addEventListener("click", () => {
            closePendingBusesModal();
        });

        // Cerrar el modal al hacer clic fuera del contenido
        window.addEventListener("click", (event) => {
            const pendingBusesModal = document.getElementById("pending-buses-modal");
            if (event.target === pendingBusesModal) {
                closePendingBusesModal();
            }
        });

    } catch (error) {
        console.error("Error al inicializar la aplicación:", error);
    }
});

/**
 * Actualiza el estado de conexión en la interfaz
 * @param {boolean} connected - Indica si está conectado o no
 */
function updateConnectionStatus(connected) {
    const connectionStatus = document.getElementById("connection-status");
    if (connected) {
        connectionStatus.textContent = 'CONECTADO';
        connectionStatus.classList.add('connected');
        connectionStatus.classList.remove('disconnected');
    } else {
        connectionStatus.textContent = 'DESCONECTADO';
        connectionStatus.classList.remove('connected');
        connectionStatus.classList.add('disconnected');
    }

    const username = localStorage.getItem("username");
    const usernameDisplay = document.getElementById("username-display");
    usernameDisplay.textContent = username ? username.toUpperCase() : 'USUARIO DESCONOCIDO';
}

/**
 * Inicializa los datos del Cleaner
 */
async function initializeCleanerData() {
    console.log("Cargando tareas asignadas...");
    await loadAssignedTasks();
    console.log("Cargando registros completados...");
    await loadCompletedRecords();
    console.log("Inicializando gráficos y contadores...");
    initializeChartsAndCounters();
    console.log("Inicializando paginación...");
    initializePagination();
    console.log("Configurando observadores de tablas...");
    setupTableObservers();
}

/**
 * Carga las tareas asignadas al usuario actual
 */
async function loadAssignedTasks() {
    const tasksTableBody = document.getElementById("assigned-tasks-table").querySelector("tbody");
    const assignedTasks = await loadSheetData("aseo!A2:F"); // Ajusta el rango según tu hoja

    console.log("Datos de tareas asignadas:", assignedTasks);

    const currentUser = localStorage.getItem("username");
    if (!currentUser) {
        console.error("No se encontró el nombre de usuario en localStorage.");
        return;
    }
    const userTasks = assignedTasks.filter(task => {
        if (!task[0]) return false;
        return task[0].trim().toUpperCase() === currentUser.toUpperCase();
    });

    console.log(`Tareas para el usuario ${currentUser}:`, userTasks);

    const newTaskIds = new Set(userTasks.map(task => task[1])); // Asumiendo que task[1] es un ID único

    userTasks.forEach(task => {
        if (!lastTaskIds.has(task[1])) {
            const tr = document.createElement("tr");

            // Crear celdas para PPU BUS, Tarea, Fecha Límite
            const ppuBus = task[1] ? task[1].trim().toUpperCase() : 'N/A';
            const tarea = task[2] ? task[2].trim() : 'N/A';
            const fechaLimite = task[3] ? task[3].trim() : 'N/A';

            const tdPpu = document.createElement("td");
            tdPpu.textContent = ppuBus;
            tr.appendChild(tdPpu);

            const tdTarea = document.createElement("td");
            tdTarea.textContent = tarea;
            tr.appendChild(tdTarea);

            const tdFecha = document.createElement("td");
            tdFecha.textContent = fechaLimite;
            tr.appendChild(tdFecha);

            tr.dataset.taskId = task[1];
            tr.dataset.rowNumber = task.rowNumber || ""; // Asigna el número de fila si está disponible

            tr.addEventListener("click", () => openTaskModal(task));

            tasksTableBody.appendChild(tr);
            showPersistentAlert('info', 'Nueva Asignación', 'Tienes nuevas tareas asignadas.');
        }
    });

    lastTaskIds = newTaskIds;

    updateCounts();
    updateTaskChart();
}

/**
 * Abre el modal para marcar una tarea como realizada
 * @param {Array} task - Información de la tarea
 */
function openTaskModal(task) {
    Swal.fire({
        title: 'Confirmación de Tarea',
        text: `¿Marcar la tarea "${task[2]}" en el bus "${task[1]}" como realizada?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Realizado',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#28a745',
        cancelButtonColor: '#dc3545'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await markTaskAsCompleted(task);
            Swal.fire({
                title: 'Tarea Realizada',
                text: 'La tarea ha sido marcada como realizada.',
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            });
            await loadAssignedTasks(); // Recargar la tabla de asignadas
            await loadCompletedRecords(); // Recargar la tabla de completadas
        }
    });
}

/**
 * Marca una tarea como completada
 * @param {Array} task - Información de la tarea
 */
async function markTaskAsCompleted(task) {
    const completedRecordsTableBody = document.getElementById("completed-records-table").querySelector("tbody");
    const tr = document.createElement("tr");
    const cleaner = localStorage.getItem("username").toUpperCase();
    const fecha = new Date().toISOString().split('T')[0]; // Fecha actual en formato YYYY-MM-DD

    const ppuBus = task[1] ? task[1].trim().toUpperCase() : 'N/A';
    const tarea = task[2] ? task[2].trim() : 'N/A';
    const fechaRegistro = fecha;

    [ppuBus, cleaner, tarea, fechaRegistro].forEach(data => {
        const td = document.createElement("td");
        td.textContent = data;
        tr.appendChild(td);
    });
    completedRecordsTableBody.appendChild(tr);

    if (task.rowNumber) {
        await updateSheetData(`aseo!F${task.rowNumber}`, [['Realizado']]);
        console.log(`Actualizado estado de tarea en la fila ${task.rowNumber}`);
    } else {
        console.warn("Número de fila no disponible para actualizar el estado de la tarea.");
    }
}

/**
 * Carga los registros completados del usuario actual
 */
async function loadCompletedRecords() {
    const recordsTableBody = document.getElementById("completed-records-table").querySelector("tbody");
    const completedRecords = await loadSheetData("aseo!I2:L"); // Ajusta el rango según tu hoja

    console.log("Datos de registros completados:", completedRecords);

    const currentUser = localStorage.getItem("username");
    if (!currentUser) {
        console.error("No se encontró el nombre de usuario en localStorage.");
        return;
    }
    const userCompleted = completedRecords.filter(record => {
        if (!record[1]) return false;
        return record[1].trim().toUpperCase() === currentUser.toUpperCase();
    });

    console.log(`Registros completados para el usuario ${currentUser}:`, userCompleted);

    const newCompletedIds = new Set(userCompleted.map(record => record[1])); // Asumiendo que record[1] es un ID único

    userCompleted.forEach(record => {
        if (!lastCompletedIds.has(record[1])) {
            const tr = document.createElement("tr");
            const ppuBus = record[0] ? record[0].trim().toUpperCase() : 'N/A';
            const cleaner = record[1] ? record[1].trim().toUpperCase() : 'N/A';
            const aseoRealizado = record[2] ? record[2].trim() : 'N/A';
            const fecha = record[3] ? record[3].trim() : 'N/A';

            [ppuBus, cleaner, aseoRealizado, fecha].forEach(data => {
                const td = document.createElement("td");
                td.textContent = data;
                tr.appendChild(td);
            });
            recordsTableBody.appendChild(tr);
        }
    });

    lastCompletedIds = newCompletedIds;

    updateCounts();
    updateAttendanceChart();
    updateAseadoresChart();
}

/**
 * Registra un nuevo aseo
 */
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

    const currentUser = localStorage.getItem("username");
    if (!currentUser) {
        Swal.fire({
            icon: 'error',
            title: 'Error de Usuario',
            text: 'No se pudo identificar al usuario. Por favor, inicia sesión nuevamente.',
        });
        return;
    }

    const values = [[busId, currentUser.toUpperCase(), aseoRealizado, fecha]];
    await appendData("aseo!I2:L", values);
    console.log("Aseo registrado:", values);
    await loadCompletedRecords();

    Swal.fire({
        title: 'Registro Exitoso',
        text: 'Se ha registrado el aseo correctamente.',
        icon: 'success',
        confirmButtonText: 'OK'
    }).then(() => {
        busIdInput.value = "";
        document.getElementById("aseo-type").selectedIndex = 0;
        dateInput.value = "";
    });
}

/**
 * Abre el modal y carga los buses pendientes del usuario
 */
async function openPendingBusesModal() {
    const pendingBusesTableBody = document.querySelector("#pending-buses-table tbody");
    const busIdInput = document.getElementById("bus-id");

    try {
        console.log("Cargando buses pendientes...");
        pendingBusesTableBody.innerHTML = ''; // Limpiar la tabla

        // Mostrar un mensaje de carga
        const loadingRow = document.createElement("tr");
        const loadingTd = document.createElement("td");
        loadingTd.colSpan = 3;
        loadingTd.textContent = "Cargando...";
        loadingTd.style.textAlign = "center";
        loadingRow.appendChild(loadingTd);
        pendingBusesTableBody.appendChild(loadingRow);

        // Cargar datos desde Google Sheets (rango: cleaner!A2:C)
        const busesData = await loadSheetData("cleaner!A2:C");
        console.log("Datos de buses pendientes:", busesData);

        // Limpiar el mensaje de carga
        pendingBusesTableBody.innerHTML = '';

        if (!busesData || busesData.length === 0) {
            // Si no hay datos, mostrar un mensaje
            const tr = document.createElement("tr");
            const td = document.createElement("td");
            td.colSpan = 3;
            td.textContent = "No hay buses pendientes.";
            td.style.textAlign = "center";
            tr.appendChild(td);
            pendingBusesTableBody.appendChild(tr);
        } else {
            const currentUser = localStorage.getItem("username");
            if (!currentUser) {
                console.error("No se encontró el nombre de usuario en localStorage.");
                return;
            }

            const userPendingBuses = busesData.filter(bus => {
                if (!bus[0]) return false;
                return bus[0].trim().toUpperCase() === currentUser.toUpperCase();
            });

            console.log(`Buses pendientes para el usuario ${currentUser}:`, userPendingBuses);

            const newPendingBusIds = new Set(userPendingBuses.map(bus => bus[0].trim().toUpperCase()));

            userPendingBuses.forEach(bus => {
                const ppuBus = bus[0] ? bus[0].trim().toUpperCase() : 'N/A';
                const motivo = bus[1] ? bus[1].trim() : 'N/A';
                const fecha = bus[2] ? bus[2].trim() : 'N/A';

                if (!lastPendingBusIds.has(ppuBus)) {
                    const tr = document.createElement("tr");
                    tr.style.cursor = "pointer";

                    const tdPpu = document.createElement("td");
                    tdPpu.textContent = ppuBus;
                    tr.appendChild(tdPpu);

                    const tdMotivo = document.createElement("td");
                    tdMotivo.textContent = motivo;
                    tr.appendChild(tdMotivo);

                    const tdFecha = document.createElement("td");
                    tdFecha.textContent = fecha;
                    tr.appendChild(tdFecha);

                    tr.addEventListener("click", () => {
                        busIdInput.value = ppuBus;
                        closePendingBusesModal();
                        showAlert('success', 'PPU BUS Agregado', `Bus ${ppuBus} agregado al registro.`);
                    });

                    pendingBusesTableBody.appendChild(tr);
                    showPersistentAlert('info', 'Nuevo Bus Pendiente', `Bus ${ppuBus} tiene una tarea pendiente.`);
                }
            });

            lastPendingBusIds = newPendingBusIds;
        }

        // Mostrar el modal
        const pendingBusesModal = document.getElementById("pending-buses-modal");
        pendingBusesModal.style.display = "flex";

    } catch (error) {
        console.error("Error al cargar buses pendientes:", error);
        const pendingBusesTableBody = document.querySelector("#pending-buses-table tbody");
        pendingBusesTableBody.innerHTML = ''; // Limpiar cualquier mensaje
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 3;
        td.textContent = "Error al cargar los datos.";
        td.style.textAlign = "center";
        tr.appendChild(td);
        pendingBusesTableBody.appendChild(tr);
        showAlert('error', 'Error de Carga', 'No se pudieron cargar los buses pendientes.');
    }
}

/**
 * Cierra el modal de buses pendientes
 */
function closePendingBusesModal() {
    const pendingBusesModal = document.getElementById("pending-buses-modal");
    pendingBusesModal.style.display = "none";
}

/**
 * Función para manejar el clic en un bus pendiente
 * @param {string} busId - PPU BUS seleccionado
 */
function handlePendingBusClick(busId) {
    const busIdInput = document.getElementById("bus-id");
    busIdInput.value = busId.toUpperCase();
    closePendingBusesModal();
}

/**
 * Actualiza los contadores en la interfaz
 */
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

async function updateTaskChart() {
    const assignedTasks = await loadSheetData("aseo!A2:F");
    console.log("Actualizando gráfico de tareas asignadas con:", assignedTasks);

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
        if (task[0] && task[0].trim().toUpperCase() in taskCounts) {
            taskCounts[task[0].trim().toUpperCase()]++;
        }
    });

    taskChart.data.datasets[0].data = Object.values(taskCounts);
    taskChart.update();
    console.log("Gráfico de tareas asignadas actualizado.");
}

async function updateAttendanceChart() {
    const completedRecords = await loadSheetData("aseo!I2:L");
    console.log("Actualizando gráfico de aseos realizados con:", completedRecords);

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
        const aseoType = record[2] ? record[2].trim() : '';
        if (aseoType in aseoCounts) {
            aseoCounts[aseoType]++;
        }
    });

    attendanceChart.data.datasets[0].data = Object.values(aseoCounts);
    attendanceChart.update();
    console.log("Gráfico de aseos realizados actualizado.");
}

async function updateAseadoresChart() {
    const completedRecords = await loadSheetData("aseo!I2:L");
    console.log("Actualizando gráfico de registros de aseadores con:", completedRecords);

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
        const cleanerName = record[1] ? record[1].trim().toUpperCase() : '';
        if (cleanerName in aseadoresCount) {
            aseadoresCount[cleanerName]++;
        }
    });

    aseadoresChart.data.datasets[0].data = Object.values(aseadoresCount);
    aseadoresChart.update();
    console.log("Gráfico de registros de aseadores actualizado.");
}

function initializeChartsAndCounters() {
    initializeCharts();
    updateTaskChart();
    updateAttendanceChart();
    updateAseadoresChart();
    updateCounts();
}

async function updateAllChartsAndCounters() {
    await loadAssignedTasks();
    await loadCompletedRecords();
    updateTaskChart();
    updateAttendanceChart();
    updateAseadoresChart();
    updateCounts();
}

/**
 * Funciones para paginación de tablas
 */
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

function initializePagination() {
    paginateTable(document.getElementById("assigned-tasks-table").querySelector("tbody"), "assignment-pagination");
    paginateTable(document.getElementById("completed-records-table").querySelector("tbody"), "completed-records-pagination");
    paginateTable(document.getElementById("pending-buses-table").querySelector("tbody"), "pending-buses-pagination");
}

/**
 * Configura observadores para las tablas y actualiza paginación y gráficos al modificar
 */
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

/**
 * Funciones para manejar las alertas usando SweetAlert2
 */
function showPersistentAlert(type, title, message) {
    Swal.fire({
        title: title,
        text: message,
        icon: type,
        background: '#1e3d59',
        color: '#fff',
        showConfirmButton: true,
        confirmButtonText: 'Entendido',
        position: 'top-end',
        toast: true,
        timer: 5000,
        timerProgressBar: true
    });
}

function showAlert(type, title, message) {
    Swal.fire({
        icon: type,
        title: title,
        text: message,
        confirmButtonText: 'OK',
        position: 'top-end',
        toast: true,
        timer: 3000,
        timerProgressBar: true,
        background: '#1e3d59',
        color: '#fff'
    });
}
