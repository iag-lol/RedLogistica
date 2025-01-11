// cleaner.js

import {
    initializeGapiClient,
    loadSheetData,
    appendData,
    updateSheetData,
    isUserAuthenticated
  } from '/RedLogistica/api/googleSheets.js';
  
  // Estados para evitar duplicados y controlar parpadeos
  let lastTaskIds = new Set();
  let lastCompletedIds = new Set();
  let lastPendingBusIds = new Set();
  
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      console.log("Inicializando cliente GAPI...");
      await initializeGapiClient();
  
      if (isUserAuthenticated()) {
        console.log("Usuario autenticado con Google Sheets.");
        updateConnectionStatus(true);
  
        // Cargar datos y configurar la app
        await initializeCleanerData();
  
        // Cada 5s se actualizarán los datos, pero sin vaciar completamente las tablas
        setInterval(() => {
          updateAllChartsAndCounters();
        }, 5000);
      } else {
        console.warn("No se pudo autenticar con Google Sheets.");
        updateConnectionStatus(false);
        alert('Autenticación fallida. Verifica tus credenciales o conexión.');
      }
  
      // Formulario de registro de Aseo
      const registerForm = document.getElementById("register-aseo-form");
      registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        await registerAseo();
      });
  
      // Botón para ver Buses Pendientes
      const pendingBusesBtn = document.getElementById("pending-buses-btn");
      pendingBusesBtn.addEventListener("click", openPendingBusesModal);
  
      // Cerrar el modal de Buses Pendientes
      const closeModalBtn = document.getElementById("close-modal");
      closeModalBtn.addEventListener("click", closePendingBusesModal);
  
      // Cerrar modal si hacen clic fuera del contenido
      window.addEventListener("click", (event) => {
        const modal = document.getElementById("pending-buses-modal");
        if (event.target === modal) {
          closePendingBusesModal();
        }
      });
  
    } catch (error) {
      console.error("Error al inicializar la aplicación:", error);
      alert("Ocurrió un error al inicializar la aplicación. Revisa la consola para más detalles.");
    }
  });
  
  /**
   * Actualiza el estado de conexión en la interfaz
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
   * Inicializa la carga de datos y configuración de la app
   */
  async function initializeCleanerData() {
    await loadAssignedTasks();
    await loadCompletedRecords();
    initializeChartsAndCounters();
    initializePagination();
    setupTableObservers();
  }
  
  /**
   * Carga las tareas asignadas (aseo!A2:F) sin borrar completamente la tabla
   */
  async function loadAssignedTasks() {
    const tasksTableBody = document.getElementById("assigned-tasks-table").querySelector("tbody");
    const assignedTasks = await loadSheetData("aseo!A2:F") || [];
    console.log("Tareas asignadas cargadas:", assignedTasks);
  
    const currentUser = localStorage.getItem("username");
    if (!currentUser) {
      console.warn("No se encontró el nombre de usuario en localStorage.");
      return;
    }
  
    // Filtra las tareas del usuario actual
    const userTasks = assignedTasks.filter(task => {
      if (!task[0]) return false;
      return task[0].trim().toUpperCase() === currentUser.trim().toUpperCase();
    });
  
    // Creamos un nuevo set para comparar
    const newTaskIds = new Set(userTasks.map(task => task[1]));
  
    // Agregar SOLO nuevas tareas que no existían antes
    userTasks.forEach(task => {
      const taskId = task[1];
      if (!lastTaskIds.has(taskId)) {
        const tr = document.createElement("tr");
  
        // Asumiendo: task[1] => PPU BUS, task[2] => Tarea, task[3] => Fecha Límite
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
  
    // Actualiza el set con las nuevas tareas
    lastTaskIds = newTaskIds;
  
    updateCounts();
    updateTaskChart();
  }
  
  /**
   * Carga los registros completados (aseo!I2:L) sin borrar completamente la tabla
   */
  async function loadCompletedRecords() {
    const recordsTableBody = document.getElementById("completed-records-table").querySelector("tbody");
    const completedRecords = await loadSheetData("aseo!I2:L") || [];
    console.log("Registros completados cargados:", completedRecords);
  
    const currentUser = localStorage.getItem("username");
    if (!currentUser) {
      console.warn("No se encontró el nombre de usuario en localStorage.");
      return;
    }
  
    // Filtra los registros del usuario actual
    const userCompleted = completedRecords.filter(record => {
      if (!record[1]) return false; // record[1] => Cleaner
      return record[1].trim().toUpperCase() === currentUser.trim().toUpperCase();
    });
  
    const newCompleted = new Set(userCompleted.map(record => record[1]));
  
    userCompleted.forEach(record => {
      const completedId = record[1];
      if (!lastCompletedIds.has(completedId)) {
        const tr = document.createElement("tr");
        // Asumiendo: [PPU BUS, CLEANER, ASEO, FECHA]
        const ppu = record[0] ? record[0].trim().toUpperCase() : "N/A";
        const cleaner = record[1] ? record[1].trim().toUpperCase() : "N/A";
        const aseo = record[2] ? record[2].trim() : "N/A";
        const fecha = record[3] ? record[3].trim() : "N/A";
  
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
   * Registra un aseo (aseo!I2:L)
   */
  async function registerAseo() {
    const busIdInput = document.getElementById("bus-id");
    const aseoType = document.getElementById("aseo-type").value;
    const dateValue = document.getElementById("date").value;
  
    if (!busIdInput.value || !aseoType || !dateValue) {
      Swal.fire({
        icon: 'warning',
        title: 'Campos Incompletos',
        text: 'Por favor, completa todos los campos antes de registrar el aseo.'
      });
      return;
    }
  
    const currentUser = localStorage.getItem("username");
    if (!currentUser) {
      Swal.fire({
        icon: 'error',
        title: 'Error de Usuario',
        text: 'No se pudo identificar al usuario. Por favor, inicia sesión nuevamente.'
      });
      return;
    }
  
    // Insertar en la hoja: [PPU BUS, CLEANER, ASEO, FECHA]
    const values = [[
      busIdInput.value.trim().toUpperCase(),
      currentUser.trim().toUpperCase(),
      aseoType.trim(),
      dateValue.trim()
    ]];
  
    await appendData("aseo!I2:L", values);
    console.log("Aseo registrado:", values);
  
    // Cargar nuevamente registros completados (sin borrar toda la tabla)
    await loadCompletedRecords();
  
    Swal.fire({
      icon: 'success',
      title: 'Registro Exitoso',
      text: 'Se ha registrado el aseo correctamente.',
      timer: 2000,
      showConfirmButton: false
    });
  
    busIdInput.value = "";
    document.getElementById("aseo-type").selectedIndex = 0;
    document.getElementById("date").value = "";
  }
  
  /**
   * Muestra el modal y los buses pendientes (cleaner!A2:C)
   */
  async function openPendingBusesModal() {
    const modal = document.getElementById("pending-buses-modal");
    const tableBody = document.getElementById("pending-buses-table").querySelector("tbody");
    tableBody.innerHTML = ""; // Limpia para que no haya duplicados
  
    try {
      const currentUser = localStorage.getItem("username");
      if (!currentUser) {
        console.warn("No se encontró el nombre de usuario en localStorage.");
        return;
      }
  
      // Mostrar “Cargando...”
      const loadingRow = document.createElement("tr");
      const loadingTd = document.createElement("td");
      loadingTd.colSpan = 3;
      loadingTd.textContent = "Cargando...";
      loadingTd.style.textAlign = "center";
      loadingRow.appendChild(loadingTd);
      tableBody.appendChild(loadingRow);
  
      const busesData = await loadSheetData("cleaner!A2:C") || [];
      console.log("Buses Pendientes (cleaner!A2:C):", busesData);
  
      tableBody.innerHTML = ""; // Retira el “Cargando...”
  
      // Filtra los buses del usuario actual
      const userPendingBuses = busesData.filter(bus => {
        // bus[0] => Nombre de usuario
        if (!bus[0]) return false;
        return bus[0].trim().toUpperCase() === currentUser.trim().toUpperCase();
      });
  
      if (userPendingBuses.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 3;
        td.textContent = "No hay buses pendientes.";
        td.style.textAlign = "center";
        tr.appendChild(td);
        tableBody.appendChild(tr);
      } else {
        // Crea filas nuevas (sin borrar lastPendingBusIds)
        const newPendingIds = new Set(userPendingBuses.map(row => row[1]));
  
        userPendingBuses.forEach(row => {
          const ppu = row[1] ? row[1].trim().toUpperCase() : "N/A";
          const motivo = row[2] ? row[2].trim() : "N/A";
          const fecha = ""; // O si tienes un campo extra en row[3], úsalo
  
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
                title: 'PPU BUS Agregado',
                text: `Bus ${ppu} agregado al registro.`,
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
  
        lastPendingBusIds = newPendingIds;
      }
  
      modal.style.display = "flex";
    } catch (error) {
      console.error("Error al cargar Buses Pendientes:", error);
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
    modal.style.display = "none";
  }
  
  /**
   * Actualiza los contadores de Tareas y Aseos
   */
  function updateCounts() {
    const assignedBody = document.getElementById("assigned-tasks-table").querySelector("tbody");
    const completedBody = document.getElementById("completed-records-table").querySelector("tbody");
  
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
   * Actualiza todos los datos, gráficos y contadores (sin borrar todo)
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
   * Inicializa la paginación de tablas
   */
  function initializePagination() {
    paginateTable(document.getElementById("assigned-tasks-table").querySelector("tbody"), "assignment-pagination");
    paginateTable(document.getElementById("completed-records-table").querySelector("tbody"), "completed-records-pagination");
    paginateTable(document.getElementById("pending-buses-table").querySelector("tbody"), "pending-buses-pagination");
  }
  
  /**
   * Función genérica de paginación
   */
  function paginateTable(tableBody, paginationContainerId, rowsPerPage = 10) {
    const paginationContainer = document.getElementById(paginationContainerId);
    let currentPage = 1;
  
    function renderTable() {
      const rows = Array.from(tableBody.rows);
      const totalPages = Math.ceil(rows.length / rowsPerPage);
  
      rows.forEach((row, index) => {
        row.style.display = (index >= (currentPage - 1) * rowsPerPage && index < currentPage * rowsPerPage) ? "" : "none";
      });
  
      paginationContainer.innerHTML = "";
      for (let i = 1; i <= totalPages; i++) {
        const pageButton = document.createElement("button");
        pageButton.textContent = i;
        pageButton.classList.add("pagination-button");
        if (i === currentPage) pageButton.classList.add("active");
  
        pageButton.addEventListener("click", () => {
          currentPage = i;
          renderTable();
        });
        paginationContainer.appendChild(pageButton);
      }
    }
  
    renderTable();
  }
  
  /**
   * Observadores de tablas: actualiza paginación y gráficos sin vaciar la tabla
   */
  function setupTableObservers() {
    const observerOptions = { childList: true };
  
    const assignedObserver = new MutationObserver(() => {
      paginateTable(document.getElementById("assigned-tasks-table").querySelector("tbody"), "assignment-pagination");
      updateCounts();
      updateTaskChart();
    });
    assignedObserver.observe(document.getElementById("assigned-tasks-table").querySelector("tbody"), observerOptions);
  
    const completedObserver = new MutationObserver(() => {
      paginateTable(document.getElementById("completed-records-table").querySelector("tbody"), "completed-records-pagination");
      updateCounts();
      updateAttendanceChart();
      updateAseadoresChart();
    });
    completedObserver.observe(document.getElementById("completed-records-table").querySelector("tbody"), observerOptions);
  
    const pendingObserver = new MutationObserver(() => {
      paginateTable(document.getElementById("pending-buses-table").querySelector("tbody"), "pending-buses-pagination");
    });
    pendingObserver.observe(document.getElementById("pending-buses-table").querySelector("tbody"), observerOptions);
  }
  
  /**
   * Manejo de Gráficos con Chart.js
   */
  let taskChart, attendanceChart, aseadoresChart;
  
  function initializeCharts() {
    const taskCtx = document.getElementById("taskChart").getContext("2d");
    const attendanceCtx = document.getElementById("attendanceChart").getContext("2d");
    const aseadoresCtx = document.getElementById("aseadoresChart").getContext("2d");
  
    // Gráfico Tareas Asignadas
    taskChart = new Chart(taskCtx, {
      type: 'bar',
      data: {
        labels: ["LAURA SOTO","GALINDO SAEZ","LAUREANO RAMIREZ","PAMELA ANDRADES","HUGO CARRASCO","GLORIA ANGEL","DANIELA SOLORZA","SILVIA GONZALEZ","SILVIA VILLALOBOS","MARISOL AGUIRRE","MARIA LAZCANO","ISAAC MAGUINA","AXIS MAURICE","VITEL DESROSIERS","VERONICA ORTIZ","ROSA SMART","PATRICIA QUIRILAO"],
        datasets: [{
          label: "Tareas Asignadas",
          data: new Array(17).fill(0),
          backgroundColor: "rgba(30, 61, 89, 0.7)"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: "Tareas Asignadas por Aseador"
          }
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
        labels: ["Barrido", "Trapeado", "Barrido y Trapeado","Buses por Inspección","Revisado por ICA","Programado por RTG","Programado por DTPM","Programado por APPLUS"],
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
          title: {
            display: true,
            text: "Aseos Realizados por Tipo"
          }
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
          title: {
            display: true,
            text: "Registros de Aseos por Aseador"
          }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  }
  
  /**
   * Actualiza el gráfico de Tareas Asignadas
   */
  async function updateTaskChart() {
    const assignedTasks = await loadSheetData("aseo!A2:F") || [];
    console.log("Actualizando gráfico Tareas Asignadas:", assignedTasks);
  
    const taskCounts = {
      "LAURA SOTO": 0, "GALINDO SAEZ": 0, "LAUREANO RAMIREZ": 0, "PAMELA ANDRADES": 0,
      "HUGO CARRASCO": 0, "GLORIA ANGEL": 0, "DANIELA SOLORZA": 0, "SILVIA GONZALEZ": 0,
      "SILVIA VILLALOBOS": 0, "MARISOL AGUIRRE": 0, "MARIA LAZCANO": 0, "ISAAC MAGUINA": 0,
      "AXIS MAURICE": 0, "VITEL DESROSIERS": 0, "VERONICA ORTIZ": 0, "ROSA SMART": 0, "PATRICIA QUIRILAO": 0
    };
  
    assignedTasks.forEach(row => {
      // row[0] => Nombre Usuario
      if (!row[0]) return;
      const cleanerName = row[0].trim().toUpperCase();
      if (cleanerName in taskCounts) {
        taskCounts[cleanerName]++;
      }
    });
  
    taskChart.data.datasets[0].data = Object.values(taskCounts);
    taskChart.update();
  }
  
  /**
   * Actualiza el gráfico de Aseos Realizados por Tipo
   */
  async function updateAttendanceChart() {
    const completedRecords = await loadSheetData("aseo!I2:L") || [];
    console.log("Actualizando gráfico Aseos Realizados:", completedRecords);
  
    const aseoCounts = {
      "Barrido": 0, "Trapeado": 0, "Barrido y Trapeado": 0, "Buses por Inspección": 0,
      "Revisado por ICA": 0, "Programado por RTG": 0, "Programado por DTPM": 0, "Programado por APPLUS": 0
    };
  
    completedRecords.forEach(row => {
      if (!row[2]) return; // row[2] => Aseo Realizado
      const aseoType = row[2].trim();
      if (aseoType in aseoCounts) {
        aseoCounts[aseoType]++;
      }
    });
  
    attendanceChart.data.datasets[0].data = Object.values(aseoCounts);
    attendanceChart.update();
  }
  
  /**
   * Actualiza el gráfico de registros de Aseadores
   */
  async function updateAseadoresChart() {
    const completedRecords = await loadSheetData("aseo!I2:L") || [];
    console.log("Actualizando gráfico de Aseadores:", completedRecords);
  
    const aseadoresCount = {
      "LAURA SOTO": 0, "GALINDO SAEZ": 0, "LAUREANO RAMIREZ": 0, "PAMELA ANDRADES": 0,
      "HUGO CARRASCO": 0, "GLORIA ANGEL": 0, "DANIELA SOLORZA": 0, "SILVIA GONZALEZ": 0,
      "SILVIA VILLALOBOS": 0, "MARISOL AGUIRRE": 0, "MARIA LAZCANO": 0, "ISAAC MAGUINA": 0,
      "AXIS MAURICE": 0, "VITEL DESROSIERS": 0, "VERONICA ORTIZ": 0, "ROSA SMART": 0, "PATRICIA QUIRILAO": 0
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
  