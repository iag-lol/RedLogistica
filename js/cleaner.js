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
    } else {
        connectionStatus.textContent = 'DESCONECTADO';
        connectionStatus.classList.remove('connected');
        alert("No se pudo autenticar con Google Sheets");
    }

    document.getElementById("register-aseo-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        await registerAseo();
        e.target.reset();
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

let lastTaskIds = new Set();

async function loadAssignedTasks() {
    const tasksTable = document.getElementById("assigned-tasks-table").querySelector("tbody");
    const assignedTasks = await loadSheetData("aseo!A2:F");
    const currentUser = localStorage.getItem("username");

    const userTasks = assignedTasks.filter(task => task[0] === currentUser);
    const newTaskIds = new Set(userTasks.map(task => task[1])); // IDs actuales de tareas

    // Comprobar si hay tareas nuevas sin borrar todas las filas
    userTasks.forEach(task => {
        if (!lastTaskIds.has(task[1])) {
            const tr = document.createElement("tr");
            ["1", "2", "4"].forEach(i => { // PPU BUS, Tarea, Fecha Límite
                const td = document.createElement("td");
                td.textContent = task[i];
                tr.appendChild(td);
            });
            // Agregar evento para abrir modal de confirmación
            tr.addEventListener("click", () => openTaskModal(task));
            tasksTable.appendChild(tr);
            showPersistentAlert('info', 'Nueva Asignación', 'Tienes nuevas tareas asignadas.');
        }
    });

    // Eliminar las filas de tareas que ya no están en la hoja
    Array.from(tasksTable.rows).forEach(row => {
        const taskId = row.cells[0].textContent; // Obtener ID de la fila actual
        if (!newTaskIds.has(taskId)) {
            row.remove(); // Eliminar fila si ya no existe en los datos actuales
        }
    });

    lastTaskIds = newTaskIds; // Actualizar IDs de tareas
}

// Función para abrir el modal de confirmación de tarea realizada
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

// Función para eliminar la tarea de la hoja de Google Sheets
async function deleteTask(taskId) {
    const assignedTasks = await loadSheetData("aseo!A2:F");
    const rowIndex = assignedTasks.findIndex(row => row[1] === taskId) + 2; // Obtener el índice de la fila
    if (rowIndex > 1) {
        const range = `aseo!A${rowIndex}:F${rowIndex}`;
        await updateSheetData(range, [['', '', '', '', '', '']]); // Limpiar la fila específica
    }
}

async function updateAssignedTasks() {
    await loadAssignedTasks();
}

async function registerAseo() {
    const busId = document.getElementById("bus-id").value;
    const aseoType = document.getElementById("aseo-type").value;
    const date = document.getElementById("date").value;

    const values = [[busId, localStorage.getItem("username"), aseoType, date]];
    await appendData("aseo!I2:L", values);
    loadCompletedRecords();

    showAlert('success', 'Registro exitoso', 'Se ha registrado el aseo correctamente.');
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