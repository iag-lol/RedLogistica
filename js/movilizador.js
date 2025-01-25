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
    isUserAuthenticated
  } from '/RedLogistica/api/googleSheets.js';
  
  // Variables globales
  let lastAssignedIds = new Set();
  let flotaPPUCache = [];
  
  /**
   * ============ EVENTO PRINCIPAL ============
   * Se ejecuta cuando se carga el DOM
   */
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      console.log("Iniciando cliente de Google API para Movilizador...");
      await initializeGapiClient(); // Inicializa la API
  
      // Verificar si el usuario está autenticado
      if (isUserAuthenticated()) {
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
      flotaPPUCache = await loadSheetData("flota!B2:B") || [];
      console.log("PPUs precargadas:", flotaPPUCache);
  
      if (ppuInput && flotaPPUCache.length) {
        const datalist = document.createElement("datalist");
        datalist.id = "ppu-options";
  
        flotaPPUCache.forEach(row => {
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
  
      await appendData("movilizador!B2:F", [nuevaFila]);
  
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
  
  /* ===========================================================
   * FUNCIÓN: Refresca datos en tiempo real
   * =========================================================== */
  async function realTimeUpdate() {
    console.log("Actualizando datos en tiempo real...");
    await loadAssignedTasks();
    await loadCompletedRecords();
    updateCounts();
  }
  
  /* ===========================================================
   * FUNCIÓN: Actualizar contadores
   * =========================================================== */
  function updateCounts() {
    const tareasBody = document.getElementById("tareas-asignadas-tabla");
    const registrosBody = document.getElementById("registros-tabla");
    const tareasCount = document.getElementById("contador-tareas-asignadas");
    const trabajosCount = document.getElementById("contador-trabajos-hechos");
  
    if (tareasBody && tareasCount) tareasCount.textContent = tareasBody.rows.length;
    if (registrosBody && trabajosCount) trabajosCount.textContent = registrosBody.rows.length;
  }
  