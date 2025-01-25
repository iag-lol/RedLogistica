
// Inicializar cliente de Google API
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
        throw new Error("No se pudo cargar las bibliotecas de Google correctamente.");
    }
}

// Manejo del evento DOMContentLoaded
document.addEventListener("DOMContentLoaded", async () => {
    try {
        console.log("Iniciando cliente de Google API para Movilizador...");
        await initializeGapiClient();

        if (typeof gapi === "undefined") {
            console.error("La API de Google no está disponible. Verifica la carga del script.");
            return;
        }

        const authInstance = gapi.auth2.getAuthInstance();
        if (authInstance && authInstance.isSignedIn.get()) {
            console.log("Usuario autenticado.");
            updateConnectionStatus(true);
            await initializeMovilizadorData();

            setInterval(async () => {
                await realTimeUpdate();
            }, 10000);
        } else {
            console.warn("No hay autenticación válida.");
            updateConnectionStatus(false);
            showAlert("Error de autenticación", "Por favor revisa tus credenciales.", "error");
        }

        const movilizadorForm = document.getElementById("movilizador-form");
        if (movilizadorForm) {
            movilizadorForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                await registerMovilizacion();
            });
        }

        const ppuInput = document.getElementById("ppu");
        if (ppuInput) {
            ppuInput.addEventListener("input", () => {
                ppuInput.value = ppuInput.value.toUpperCase();
            });
            await preloadFlotaPPUs(ppuInput);
        }
    } catch (error) {
        console.error("Error al iniciar la aplicación Movilizador:", error);
        showAlert("Error crítico", "Revisa la consola para más detalles.", "error");
    }
});

// Mostrar alertas estilizadas
function showAlert(title, message, type = "info") {
    const alertContainer = document.getElementById("alert-container");
    if (!alertContainer) return;

    const alertDiv = document.createElement("div");
    alertDiv.className = `alert alert-${type}`;
    alertDiv.innerHTML = `<strong>${title}</strong>: ${message}`;

    alertContainer.appendChild(alertDiv);
    setTimeout(() => alertDiv.remove(), 5000);
}

// Actualizar estado de conexión
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

// Inicializar datos del movilizador
async function initializeMovilizadorData() {
    await preloadFlotaPPUs();
    await loadAssignedTasks();
    await loadCompletedRecords();
    updateCounts();
}

// Precachear PPUs desde la hoja "flota"
async function preloadFlotaPPUs(ppuInput) {
    try {
        const flotaPPUCache = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: "1jzTdEoshxRpuf9kHXI5vQLRtoCsSA-Uw-48JX8LxXaU",
            range: "flota!B2:B"
        });

        const values = flotaPPUCache.result.values || [];
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

// Registrar movilización
async function registerMovilizacion() {
    try {
        const ppuInput = document.getElementById("ppu");
        const tareaSelect = document.getElementById("tarea");
        const obsTextarea = document.getElementById("observacion");
        const fechaInput = document.getElementById("fecha");

        if (!ppuInput.value || !tareaSelect.value || !fechaInput.value) {
            showAlert("Formulario incompleto", "Por favor completa todos los campos requeridos.", "warning");
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

        await loadAssignedTasks();
        await loadCompletedRecords();
        updateCounts();

        ppuInput.value = "";
        tareaSelect.selectedIndex = 0;
        obsTextarea.value = "";
        fechaInput.value = "";
    } catch (error) {
        console.error("Error registrando movilización:", error);
        showAlert("Error al registrar", "No se pudo guardar los datos.", "error");
    }
}

// Cargar tareas asignadas
async function loadAssignedTasks() {
    const tareasBody = document.getElementById("tareas-asignadas-tabla");
    if (!tareasBody) {
        console.warn("No se encontró la tabla 'tareas-asignadas-tabla'.");
        return;
    }

    try {
        const tareasAsignadas = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: "1jzTdEoshxRpuf9kHXI5vQLRtoCsSA-Uw-48JX8LxXaU",
            range: "movilizador!H2:J"
        });

        const values = tareasAsignadas.result.values || [];
        tareasBody.innerHTML = "";

        values.forEach(row => {
            const tr = document.createElement("tr");
            row.forEach(valor => {
                const td = document.createElement("td");
                td.textContent = valor || "-";
                tr.appendChild(td);
            });
            tareasBody.appendChild(tr);
        });
    } catch (error) {
        console.error("Error al cargar tareas asignadas:", error);
    }
}

// Cargar registros realizados
async function loadCompletedRecords() {
    const registrosBody = document.getElementById("registros-tabla");
    if (!registrosBody) {
        console.warn("No se encontró la tabla 'registros-tabla'.");
        return;
    }

    try {
        const registros = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: "1jzTdEoshxRpuf9kHXI5vQLRtoCsSA-Uw-48JX8LxXaU",
            range: "movilizador!N2:R"
        });

        const values = registros.result.values || [];
        registrosBody.innerHTML = "";

        values.forEach(row => {
            const tr = document.createElement("tr");
            row.forEach(valor => {
                const td = document.createElement("td");
                td.textContent = valor || "-";
                tr.appendChild(td);
            });
            registrosBody.appendChild(tr);
        });
    } catch (error) {
        console.error("Error al cargar registros realizados:", error);
    }
}

// Actualizar contadores
function updateCounts() {
    const tareasBody = document.getElementById("tareas-asignadas-tabla");
    const registrosBody = document.getElementById("registros-tabla");
    const tareasCount = document.getElementById("contador-tareas-asignadas");
    const trabajosCount = document.getElementById("contador-trabajos-hechos");

    if (tareasBody && tareasCount) tareasCount.textContent = tareasBody.rows.length;
    if (registrosBody && trabajosCount) trabajosCount.textContent = registrosBody.rows.length;
}
