import { initializeGapiClient, loadSheetData, updateSheetData } from '../api/googleSheets.js';

let username = '';
let password = '';
let userRole = ''; // Para almacenar el rol del usuario después de la autenticación

// Inicializa Google API cuando se carga la página
document.addEventListener('DOMContentLoaded', async () => {
    await initializeGapiClient();  // Inicializa Google Sheets API y autentica automáticamente
    document.getElementById('login-form').addEventListener('submit', handleLogin);
});

// Manejar el inicio de sesión
async function handleLogin(event) {
    event.preventDefault();

    username = document.getElementById('username').value;
    password = document.getElementById('password').value;

    // Cargar las credenciales desde Google Sheets
    const credentials = await loadSheetData('credenciales!A2:E');

    // Verifica si las credenciales coinciden
    const userIndex = credentials.findIndex(row => row[0] === username && row[1] === password);

    if (userIndex !== -1) {
        // Si las credenciales son correctas, guarda el usuario en localStorage
        localStorage.setItem('username', username); // Guardamos el nombre de usuario en localStorage

        // Actualiza el estado y obtiene el rol del usuario
        const rowToUpdateConnection = `credenciales!D${userIndex + 2}`;  // Actualiza "CONECTADO"
        const rowToUpdateLastLogin = `credenciales!E${userIndex + 2}`;    // Actualiza "Última conexión"
        const currentDateTime = new Date().toLocaleString('es-ES');      // Fecha y hora actual

        // Cambia el estado a "CONECTADO" y registra la última conexión
        await updateSheetData(rowToUpdateConnection, [['CONECTADO']]);
        await updateSheetData(rowToUpdateLastLogin, [[currentDateTime]]);

        // Obtiene el rol del usuario desde la columna C
        userRole = credentials[userIndex][2];

        // Redirige al usuario según su rol
        redirectToRolePage(userRole);
    } else {
        alert('Usuario o contraseña incorrectos');
    }
}

function redirectToRolePage(role) {
    const baseUrl = 'https://iag-lol.github.io/RedLogistica/roles/';
    switch (role) {
        case 'Supervisor':
            window.location.href = `${baseUrl}supervisor.html`;
            break;
        case 'Planillero':
            window.location.href = `${baseUrl}planillero.html`;
            break;
        case 'Cleaner':
            window.location.href = `${baseUrl}cleaner.html`;
            break;
        case 'Movilizador':
            window.location.href = `${baseUrl}movilizador.html`;
            break;
        case 'Bodega': 
            window.location.href = `${baseUrl}bodega.html`;
            break;
        default:
            alert('Rol no reconocido');
            break;
    }
}

// Llama a la función de redirección con el rol almacenado en localStorage
document.addEventListener("DOMContentLoaded", function () {
    const role = localStorage.getItem('role');
    if (role) {
        redirectToRolePage(role);
    } else {
        console.warn('No se encontró rol en localStorage');
    }
});

// Cierra sesión y actualiza el estado en Google Sheets
export async function handleLogout() {
    const credentials = await loadSheetData('credenciales!A2:D');
    const userIndex = credentials.findIndex(row => row[0] === username);

    if (userIndex !== -1) {
        const rowToUpdate = `credenciales!D${userIndex + 2}`;
        await updateSheetData(rowToUpdate, [['DESCONECTADO']]);
        alert('Sesión cerrada');
    }

    // Limpiar el nombre de usuario en localStorage
    localStorage.removeItem('username'); // Removemos el usuario de localStorage al cerrar sesión
    window.location.href = "/login.html"; // Redirigir al usuario a la página de inicio de sesión
}
