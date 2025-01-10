// cleaner.js

import { initializeGapiClient, loadSheetData, appendData, updateSheetData, isUserAuthenticated, redirectToRolePage, handleLogout } from '/RedLogistica/api/googleSheets.js';

let lastTaskIds = new Set();
let lastCompletedIds = new Set();
let lastPendingBusIds = new Set();

document.addEventListener("DOMContentLoaded", async function () {
    try {
        await initializeGapiClient();

        if (isUserAuthenticated()) {
            updateConnectionStatus(true);
            await initializeCleanerData();
            setInterval(updateAllChartsAndCounters, 5000); // Actualizar cada 5 segundos
        } else {
            updateConnectionStatus(false);
            alert('No se pudo autenticar con Google Sheets.');
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
    } catch (error) {
        console.error("Error al inicializar la aplicación:", error);
    }
});

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

async function initializeCleanerData() {
    await loadAssignedTasks();
    await loadCompletedRecords();
    initializeChartsAndCounters();
    initializePagination();
    setupTableObservers();
}

async function loadAssignedTasks() {
    const tasksTableBody = document.getElementById("assigned-tasks-table").querySelector("tbody");
    const assignedTasks = await loadSheetData("aseo!A2:F"); // Ajusta el rango según tu hoja

    const currentUser = localStorage.getItem("username").toUpperCase();
    const userTasks = assignedTasks.filter(task => task[0].toUpperCase() === currentUser);

    const newTaskIds = new Set(userTasks.map(task => task[1])); // Asumiendo que task[1] es un ID único

    userTasks.forEach(task => {
        if (!lastTaskIds.has(task[1])) {
            const tr = document.createElement("tr");
            ["2", "3", "4"].forEach(i => { // PPU BUS, Tarea, Fecha Límite
                const td = document.createElement("td");
                td.textContent = task[i];
                tr.appendChild(td);
            });
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

function openTaskModal(task) {
    Swal.fire({
        title: 'Confirmación de Tarea',
        text: `¿Marcar la tarea "${task[3]}" en el bus "${task[2]}" como realizada?`,
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
            loadAssignedTasks(); // Recargar la tabla de asignadas
            loadCompletedRecords(); // Recargar la tabla de completadas
        }
    });
}

async function markTaskAsCompleted(task) {
    const completedRecordsTableBody = document.getElementById("completed-records-table").querySelector("tbody");
    const tr = document.createElement("tr");
    const cleaner = localStorage.getItem("username").toUpperCase();
    const fecha = new Date().toISOString().split('T')[0]; // Fecha actual en formato YYYY-MM-DD

    [task[2], cleaner, task[3], fecha].forEach(data => {
        const td = document.createElement("td");
        td.textContent = data;
        tr.appendChild(td);
    });
    completedRecordsTableBody.appendChild(tr);

    if (task.rowNumber) {
        await updateSheetData(`aseo!F${task.rowNumber}`, [['Realizado']]);
    } else {
        console.warn("Número de fila no disponible para actualizar el estado de la tarea.");
    }
}

async function loadCompletedRecords() {
    const recordsTableBody = document.getElementById("completed-records-table").querySelector("tbody");
    const completedRecords = await loadSheetData("aseo!I2:L"); // Ajusta el rango según tu hoja

    const currentUser = localStorage.getItem("username").toUpperCase();
    const userCompleted = completedRecords.filter(record => record[1].toUpperCase() === currentUser);

    const newCompletedIds = new Set(userCompleted.map(record => record[1])); // Asumiendo que record[1] es un ID único

    userCompleted.forEach(record => {
        if (!lastCompletedIds.has(record[1])) {
            const tr = document.createElement("tr");
            record.forEach(cellData => {
                const td = document.createElement("td");
                td.textContent = cellData;
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

async function loadPendingBuses() {
    const pendingBusesTableBody = document.getElementById("pending-buses-table").querySelector("tbody");
    const pendingBusesData = await loadSheetData("cleaner!A2:C"); // Ajusta el rango según tu hoja

    const currentUser = localStorage.getItem("username").toUpperCase();
    const userPendingBuses = pendingBusesData.filter(bus => bus[0].toUpperCase() === currentUser);

    const newPendingBusIds = new Set(userPendingBuses.map(bus => bus[0].toUpperCase())); // IDs únicos

    userPendingBuses.forEach(bus => {
        if (!lastPendingBusIds.has(bus[0].toUpperCase())) {
            const tr = document.createElement("tr");
            bus.forEach(cellData => {
                const td = document.createElement("td");
                td.textContent = cellData;
                tr.appendChild(td);
            });
            tr.addEventListener("click", () => handlePendingBusClick(bus[0]));
            pendingBusesTableBody.appendChild(tr);
            showPersistentAlert('info', 'Nuevo Bus Pendiente', `Bus ${bus[0]} tiene una tarea pendiente.`);
        }
    });

    lastPendingBusIds = newPendingBusIds;

    paginateTable(pendingBusesTableBody, "pending-buses-pagination");
}

function handlePendingBusClick(busId) {
    const busIdInput = document.getElementById("bus-id");
    busIdInput.value = busId.toUpperCase();
    document.getElementById("pending-buses-modal").style.display = 'none';
}

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
 * Funciones para manejar las alertas
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

/**
 * Funciones para manejar los gráficos con Chart.js
 */

// Ya implementadas arriba

// Asegúrate de implementar las funciones de gráficos y contadores aquí o en otro archivo si están separados



// pendingBuses.js

import { loadSheetData } from './googleSheets.js'; // Asegúrate de que la ruta es correcta

document.addEventListener("DOMContentLoaded", () => {
    // Seleccionar los elementos del DOM
    const pendingBusesBtn = document.getElementById("pending-buses-btn");
    const pendingBusesModal = document.getElementById("pending-buses-modal");
    const pendingBusesTableBody = document.querySelector("#pending-buses-table tbody");
    const closeModalBtn = document.getElementById("close-modal");
    const busIdInput = document.getElementById("bus-id");

    /**
     * Función para mostrar alertas utilizando SweetAlert2
     * @param {string} type - Tipo de alerta ('success', 'error', 'info', 'warning')
     * @param {string} title - Título de la alerta
     * @param {string} message - Mensaje de la alerta
     */
    function showAlert(type, title, message) {
        Swal.fire({
            icon: type,
            title: title,
            text: message,
            timer: 3000,
            timerProgressBar: true,
            showConfirmButton: false,
            position: 'top-end',
            toast: true,
            background: '#1e3d59',
            color: '#fff'
        });
    }

    /**
     * Función para abrir el modal y cargar los buses pendientes
     */
    const openPendingBusesModal = async () => {
        try {
            // Limpiar la tabla antes de cargar nuevos datos
            pendingBusesTableBody.innerHTML = '';

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
            console.log("Buses Data:", busesData); // Para depuración

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
                // Iterar sobre cada bus y crear una fila en la tabla
                busesData.forEach((bus, index) => {
                    const tr = document.createElement("tr");
                    tr.style.cursor = "pointer";

                    // Asumiendo que bus[0] = PPU BUS, bus[1] = Motivo, bus[2] = Fecha
                    const ppuBus = bus[0] ? bus[0].trim().toUpperCase() : '';
                    const motivo = bus[1] ? bus[1].trim() : '';
                    const fecha = bus[2] ? bus[2].trim() : '';

                    // Crear celdas
                    const tdPpu = document.createElement("td");
                    tdPpu.textContent = ppuBus;
                    tr.appendChild(tdPpu);

                    const tdMotivo = document.createElement("td");
                    tdMotivo.textContent = motivo;
                    tr.appendChild(tdMotivo);

                    const tdFecha = document.createElement("td");
                    tdFecha.textContent = fecha;
                    tr.appendChild(tdFecha);

                    // Añadir evento de clic a la fila
                    tr.addEventListener("click", () => {
                        busIdInput.value = ppuBus;
                        closePendingBusesModal();
                        showAlert('success', 'PPU BUS Agregado', `Bus ${ppuBus} agregado al registro.`);
                    });

                    pendingBusesTableBody.appendChild(tr);
                });
            }

            // Mostrar el modal
            pendingBusesModal.style.display = "flex";
        } catch (error) {
            console.error("Error al cargar buses pendientes:", error);
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
    };

    /**
     * Función para cerrar el modal
     */
    const closePendingBusesModal = () => {
        pendingBusesModal.style.display = "none";
    };

    // Asignar eventos
    pendingBusesBtn.addEventListener("click", openPendingBusesModal);
    closeModalBtn.addEventListener("click", closePendingBusesModal);

    // Cerrar el modal al hacer clic fuera del contenido
    window.addEventListener("click", (event) => {
        if (event.target === pendingBusesModal) {
            closePendingBusesModal();
        }
    });
});
