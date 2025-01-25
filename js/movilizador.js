/************************************************************
 * movilizador.js
 * Versión mejorada y potenciada, con comentarios y funciones
 * que se conectan a la API de Google Sheets para registrar
 * datos en la hoja "movilizador" desde B2 hacia abajo.
 ************************************************************/

import {
    initializeGapiClient,
    loadSheetData,
    appendData,
    updateSheetData,
    isUserAuthenticated
  } from '/RedLogistica/api/googleSheets.js';
  
  // Para evitar registrar tareas duplicadas:
  let lastAssignedIds = new Set();
  
  /**
   * ============ EVENTO PRINCIPAL ============
   * Se ejecuta cuando se carga el DOM
   */
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      console.log("Iniciando cliente de Google API para Movilizador...");
      await initializeGapiClient(); // Inicializa la API (solo se hace 1 vez)
  
      // 1. Verificar si el usuario está autenticado (token guardado)
      if (isUserAuthenticated()) {
        console.log("Usuario autenticado para Google Sheets.");
        updateConnectionStatus(true);
  
        // 2. Cargar datos iniciales
        await initializeMovilizadorData();
  
        // 3. Refrescar datos de manera periódica sin pedir token otra vez
        setInterval(async () => {
          await realTimeUpdate();
        }, 10000); // cada 10 segundos, por ejemplo
  
      } else {
        console.warn("No hay autenticación válida en Google Sheets.");
        updateConnectionStatus(false);
        alert("Fallo en autenticación: por favor revisa tus credenciales o la conexión.");
      }
  
      // 4. Manejar evento de envío de formulario para registrar una movilización
      const movilizadorForm = document.getElementById("movilizador-form");
      if (movilizadorForm) {
        movilizadorForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          await registerMovilizacion();
        });
      } else {
        console.warn("No se encontró el formulario con ID 'movilizador-form'.");
      }
  
      // 5. Forzar que el input PPU siempre esté en mayúsculas
      const ppuInput = document.getElementById("ppu");
      if (ppuInput) {
        ppuInput.addEventListener("input", () => {
          ppuInput.value = ppuInput.value.toUpperCase();
        });
      }
  
    } catch (error) {
      console.error("Error al iniciar la aplicación Movilizador:", error);
      alert("Error de inicialización (ver consola para detalles).");
    }
  });
  
  /* ===========================================================
   * FUNCIÓN: Actualiza el estado de Conexión en la Interfaz
   * Muestra si se está CONECTADO o DESCONECTADO en algún elemento.
   * =========================================================== */
  function updateConnectionStatus(isConnected) {
    const conexionSpan = document.getElementById("conexion-estado");
    const movilizadorSpan = document.getElementById("nombre-movilizador");
    const terminalSpan = document.getElementById("terminal");
  
    // Opcional: obtén valores guardados en localStorage
    const username = localStorage.getItem("username") || "Desconocido";
    const terminalName = localStorage.getItem("terminal") || "-";
  
    if (conexionSpan) {
      if (isConnected) {
        conexionSpan.textContent = "Conectado";
        conexionSpan.classList.add("connected");
        conexionSpan.classList.remove("disconnected");
      } else {
        conexionSpan.textContent = "Desconectado";
        conexionSpan.classList.remove("connected");
        conexionSpan.classList.add("disconnected");
      }
    }
  
    if (movilizadorSpan) {
      movilizadorSpan.textContent = username.toUpperCase();
    }
  
    if (terminalSpan) {
      terminalSpan.textContent = terminalName.toUpperCase();
    }
  }
  
  /* ===========================================================
   * FUNCIÓN: Inicializa la Data del Movilizador
   * Carga tablas, contadores, etc., una sola vez al inicio.
   * =========================================================== */
  async function initializeMovilizadorData() {
    // Cargar la tabla de “Tareas Asignadas”
    await loadAssignedTasks();
  
    // Cargar registros realizados
    await loadCompletedRecords();
  
    // Opcional: Inicializa gráficos, contadores, etc., si existiesen.
    updateCounts();
  }
  
  /* ===========================================================
   * FUNCIÓN: Refresca datos en “tiempo real” sin reautenticar
   * Puedes ajustar la lógica según tu necesidad
   * =========================================================== */
  async function realTimeUpdate() {
    console.log("RealTimeUpdate -> Cargando tablas y datos en segundo plano...");
    await loadAssignedTasks();
    await loadCompletedRecords();
    updateCounts();
  }
  
  /* ===========================================================
   * FUNCIÓN: Carga Tareas Asignadas desde la hoja “movilizador”
   * Rango de ejemplo: 'movilizador!H2:J' (tú ajustas columnas)
   * y las muestra en la tabla con ID 'tareas-asignadas-tabla'.
   * =========================================================== */
  async function loadAssignedTasks() {
    const tareasBody = document.getElementById("tareas-asignadas-tabla");
    if (!tareasBody) {
      console.warn("No se encontró la tabla 'tareas-asignadas-tabla'.");
      return;
    }
  
    // Llamada a la API para obtener datos (rango ejemplo: “H2:J”)
    // Ajusta según las columnas reales donde guardes "PPU - Tarea - Urgencia", etc.
    const tareasAsignadas = await loadSheetData("movilizador!H2:J") || [];
    console.log("Tareas Asignadas:", tareasAsignadas);
  
    // Creamos un set de IDs (por ejemplo, la PPU) para detectar si hay nuevas
    const newAssignedIds = new Set(tareasAsignadas.map(row => row[0]?.trim()));
  
    // Limpiar la tabla para volver a llenar
    tareasBody.innerHTML = "";
  
    // Llenar la tabla
    tareasAsignadas.forEach(row => {
      // row[0] => PPU
      // row[1] => Tarea
      // row[2] => Urgencia
      if (!row[0]) return;
  
      const ppu = row[0].trim().toUpperCase() || "N/A";
      const tarea = row[1] || "N/A";
      const urgencia = row[2] || "N/A";
  
      const tr = document.createElement("tr");
      [ppu, tarea, urgencia].forEach((valor) => {
        const td = document.createElement("td");
        td.textContent = valor;
        tr.appendChild(td);
      });
  
      tareasBody.appendChild(tr);
    });
  
    // Detectar si hay nuevas asignaciones
    if (newAssignedIds.size > lastAssignedIds.size) {
      alertNuevasTareas();
    }
    lastAssignedIds = newAssignedIds;
  }
  
  /* ===========================================================
   * FUNCIÓN: Muestra alerta de nuevas tareas asignadas
   * (puedes usar tu librería de notificaciones preferida)
   * =========================================================== */
  function alertNuevasTareas() {
    console.log("Nuevas tareas asignadas detectadas.");
    // Ejemplo de alerta:
    // Podrías usar SweetAlert2 o un toast. Aquí algo simple:
    alert("Tienes nuevas tareas asignadas.");
  }
  
  /* ===========================================================
   * FUNCIÓN: Carga Registros Realizados (Ej: 'movilizador!N2:R')
   * y los muestra en la tabla con ID 'registros-tabla'.
   * =========================================================== */
  async function loadCompletedRecords() {
    const registrosBody = document.getElementById("registros-tabla");
    if (!registrosBody) {
      console.warn("No se encontró la tabla 'registros-tabla'.");
      return;
    }
  
    // Ajusta el rango a la sección donde guardas los registros realizados
    // Ejemplo: "movilizador!N2:R" con las columnas PPU, Movilizador, Tarea, Fecha, Hora
    const registros = await loadSheetData("movilizador!N2:R") || [];
    console.log("Registros Realizados:", registros);
  
    // Limpiar la tabla
    registrosBody.innerHTML = "";
  
    registros.forEach(row => {
      // row[0] = PPU
      // row[1] = Movilizador
      // row[2] = Tarea
      // row[3] = Fecha
      // row[4] = Hora
      const ppu = row[0]?.trim().toUpperCase() || "N/A";
      const movilizador = row[1]?.trim() || "N/A";
      const tarea = row[2]?.trim() || "N/A";
      const fecha = row[3] || "N/A";
      const hora = row[4] || "N/A";
  
      const tr = document.createElement("tr");
      [ppu, movilizador, tarea, fecha, hora].forEach(valor => {
        const td = document.createElement("td");
        td.textContent = valor;
        tr.appendChild(td);
      });
  
      registrosBody.appendChild(tr);
    });
  }
  
  /* ===========================================================
   * FUNCIÓN: Registra una nueva Movilización en la hoja
   * Usando las columnas: B (PPU), C (Movilizador), D (Tarea),
   * E (Observación), F (Fecha+Hora). Ajusta a tu gusto.
   * =========================================================== */
  async function registerMovilizacion() {
    try {
      // 1. Tomar valores del formulario
      const ppuInput = document.getElementById("ppu");
      const tareaSelect = document.getElementById("tarea");
      const obsTextarea = document.getElementById("observacion");
      const fechaInput = document.getElementById("fecha");
  
      if (!ppuInput.value || !tareaSelect.value || !fechaInput.value) {
        alert("Por favor, completa todos los campos requeridos.");
        return;
      }
  
      // 2. Obtener el nombre del usuario (movilizador) guardado
      const userName = localStorage.getItem("username") || "SIN-NOMBRE";
      const movilizadorName = userName.trim().toUpperCase();
  
      // 3. Formatear fecha y hora
      //    El input type=datetime-local retorna algo como "YYYY-MM-DDTHH:MM"
      //    Podemos separarlo y guardarlo como "DD-MM-YYYY HH:MM"
      const dateTimeValue = fechaInput.value; // 2025-01-25T15:45
      const [fecha, hora] = dateTimeValue.split("T"); // ["2025-01-25", "15:45"]
      const [yyyy, mm, dd] = fecha.split("-");
      const fechaFormateada = `${dd}-${mm}-${yyyy}`;
      const horaFormateada = hora || "00:00";
  
      // 4. Armar la fila para Google Sheets
      //    B = PPU, C = Movilizador, D = Tarea, E = Observación, F = Fecha+Hora
      const nuevaFila = [
        ppuInput.value.trim().toUpperCase(),
        movilizadorName,
        tareaSelect.value.trim(),
        obsTextarea.value.trim() || "-",
        `${fechaFormateada} ${horaFormateada}`
      ];
  
      // 5. Guardar la fila en la Hoja (movilizador!B2:F)
      await appendData("movilizador!B2:F", [nuevaFila]);
  
      // 6. Confirmación visual
      console.log("Registro de Movilización exitoso:", nuevaFila);
      alert("¡Registro de Movilización guardado con éxito!");
  
      // 7. Limpiar el formulario
      ppuInput.value = "";
      tareaSelect.selectedIndex = 0;
      obsTextarea.value = "";
      fechaInput.value = "";
  
      // 8. Refrescar tablas para ver los cambios en tiempo real
      await loadAssignedTasks();
      await loadCompletedRecords();
      updateCounts();
  
    } catch (error) {
      console.error("Error registrando Movilización:", error);
      alert("Ocurrió un error al registrar la Movilización. Ver consola para más detalles.");
    }
  }
  
  /* ===========================================================
   * FUNCIÓN: Actualiza contadores (Tareas vs. Registros)
   * Basado en el número de filas en cada tabla.
   * =========================================================== */
  function updateCounts() {
    const tareasBody = document.getElementById("tareas-asignadas-tabla");
    const registrosBody = document.getElementById("registros-tabla");
  
    const tareasCount = document.getElementById("contador-tareas-asignadas");
    const trabajosCount = document.getElementById("contador-trabajos-hechos");
  
    if (tareasBody && tareasCount) {
      tareasCount.textContent = tareasBody.rows.length;
    }
    if (registrosBody && trabajosCount) {
      trabajosCount.textContent = registrosBody.rows.length;
    }
  }
  