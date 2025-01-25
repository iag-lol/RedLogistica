/************************************************************
 * movilizador.js
 * Versión mejorada y potenciada, con comentarios y funciones
 * que se conectan a la API de Google Sheets para registrar
 * datos en la hoja "movilizador" desde B2 hacia abajo.
 ************************************************************/

// Carga de bibliotecas de Google y su inicialización correcta
async function initializeGapiClient() {
    try {
        console.log("Cargando la API de Google...");
        await new Promise((resolve, reject) => {
            gapi.load("client:auth2", async () => {
                try {
                    await gapi.client.init({
                        apiKey: "AIzaSyDwUO5PpwoNbVbWfKViTEQO8Lnpkl12D5c",
                        clientId: "749139679919-3bc57iab4hj1qv7uh6r7s9tn6lp8r389.apps.googleusercontent.com",
                        discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"],
                        scope: "https://www.googleapis.com/auth/spreadsheets"
                    });
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
        console.log("API de Google inicializada correctamente.");
    } catch (error) {
        console.error("Error al inicializar la API de Google:", error);
        throw new Error("Las bibliotecas de Google no están cargadas completamente.");
    }
}

/**
 * Se ejecuta cuando se carga el DOM
 */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    console.log("Iniciando cliente de Google API para Movilizador...");
    await initializeGapiClient(); // Inicializa la API

    if (typeof gapi === "undefined") {
      console.error("La API de Google no está disponible. Verifica la carga del script de Google.");
      return;
    }

    // Verificar si el usuario está autenticado
    const isUserAuthenticated = gapi.auth2.getAuthInstance().isSignedIn.get();
    if (isUserAuthenticated) {
      console.log("Usuario autenticado para Google Sheets.");
      updateConnectionStatus(true);
      await initializeMovilizadorData();

      // Refrescar datos periódicamente
      setInterval(async () => {
        await realTimeUpdate();
      }, 10000);
    } else {
      console.warn("No hay autenticación válida en Google Sheets.");
      updateConnectionStatus(false);
      showAlert("Fallo en autenticación", "Por favor revisa tus credenciales o la conexión.", "error");
    }

    // Configurar eventos del formulario
    const movilizadorForm = document.getElementById("movilizador-form");
    if (movilizadorForm) {
      movilizadorForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        await registerMovilizacion();
      });
    }

    // Autorrellenar el campo PPU según los datos de la hoja "flota"
    const ppuInput = document.getElementById("ppu");
    if (ppuInput) {
      ppuInput.addEventListener("input", () => {
        ppuInput.value = ppuInput.value.toUpperCase();
      });

      await preloadFlotaPPUs(ppuInput);
    }
  } catch (error) {
    console.error("Error al iniciar la aplicación Movilizador:", error);
    showAlert("Error de inicialización", "Revisa la consola para más detalles.", "error");
  }
});

/* ===========================================================
 * FUNCIÓN: Mostrar Alertas Estilizadas
 * =========================================================== */
function showAlert(title, message, type = "info") {
  const alertContainer = document.getElementById("alert-container");
  if (!alertContainer) return;

  const alertDiv = document.createElement("div");
  alertDiv.className = `alert alert-${type}`;
  alertDiv.innerHTML = `<strong>${title}</strong>: ${message}`;

  alertContainer.appendChild(alertDiv);
  setTimeout(() => alertDiv.remove(), 5000); // Desaparecer en 5 segundos
}

/* ===========================================================
 * FUNCIÓN: Actualiza el estado de Conexión en la Interfaz
 * =========================================================== */
function updateConnectionStatus(isConnected) {
  const conexionSpan = document.getElementById("conexion-estado");
  const movilizadorSpan = document.getElementById("nombre-movilizador");
  const terminalSpan = document.getElementById("terminal");

  const username = localStorage.getItem("username") || "Desconocido";
  const terminalName = localStorage.getItem("terminal") || "-";

  if (conexionSpan) {
    conexionSpan.textContent = isConnected ? "Conectado" : "Desconectado";
    conexionSpan.className = isConnected ? "connected" : "disconnected";
  }
  if (movilizadorSpan) movilizadorSpan.textContent = username.toUpperCase();
  if (terminalSpan) terminalSpan.textContent = terminalName.toUpperCase();
}

/* ===========================================================
 * FUNCIÓN: Inicializa la Data del Movilizador
 * =========================================================== */
async function initializeMovilizadorData() {
  await preloadFlotaPPUs(); // Precargar datos de "flota"
  await loadAssignedTasks(); // Cargar tareas asignadas
  await loadCompletedRecords(); // Cargar registros realizados
  updateCounts();
}

/* ===========================================================
 * FUNCIÓN: Precachear PPUs desde la hoja "flota"
 * =========================================================== */
async function preloadFlotaPPUs(ppuInput) {
  try {
    console.log("Cargando PPUs desde la hoja 'flota'...");
    const flotaPPUCache = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: "1jzTdEoshxRpuf9kHXI5vQLRtoCsSA-Uw-48JX8LxXaU",
      range: "flota!B2:B"
    });
    const values = flotaPPUCache.result.values || [];
    console.log("PPUs precargadas:", values);

    if (ppuInput && values.length) {
      const datalist = document.createElement("datalist");
      datalist.id = "ppu-options";

      values.forEach(row => {
        const option = document.createElement("option");
        option.value = row[0]?.trim().toUpperCase();
        datalist.appendChild(option);
      });

      document.body.appendChild(datalist);
      ppuInput.setAttribute("list", "ppu-options");
    }
  } catch (error) {
    console.error("Error al precargar PPUs:", error);
  }
}

/* ===========================================================
 * FUNCIÓN: Registrar Movilización
 * =========================================================== */
async function registerMovilizacion() {
  try {
    const ppuInput = document.getElementById("ppu");
    const tareaSelect = document.getElementById("tarea");
    const obsTextarea = document.getElementById("observacion");
    const fechaInput = document.getElementById("fecha");

    if (!ppuInput.value || !tareaSelect.value || !fechaInput.value) {
      showAlert("Formulario incompleto", "Por favor, completa todos los campos requeridos.", "warning");
      return;
    }

    const username = localStorage.getItem("username") || "SIN-NOMBRE";
    const dateTimeValue = fechaInput.value;
    const [fecha, hora] = dateTimeValue.split("T");
    const [yyyy, mm, dd] = fecha.split("-");
    const fechaFormateada = `${dd}-${mm}-${yyyy}`;
    const horaFormateada = hora || "00:00";

    const nuevaFila = [
      ppuInput.value.trim().toUpperCase(),
      username.trim().toUpperCase(),
      tareaSelect.value.trim(),
      obsTextarea.value.trim() || "-",
      `${fechaFormateada} ${horaFormateada}`
    ];

    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: "1jzTdEoshxRpuf9kHXI5vQLRtoCsSA-Uw-48JX8LxXaU",
      range: "movilizador!B2:F",
      valueInputOption: "RAW",
      resource: { values: [nuevaFila] }
    });

    showAlert("Registro exitoso", "La movilización se registró correctamente.", "success");

    // Actualizar tablas y contadores
    await loadAssignedTasks();
    await loadCompletedRecords();
    updateCounts();

    // Limpiar el formulario
    ppuInput.value = "";
    tareaSelect.selectedIndex = 0;
    obsTextarea.value = "";
    fechaInput.value = "";
  } catch (error) {
    console.error("Error registrando movilización:", error);
    showAlert("Error al registrar", "Ocurrió un problema al guardar los datos.", "error");
  }
}
