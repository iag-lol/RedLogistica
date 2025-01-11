// cleaner.js

import {
    initializeGapiClient,
    loadSheetData,
    appendData,
    updateSheetData,
    isUserAuthenticated
  } from '/RedLogistica/api/googleSheets.js';
  
  // Controlar datos existentes para evitar duplicados o borrado completo
  let lastTaskIds = new Set();
  let lastCompletedIds = new Set();
  let lastPendingBusIds = new Set();
  
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      console.log("Inicializando GAPI Client...");
      await initializeGapiClient();
  
      if (isUserAuthenticated()) {
        console.log("Usuario autenticado con Google Sheets.");
        updateConnectionStatus(true);
  
        // Cargar datos y configurar la plataforma
        await initializeCleanerData();
  
        // Intervalo de actualización cada 5s
        setInterval(updateAllChartsAndCounters, 5000);
      } else {
        console.warn("No se pudo autenticar con Google Sheets.");
        updateConnectionStatus(false);
        alert('Fallo en autenticación. Revisa credenciales o conexión.');
      }
  
      // Manejador para el formulario de Aseo
      const registerForm = document.getElementById("register-aseo-form");
      registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        await registerAseo();
      });
  
      // **(1) Forzar PPU en mayúscula mientras se escribe**
      const busIdInput = document.getElementById("bus-id");
      if (busIdInput) {
        busIdInput.addEventListener("input", () => {
          busIdInput.value = busIdInput.value.toUpperCase();
        });
      }
  
      // Botón para ver buses pendientes
      const pendingBusesBtn = document.getElementById("pending-buses-btn");
      pendingBusesBtn.addEventListener("click", openPendingBusesModal);
  
      // Cerrar el modal de buses pendientes
      const closeModalBtn = document.getElementById("close-modal");
      closeModalBtn.addEventListener("click", closePendingBusesModal);
  
      // Cerrar modal si se hace clic fuera
      window.addEventListener("click", (event) => {
        const modal = document.getElementById("pending-buses-modal");
        if (event.target === modal) {
          closePendingBusesModal();
        }
      });
  
    } catch (error) {
      console.error("Error al inicializar la aplicación:", error);
      alert("Error al inicializar. Verifica la consola para más detalles.");
    }
  });
  
  /**
   * Actualiza el estado de conexión (CONECTADO / DESCONECTADO)
   */
  function updateConnectionStatus(connected) {
    const connectionStatus = document.getElementById("connection-status");
    const usernameDisplay = document.getElementById("username-display");
    const username = localStorage.getItem("username") || "USUARIO DESCONOCIDO";
  
    if (connected) {
      connectionStatus.textContent = "CONECTADO";
      connectionStatus.classList.add("connected");
      connectionStatus.classList.remove("disconnected");
    } else {
      connectionStatus.textContent = "DESCONECTADO";
      connectionStatus.classList.remove("connected");
      connectionStatus.classList.add("disconnected");
    }
  
    usernameDisplay.textContent = username.toUpperCase();
  }
  
  /**
   * Inicializa datos y configuración principal
   */
  async function initializeCleanerData() {
    await loadAssignedTasks();
    await loadCompletedRecords();
    initializeChartsAndCounters();
    initializePagination();
    setupTableObservers();
  }
  
  /**
   * Carga Tareas Asignadas desde aseo!A2:F sin vaciar toda la tabla
   */
  async function loadAssignedTasks() {
    const tasksTableBody = document.getElementById("assigned-tasks-table")?.querySelector("tbody");
    if (!tasksTableBody) {
      console.warn("No existe la tabla de tareas asignadas (assigned-tasks-table).");
      return;
    }
  
    const assignedTasks = await loadSheetData("aseo!A2:F") || [];
    console.log("Tareas asignadas:", assignedTasks);
  
    const currentUser = localStorage.getItem("username");
    if (!currentUser) {
      console.warn("No se encontró username en localStorage.");
      return;
    }
  
    // Filtrar solo tareas del usuario actual
    const userTasks = assignedTasks.filter(task => {
      if (!task[0]) return false;
      return task[0].trim().toUpperCase() === currentUser.trim().toUpperCase();
    });
  
    const newTaskIds = new Set(userTasks.map(t => t[1]));
  
    // Agregar SOLO nuevas tareas
    userTasks.forEach(task => {
      const taskId = task[1];
      if (!lastTaskIds.has(taskId)) {
        const tr = document.createElement("tr");
        // Se asume: task[1] => PPU, task[2] => Tarea, task[3] => Fecha Límite
        const ppu = task[1] ? task[1].trim().toUpperCase() : "N/A";
        const tarea = task[2] || "N/A";
        const fecha = task[3] || "N/A";
  
        [ppu, tarea, fecha].forEach(val => {
          const td = document.createElement("td");
          td.textContent = val;
          tr.appendChild(td);
        });
  
        tasksTableBody.appendChild(tr);
      }
    });
  
    lastTaskIds = newTaskIds;
  
    updateCounts();
    updateTaskChart();
  }
  
  /**
   * Carga Registros Completados desde aseo!I2:L
   */
  async function loadCompletedRecords() {
    const recordsTableBody = document.getElementById("completed-records-table")?.querySelector("tbody");
    if (!recordsTableBody) {
      console.warn("No existe la tabla de registros completados (completed-records-table).");
      return;
    }
  
    const completedRecords = await loadSheetData("aseo!I2:L") || [];
    console.log("Registros completados:", completedRecords);
  
    const currentUser = localStorage.getItem("username");
    if (!currentUser) {
      console.warn("No se encontró username en localStorage.");
      return;
    }
  
    const userCompleted = completedRecords.filter(r => {
      if (!r[1]) return false; // r[1] => Cleaner
      return r[1].trim().toUpperCase() === currentUser.trim().toUpperCase();
    });
  
    const newCompleted = new Set(userCompleted.map(r => r[1]));
  
    userCompleted.forEach(row => {
      const completedId = row[1];
      if (!lastCompletedIds.has(completedId)) {
        const tr = document.createElement("tr");
        // row[0] = PPU, row[1] = Cleaner, row[2] = Aseo, row[3] = Fecha
        const ppu = row[0] ? row[0].trim().toUpperCase() : "N/A";
        const cleaner = row[1] ? row[1].trim().toUpperCase() : "N/A";
        const aseo = row[2] ? row[2].trim() : "N/A";
        const fecha = row[3] ? row[3].trim() : "N/A";
  
        [ppu, cleaner, aseo, fecha].forEach(val => {
          const td = document.createElement("td");
          td.textContent = val;
          tr.appendChild(td);
        });
  
        recordsTableBody.appendChild(tr);
      }
    });
  
    lastCompletedIds = newCompleted;
  
    updateCounts();
    updateAttendanceChart();
    updateAseadoresChart();
  }
  
  /**
   * Registra un nuevo Aseo en aseo!I2:L
   */
  async function registerAseo() {
    const busIdInput = document.getElementById("bus-id");
    const aseoType = document.getElementById("aseo-type").value;
    const dateValue = document.getElementById("date").value;
  
    if (!busIdInput?.value || !aseoType || !dateValue) {
      Swal.fire({
        icon: 'warning',
        title: 'Campos Incompletos',
        text: 'Completa todos los campos antes de registrar el aseo.'
      });
      return;
    }
  
    const currentUser = localStorage.getItem("username");
    if (!currentUser) {
      Swal.fire({
        icon: 'error',
        title: 'Error de Usuario',
        text: 'No se encontró el usuario. Reintenta iniciar sesión.'
      });
      return;
    }
  
    // Insertamos en la hoja: [PPU BUS, CLEANER, ASEO, FECHA]
    const values = [[
      busIdInput.value.trim().toUpperCase(),
      currentUser.trim().toUpperCase(),
      aseoType.trim(),
      dateValue.trim()
    ]];
  
    await appendData("aseo!I2:L", values);
    console.log("Aseo registrado:", values);
  
    // **(3) Recargar ambas tablas** (completados y asignadas) para que se vean inmediatamente
    await loadCompletedRecords();
    await loadAssignedTasks();
  
    Swal.fire({
      icon: 'success',
      title: 'Registro Exitoso',
      text: 'Aseo registrado correctamente.',
      timer: 2000,
      showConfirmButton: false
    });
  
    busIdInput.value = "";
    document.getElementById("aseo-type").selectedIndex = 0;
    document.getElementById("date").value = "";
  }
  
  /**
   * Muestra el modal y los buses pendientes desde cleaner!A2:C
   */
  async function openPendingBusesModal() {
    const modal = document.getElementById("pending-buses-modal");
    const tableBody = document.getElementById("pending-buses-table")?.querySelector("tbody");
    if (!tableBody || !modal) {
      console.warn("No existe la tabla de buses pendientes o el modal.");
      return;
    }
  
    tableBody.innerHTML = "";
  
    try {
      // (2) Ya no filtramos por usuario actual: mostraremos TODOS los datos de "cleaner!A2:C"
      const busesData = await loadSheetData("cleaner!A2:C") || [];
      console.log("Buses pendientes (cleaner!A2:C):", busesData);
  
      if (busesData.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 3;
        td.textContent = "No hay buses pendientes.";
        td.style.textAlign = "center";
        tr.appendChild(td);
        tableBody.appendChild(tr);
      } else {
        const newPending = new Set(busesData.map(r => r[1]?.trim().toUpperCase()));
  
        busesData.forEach(row => {
          // row[0] = Usuario, row[1] = PPU, row[2] = Motivo/Fecha
          const ppu = row[1] ? row[1].trim().toUpperCase() : "N/A";
          const motivo = row[2] ? row[2].trim() : "N/A";
          const fecha = ""; // ajusta si tienes un 3er campo
  
          if (!lastPendingBusIds.has(ppu)) {
            const tr = document.createElement("tr");
            tr.style.cursor = "pointer";
  
            [ppu, motivo, fecha].forEach(val => {
              const td = document.createElement("td");
              td.textContent = val;
              tr.appendChild(td);
            });
  
            tr.addEventListener("click", () => {
              document.getElementById("bus-id").value = ppu;
              closePendingBusesModal();
              Swal.fire({
                icon: 'success',
                title: 'PPU Agregado',
                text: `Bus ${ppu} agregado al formulario.`,
                timer: 1500,
                showConfirmButton: false,
                position: 'top-end',
                toast: true,
                background: '#1e3d59',
                color: '#fff'
              });
            });
  
            tableBody.appendChild(tr);
          }
        });
  
        lastPendingBusIds = newPending;
      }
  
      modal.style.display = "flex";
    } catch (error) {
      console.error("Error al cargar buses pendientes:", error);
      tableBody.innerHTML = "";
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 3;
      td.textContent = "Error al cargar datos.";
      td.style.textAlign = "center";
      tr.appendChild(td);
      tableBody.appendChild(tr);
    }
  }
  
  /**
   * Cierra el modal de Buses Pendientes
   */
  function closePendingBusesModal() {
    const modal = document.getElementById("pending-buses-modal");
    if (modal) modal.style.display = "none";
  }
  
  /**
   * Actualiza contadores en la interfaz
   */
  function updateCounts() {
    const assignedBody = document.getElementById("assigned-tasks-table")?.querySelector("tbody");
    const completedBody = document.getElementById("completed-records-table")?.querySelector("tbody");
    if (!assignedBody || !completedBody) return;
  
    const totalTasksCount = document.getElementById("total-tasks-count");
    const totalAttendanceCount = document.getElementById("total-attendance-count");
  
    totalTasksCount.textContent = assignedBody.rows.length;
    totalAttendanceCount.textContent = completedBody.rows.length;
  }
  
  /**
   * Inicializa gráficos y contadores
   */
  function initializeChartsAndCounters() {
    initializeCharts();
    updateTaskChart();
    updateAttendanceChart();
    updateAseadoresChart();
    updateCounts();
  }
  
  /**
   * Actualiza todo sin borrar los datos en tablas
   */
  async function updateAllChartsAndCounters() {
    await loadAssignedTasks();
    await loadCompletedRecords();
    updateTaskChart();
    updateAttendanceChart();
    updateAseadoresChart();
    updateCounts();
  }
  
  /**
   * Paginación
   */
  function initializePagination() {
    paginateTable(document.getElementById("assigned-tasks-table")?.querySelector("tbody"), "assignment-pagination");
    paginateTable(document.getElementById("completed-records-table")?.querySelector("tbody"), "completed-records-pagination");
    paginateTable(document.getElementById("pending-buses-table")?.querySelector("tbody"), "pending-buses-pagination");
  }
  
  function paginateTable(tableBody, paginationContainerId, rowsPerPage = 10) {
    if (!tableBody) return;
    const paginationContainer = document.getElementById(paginationContainerId);
    if (!paginationContainer) return;
  
    let currentPage = 1;
  
    function renderTable() {
      const rows = Array.from(tableBody.rows);
      const totalPages = Math.ceil(rows.length / rowsPerPage);
  
      rows.forEach((row, index) => {
        row.style.display = (index >= (currentPage - 1) * rowsPerPage && index < currentPage * rowsPerPage) ? "" : "none";
      });
  
      paginationContainer.innerHTML = "";
      for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement("button");
        btn.textContent = i;
        btn.classList.add("pagination-button");
        if (i === currentPage) btn.classList.add("active");
  
        btn.addEventListener("click", () => {
          currentPage = i;
          renderTable();
        });
  
        paginationContainer.appendChild(btn);
      }
    }
  
    renderTable();
  }
  
  /**
   * Observadores de tablas para recalcular paginación y gráficos
   */
  function setupTableObservers() {
    const observerOptions = { childList: true };
  
    const assignedBody = document.getElementById("assigned-tasks-table")?.querySelector("tbody");
    const completedBody = document.getElementById("completed-records-table")?.querySelector("tbody");
    const pendingBody = document.getElementById("pending-buses-table")?.querySelector("tbody");
  
    if (assignedBody) {
      const assignedObserver = new MutationObserver(() => {
        paginateTable(assignedBody, "assignment-pagination");
        updateCounts();
        updateTaskChart();
      });
      assignedObserver.observe(assignedBody, observerOptions);
    }
  
    if (completedBody) {
      const completedObserver = new MutationObserver(() => {
        paginateTable(completedBody, "completed-records-pagination");
        updateCounts();
        updateAttendanceChart();
        updateAseadoresChart();
      });
      completedObserver.observe(completedBody, observerOptions);
    }
  
    if (pendingBody) {
      const pendingObserver = new MutationObserver(() => {
        paginateTable(pendingBody, "pending-buses-pagination");
      });
      pendingObserver.observe(pendingBody, observerOptions);
    }
  }
  
  /**
   * Manejo de Gráficos con Chart.js
   */
  let taskChart, attendanceChart, aseadoresChart;
  
  function initializeCharts() {
    const taskCanvas = document.getElementById("taskChart");
    const attendanceCanvas = document.getElementById("attendanceChart");
    const aseadoresCanvas = document.getElementById("aseadoresChart");
  
    if (!taskCanvas || !attendanceCanvas || !aseadoresCanvas) {
      console.warn("No se encontraron algunos canvas para los gráficos. Se omiten.");
      return;
    }
  
    const taskCtx = taskCanvas.getContext("2d");
    const attendanceCtx = attendanceCanvas.getContext("2d");
    const aseadoresCtx = aseadoresCanvas.getContext("2d");
  
    // Gráfico Tareas Asignadas
    taskChart = new Chart(taskCtx, {
      type: 'bar',
      data: {
        labels: ["LAURA SOTO","GALINDO SAEZ","LAUREANO RAMIREZ","PAMELA ANDRADES","HUGO CARRASCO","GLORIA ANGEL","DANIELA SOLORZA","SILVIA GONZALEZ","SILVIA VILLALOBOS","MARISOL AGUIRRE","MARIA LAZCANO","ISAAC MAGUINA","AXIS MAURICE","VITEL DESROSIERS","VERONICA ORTIZ","ROSA SMART","PATRICIA QUIRILAO"],
        datasets: [{
          label: "Tareas Asignadas",
          data: new Array(17).fill(0),
          backgroundColor: "rgba(30,61,89,0.7)"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: { display: true, text: "Tareas Asignadas por Aseador" }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  
    // Gráfico Aseos Realizados por Tipo
    attendanceChart = new Chart(attendanceCtx, {
      type: 'bar',
      data: {
        labels: ["Barrido","Trapeado","Barrido y Trapeado","Buses por Inspección","Revisado por ICA","Programado por RTG","Programado por DTPM","Programado por APPLUS"],
        datasets: [{
          label: "Aseos Realizados",
          data: [0,0,0,0,0,0,0,0],
          backgroundColor: "rgba(23,162,184,0.7)"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: { display: true, text: "Aseos Realizados por Tipo" }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  
    // Gráfico Registros de Aseadores
    aseadoresChart = new Chart(aseadoresCtx, {
      type: 'bar',
      data: {
        labels: ["LAURA SOTO","GALINDO SAEZ","LAUREANO RAMIREZ","PAMELA ANDRADES","HUGO CARRASCO","GLORIA ANGEL","DANIELA SOLORZA","SILVIA GONZALEZ","SILVIA VILLALOBOS","MARISOL AGUIRRE","MARIA LAZCANO","ISAAC MAGUINA","AXIS MAURICE","VITEL DESROSIERS","VERONICA ORTIZ","ROSA SMART","PATRICIA QUIRILAO"],
        datasets: [{
          label: "Registros de Aseos",
          data: new Array(17).fill(0),
          backgroundColor: "rgba(75,192,192,0.7)"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: { display: true, text: "Registros de Aseos por Aseador" }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  }
  
  /**
   * Actualiza gráfico Tareas Asignadas sin romper si no existe
   */
  async function updateTaskChart() {
    if (!taskChart || !taskChart.data || !taskChart.data.datasets) {
      return; // Evita errores si no hay canvas
    }
  
    const assignedTasks = await loadSheetData("aseo!A2:F") || [];
    const taskCounts = {
      "LAURA SOTO":0,"GALINDO SAEZ":0,"LAUREANO RAMIREZ":0,"PAMELA ANDRADES":0,"HUGO CARRASCO":0,
      "GLORIA ANGEL":0,"DANIELA SOLORZA":0,"SILVIA GONZALEZ":0,"SILVIA VILLALOBOS":0,"MARISOL AGUIRRE":0,
      "MARIA LAZCANO":0,"ISAAC MAGUINA":0,"AXIS MAURICE":0,"VITEL DESROSIERS":0,"VERONICA ORTIZ":0,
      "ROSA SMART":0,"PATRICIA QUIRILAO":0
    };
  
    assignedTasks.forEach(row => {
      if (!row[0]) return;
      const user = row[0].trim().toUpperCase();
      if (user in taskCounts) taskCounts[user]++;
    });
  
    taskChart.data.datasets[0].data = Object.values(taskCounts);
    taskChart.update();
  }
  
  /**
   * Actualiza gráfico Aseos Realizados por Tipo sin romper si no existe
   */
  async function updateAttendanceChart() {
    if (!attendanceChart || !attendanceChart.data || !attendanceChart.data.datasets) {
      return;
    }
  
    const completedRecords = await loadSheetData("aseo!I2:L") || [];
    const aseoCounts = {
      "Barrido":0,"Trapeado":0,"Barrido y Trapeado":0,"Buses por Inspección":0,"Revisado por ICA":0,
      "Programado por RTG":0,"Programado por DTPM":0,"Programado por APPLUS":0
    };
  
    completedRecords.forEach(row => {
      if (!row[2]) return; // row[2] => Aseo
      const aseoType = row[2].trim();
      if (aseoType in aseoCounts) {
        aseoCounts[aseoType]++;
      }
    });
  
    attendanceChart.data.datasets[0].data = Object.values(aseoCounts);
    attendanceChart.update();
  }
  
  /**
   * Actualiza gráfico Registros de Aseadores sin romper si no existe
   */
  async function updateAseadoresChart() {
    if (!aseadoresChart || !aseadoresChart.data || !aseadoresChart.data.datasets) {
      return;
    }
  
    const completedRecords = await loadSheetData("aseo!I2:L") || [];
    const aseadoresCount = {
      "LAURA SOTO":0,"GALINDO SAEZ":0,"LAUREANO RAMIREZ":0,"PAMELA ANDRADES":0,"HUGO CARRASCO":0,
      "GLORIA ANGEL":0,"DANIELA SOLORZA":0,"SILVIA GONZALEZ":0,"SILVIA VILLALOBOS":0,"MARISOL AGUIRRE":0,
      "MARIA LAZCANO":0,"ISAAC MAGUINA":0,"AXIS MAURICE":0,"VITEL DESROSIERS":0,"VERONICA ORTIZ":0,
      "ROSA SMART":0,"PATRICIA QUIRILAO":0
    };
  
    completedRecords.forEach(row => {
      if (!row[1]) return; // row[1] => Nombre de Usuario
      const cleanerName = row[1].trim().toUpperCase();
      if (cleanerName in aseadoresCount) {
        aseadoresCount[cleanerName]++;
      }
    });
  
    aseadoresChart.data.datasets[0].data = Object.values(aseadoresCount);
    aseadoresChart.update();
  }
  