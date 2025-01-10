// cleaner.js

import { initializeGapiClient, loadSheetData, appendData, isUserAuthenticated, updateSheetData } from '../api/googleSheets.js';

// Función para reproducir sonido
function playSound(soundPath) {
    const audio = new Audio(soundPath);
    audio.play().catch(error => {
        console.warn("Reproducción de sonido bloqueada o archivo no encontrado:", error);
    });
}

// Función para mostrar alertas mejoradas con SweetAlert2
function showAlert(type, title, message) {
    Swal.fire({
        title: title,
        text: message,
        icon: type, // 'success', 'error', 'warning', 'info', 'question'
        confirmButtonText: 'OK',
        position: 'top-end',
        toast: true,
        timer: 5000,
        timerProgressBar: true,
        showConfirmButton: false,
        background: type === 'success' ? '#d4edda' :
                   type === 'error' ? '#f8d7da' :
                   type === 'warning' ? '#fff3cd' :
                   '#cce5ff',
        color: '#333',
        customClass: {
            popup: 'animated fadeInDown'
        }
    });
}

// Función para mostrar alertas persistentes hasta que el usuario las cierre
function showPersistentAlert(type, title, message) {
    Swal.fire({
        title: title,
        text: message,
        icon: type, // 'success', 'error', 'warning', 'info', 'question'
        showConfirmButton: true,
        confirmButtonText: 'Entendido',
        position: 'top-end',
        toast: true,
        background: type === 'success' ? '#d4edda' :
                   type === 'error' ? '#f8d7da' :
                   type === 'warning' ? '#fff3cd' :
                   '#cce5ff',
        color: '#333',
        customClass: {
            popup: 'animated fadeInDown'
        }
    }).then(() => {
        if (type === 'info') {
            playSound('/sounds/nueva-tarea.mp3'); // Asegúrate de que esta ruta sea correcta
        }
    });
}

document.addEventListener("DOMContentLoaded", async function () {
    const currentUser = localStorage.getItem("username");
    const usernameDisplay = document.getElementById("username-display");
    const connectionStatus = document.getElementById("connection-status");

    if (currentUser) {
        usernameDisplay.textContent = currentUser;
    } else {
        usernameDisplay.textContent = "Usuario no identificado";
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
        showAlert("error", "Autenticación Fallida", "No se pudo autenticar con Google Sheets");
    }

    // Event Listener para el formulario de registro de aseo
    document.getElementById("register-aseo-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        await registerAseo();
    });

    // Event Listener para el botón de buses pendientes
    document.getElementById("pending-buses-btn").addEventListener("click", () => {
        document.getElementById("pending-buses-modal").style.display = "flex";
        loadPendingBuses();
    });

    // Event Listener para cerrar el modal de buses pendientes
    document.getElementById("close-modal").addEventListener("click", () => {
        document.getElementById("pending-buses-modal").style.display = "none";
    });

    // Event Listener para clicks en filas de buses pendientes
    document.getElementById("pending-buses-table").querySelector("tbody").addEventListener("click", (e) => {
        const row = e.target.closest("tr");
        if (row) {
            const ppuBus = row.cells[0].textContent.trim();
            const busIdInput = document.getElementById("bus-id");
            busIdInput.value = ppuBus.toUpperCase(); // Colocar PPU en mayúsculas
            document.getElementById("pending-buses-modal").style.display = "none"; // Cerrar modal
            showAlert("info", "PPU Seleccionado", `El PPU ${ppuBus} ha sido seleccionado para registro.`);
        }
    });

    // Event Listener para cerrar el modal de tarea realizada
    document.getElementById("close-task-modal").addEventListener("click", () => {
        document.getElementById("task-modal").style.display = "none";
    });

    // Event Listener para marcar tarea como realizada
    document.getElementById("task-completed-btn").addEventListener("click", async () => {
        const taskId = document.getElementById("task-modal").getAttribute('data-task-id');
        if (taskId) {
            await markTaskAsCompleted(taskId);
            showAlert("success", "Tarea Completada", "La tarea ha sido marcada como realizada.");
            document.getElementById("task-modal").style.display = "none";
            await loadAssignedTasks(); // Recargar tareas asignadas
            await loadCompletedRecords(); // Recargar registros realizados
        } else {
            showAlert("warning", "Error", "No se pudo identificar la tarea.");
        }
    });

    // Convertir automáticamente a mayúsculas el input de PPU
    document.getElementById("bus-id").addEventListener("input", (e) => {
        e.target.value = e.target.value.toUpperCase();
    });
});

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
    usernameElement.textContent = username || 'Usuario desconocido';
}

// Cargar asignación y hora de colación desde Google Sheets
async function loadAssignmentAndBreakTime(username) {
    const cleanerData = await loadSheetData("cleaner!A2:C");
    const userData = cleanerData.find(row => row[0] === username);
    
    if (userData) {
        document.getElementById("assignment-display").textContent = userData[1];
        document.getElementById("break-time-display").textContent = userData[2];
    } else {
        document.getElementById("assignment-display").textContent = "No asignado";
        document.getElementById("break-time-display").textContent = "No asignado";
    }
}

let lastTaskIds = new Set();

// Inicializar datos cargados
async function initializeData() {
    await loadAssignedTasks();
    await loadCompletedRecords();
}

// Cargar tareas asignadas para el usuario
async function loadAssignedTasks() {
    const tasksTable = document.getElementById("assigned-tasks-table").querySelector("tbody");
    const assignedTasks = await loadSheetData("aseo!A2:F");
    const currentUser = localStorage.getItem("username");

    const userTasks = assignedTasks.filter(task => task[0] === currentUser);
    const newTaskIds = new Set(userTasks.map(task => task[1])); // IDs actuales de tareas

    // Mostrar nuevas tareas sin borrar toda la tabla
    userTasks.forEach(task => {
        if (!lastTaskIds.has(task[1])) {
            const tr = document.createElement("tr");
            tr.setAttribute('data-task-id', task[1]); // Asignar ID de tarea al atributo data
            ["0", "2", "4"].forEach(i => { // PPU BUS, Tarea, Fecha Límite (A, C, E)
                const td = document.createElement("td");
                td.textContent = task[i];
                tr.appendChild(td);
            });
            tr.addEventListener("click", () => openTaskModal(task));
            tasksTable.appendChild(tr);
            showPersistentAlert('info', 'Nueva Asignación', 'Tienes nuevas tareas asignadas.');
        }
    });

    // Quitar tareas que ya no están
    Array.from(tasksTable.rows).forEach(row => {
        const taskId = row.getAttribute('data-task-id');
        if (!newTaskIds.has(taskId)) {
            row.remove();
        }
    });

    lastTaskIds = newTaskIds;
}

// Abrir modal de tarea realizada
function openTaskModal(task) {
    const taskModal = document.getElementById("task-modal");
    taskModal.setAttribute('data-task-id', task[1]);
    taskModal.style.display = "flex";
}

// Marcar tarea como realizada
async function markTaskAsCompleted(taskId) {
    // Obtener los datos de la tarea
    const assignedTasks = await loadSheetData("aseo!A2:F");
    const task = assignedTasks.find(row => row[1] === taskId);

    if (task) {
        // Agregar la tarea a los registros realizados
        const completedValues = [[task[0], task[2], task[3], getCurrentDateTime()]];
        await appendData("aseo!I2:L", completedValues);

        // Actualizar la tarea en asignaciones como "Realizada"
        const rowIndex = assignedTasks.indexOf(task) + 2; // +2 porque las hojas de cálculo comienzan en 1 y hay encabezados
        const updateRange = `aseo!F${rowIndex}`; // Columna F para el estado
        await updateSheetData(updateRange, [["Realizada"]]);
    } else {
        showAlert("error", "Error", "No se encontró la tarea para marcar como realizada.");
    }
}

// Obtener la fecha y hora actual en formato 'DD/MM/YYYY HH:MM:SS'
function getCurrentDateTime() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Enero es 0
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

// Borrar tarea de Google Sheets (Ahora se marca como realizada)
async function deleteTask(taskId) {
    // Ya no se usa esta función porque ahora movemos la tarea a completadas
    // Mantenerla en caso de futuras modificaciones
}

// Actualizar tareas asignadas
async function updateAssignedTasks() {
    await loadAssignedTasks();
}

// Registrar el aseo y limpiar el campo `bus-id`
async function registerAseo() {
    const busIdInput = document.getElementById("bus-id");
    const aseoType = document.getElementById("aseo-type").value;
    const cleanerName = localStorage.getItem("username");

    if (!cleanerName) {
        showAlert("error", "Error", "Usuario no identificado.");
        return;
    }

    // Obtener la fecha y hora actual en formato 24 horas
    const date = getCurrentDateTime();

    const values = [[busIdInput.value, cleanerName, aseoType, date]];
    await appendData("aseo!I2:L", values);
    loadCompletedRecords();

    // Mostrar alerta de éxito y limpiar el campo bus-id
    Swal.fire({
        title: 'Registro exitoso',
        text: 'Se ha registrado el aseo correctamente.',
        icon: 'success',
        confirmButtonText: 'OK'
    }).then(() => {
        busIdInput.value = ""; // Limpiar solo el campo de bus-id después de la confirmación
    });
}

// Cargar registros realizados para el usuario
async function loadCompletedRecords() {
    const recordsTable = document.getElementById("completed-records-table").querySelector("tbody");
    const recordsData = await loadSheetData("aseo!I2:L");
    const currentUser = localStorage.getItem("username");

    // Filtrar registros realizados por el usuario
    const userRecords = recordsData.filter(record => record[1] === currentUser);

    // Limpiar la tabla antes de cargar los nuevos registros
    recordsTable.innerHTML = "";

    userRecords.forEach(row => {
        const tr = document.createElement("tr");
        row.forEach(cellData => {
            const td = document.createElement("td");
            td.textContent = cellData;
            tr.appendChild(td);
        });
        recordsTable.appendChild(tr);
    });
}

// Cargar buses pendientes
async function loadPendingBuses() {
    const pendingBusesTable = document.getElementById("pending-buses-table").querySelector("tbody");
    const pendingBusesData = await loadSheetData("cleaner!A2:C");

    // Limpiar la tabla antes de cargar los nuevos datos
    pendingBusesTable.innerHTML = "";

    pendingBusesData.forEach(row => {
        const tr = document.createElement("tr");
        row.forEach(cellData => {
            const td = document.createElement("td");
            td.textContent = cellData;
            tr.appendChild(td);
        });
        pendingBusesTable.appendChild(tr);
    });
}
