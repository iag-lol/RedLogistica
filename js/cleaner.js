import { initializeGapiClient, loadSheetData, appendData, isUserAuthenticated, updateSheetData } from '../api/googleSheets.js';

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
        toast: true
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
        alert("No se pudo autenticar con Google Sheets");
    }

    document.getElementById("register-aseo-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        await registerAseo();
    });

    document.getElementById("pending-buses-btn").addEventListener("click", () => {
        document.getElementById("pending-buses-modal").style.display = "block";
        loadPendingBuses();
    });

    document.getElementById("close-modal").addEventListener("click", () => {
        document.getElementById("pending-buses-modal").style.display = "none";
    });
});

async function initializeData() {
    await loadAssignedTasks();
    await loadCompletedRecords();
}

// Función para verificar el estado de conexión y actualizar visualmente
function checkConnectionStatus() {
    const statusElement = document.getElementById('connection-status');
    const usernameElement = document.getElementById('username-display');
    
    if (isUserAuthenticated()) {
        statusElement.textContent = 'CONECTADO';
        statusElement.style.color = 'green';
        statusElement.classList.add('connected');
    } else {
        statusElement.textContent = 'DESCONECTADO';
        statusElement.style.color = 'red';
        statusElement.classList.remove('connected');
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
            ["1", "2", "4"].forEach(i => { // PPU BUS, Tarea, Fecha Límite
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
        const taskId = row.cells[0].textContent;
        if (!newTaskIds.has(taskId)) {
            row.remove();
        }
    });

    lastTaskIds = newTaskIds;
}

// Abrir modal de tarea realizada
function openTaskModal(task) {
    Swal.fire({
        title: 'Confirmación de Tarea',
        text: `¿Marcar la tarea "${task[2]}" como realizada?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Realizado',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#28a745',
        cancelButtonColor: '#dc3545'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await deleteTask(task[1]); // Borrar la tarea de Google Sheets usando el ID
            showAlert('success', 'Tarea Realizada', 'La tarea ha sido marcada como realizada.');
            loadAssignedTasks(); // Recargar la tabla
        }
    });
}

// Borrar tarea de Google Sheets
async function deleteTask(taskId) {
    const assignedTasks = await loadSheetData("aseo!A2:F");
    const rowIndex = assignedTasks.findIndex(row => row[1] === taskId) + 2;
    if (rowIndex > 1) {
        const range = `aseo!A${rowIndex}:F${rowIndex}`;
        await updateSheetData(range, [['', '', '', '', '', '']]);
    }
}

// Actualizar tareas
async function updateAssignedTasks() {
    await loadAssignedTasks();
}

// Registrar el aseo y limpiar el campo `bus-id`
async function registerAseo() {
    const busIdInput = document.getElementById("bus-id");
    const aseoType = document.getElementById("aseo-type").value;
    
    // Configuración de fecha y hora en formato 24 horas (sin "a.m." o "p.m.")
    const date = new Intl.DateTimeFormat('es-ES', {
        dateStyle: 'short',
        timeStyle: 'medium',
        hour12: false // Formato 24 horas
    }).format(new Date());

    const values = [[busIdInput.value, localStorage.getItem("username"), aseoType, date]];
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

async function loadCompletedRecords() {
    const recordsTable = document.getElementById("completed-records-table").querySelector("tbody");
    recordsTable.innerHTML = "";

    const recordsData = await loadSheetData("aseo!I2:L");
    const currentUser = localStorage.getItem("username");

    recordsData.filter(record => record[1] === currentUser).forEach(row => {
        const tr = document.createElement("tr");
        row.forEach(cellData => {
            const td = document.createElement("td");
            td.textContent = cellData;
            tr.appendChild(td);
        });
        recordsTable.appendChild(tr);
    });
}

async function loadPendingBuses() {
    const pendingBusesTable = document.getElementById("pending-buses-table").querySelector("tbody");
    pendingBusesTable.innerHTML = "";

    const pendingBusesData = await loadSheetData("cleaner!A2:C");
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
