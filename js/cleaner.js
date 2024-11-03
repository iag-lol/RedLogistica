import { initializeGapiClient, loadSheetData, appendData, isUserAuthenticated, updateSheetData } from '../api/googleSheets.js';

// Función para reproducir sonido
function playSound(soundPath) {
    const audio = new Audio(soundPath);
    audio.play();
}

// Función para mostrar alerta flotante
function showAlert(type, title, message) {
    let icon, color, soundPath;

    switch (type) {
        case 'success':
            icon = 'success';
            color = '#28a745';
            soundPath = '/sounds/registro-exito.mp3';
            break;
        case 'info':
            icon = 'info';
            color = '#17a2b8';
            soundPath = '/sounds/nueva-tarea.mp3';
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
        timer: 3000,
        showConfirmButton: false,
        position: 'top-end',
        toast: true
    });

    if (soundPath) {
        playSound(soundPath);
    }
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

    // Confirmar que los elementos del modal existen antes de añadir eventos
    const closeModalBtn = document.getElementById("close-task-modal");
    const taskCompletedBtn = document.getElementById("task-completed-btn");

    if (closeModalBtn && taskCompletedBtn) {
        // Evento para cerrar ventana flotante de tarea
        closeModalBtn.addEventListener("click", () => {
            console.log("Cerrando modal de tarea.");
            document.getElementById("task-modal").style.display = "none";
        });

        // Evento de botón "REALIZADO" en ventana flotante
        taskCompletedBtn.addEventListener("click", async () => {
            const taskId = document.getElementById("task-modal").getAttribute("data-task-id");
            console.log(`Marcando tarea ${taskId} como completada.`);
            await markTaskAsCompleted(taskId);
            document.getElementById("task-modal").style.display = "none";
            showAlert('success', 'Tarea Realizada', 'La tarea ha sido marcada como realizada.');
            updateAssignedTasks(); // Actualizar la tabla de tareas asignadas
        });
    } else {
        console.warn("El modal o los botones de acción no se encontraron en el DOM.");
    }
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

    tasksTable.innerHTML = ""; 

    const userTasks = assignedTasks.filter(task => task[0] === currentUser);
    const newTaskIds = new Set(userTasks.map(task => task[1])); 

    userTasks.forEach(row => {
        const tr = document.createElement("tr");
        ["1", "2", "4"].forEach(i => {
            const td = document.createElement("td");
            td.textContent = row[i];
            tr.appendChild(td);
        });
        
        tr.addEventListener("click", () => openTaskModal(row[1]));
        tasksTable.appendChild(tr);
    });

    lastTaskIds = newTaskIds; 
}

function openTaskModal(taskId) {
    const modal = document.getElementById("task-modal");
    modal.setAttribute("data-task-id", taskId);
    modal.style.display = "block";
    console.log(`Abriendo modal para la tarea ${taskId}`);
}

async function markTaskAsCompleted(taskId) {
    const assignedTasks = await loadSheetData("aseo!A2:F");
    const taskIndex = assignedTasks.findIndex(task => task[1] === taskId);
    if (taskIndex !== -1) {
        const rowToDelete = `aseo!A${taskIndex + 2}:F${taskIndex + 2}`;
        await updateSheetData(rowToDelete, [["", "", "", "", "", ""]]); 
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