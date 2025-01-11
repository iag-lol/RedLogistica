// cleaner.js

import {
    initializeGapiClient,
    loadSheetData,
    appendData,
    updateSheetData,
    isUserAuthenticated
  } from '/RedLogistica/api/googleSheets.js';
  
  // Para controlar que no se borren o dupliquen datos repetidamente
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
        await initializeCleanerData();
  
        // Actualiza datos cada 5 segundos sin borrar todo
        setInterval(updateAllChartsAndCounters, 5000);
      } else {
        console.warn("No se pudo autenticar con Google Sheets.");
        updateConnectionStatus(false);
        alert('Autenticación fallida. Revisa credenciales o conexión.');
      }
  
      // Formulario de registro de Aseo
      const registerForm = document.getElementById("register-aseo-form");
      registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        await registerAseo();
      });
  
      // Botón para ver Buses Pendientes
      const pendingBusesBtn = document.getElementById("pending-buses-btn");
      pendingBusesBtn.addEventListener("click", openPendingBusesModal);
  
      // Cerrar modal de Buses Pendientes
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
      alert("Error al inicializar. Revisa la consola para más detalles.");
    }
  });
  
  /**
   * Actualiza el estado de conexión
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
   * Inicializa los datos del cleaner
   */
  async function initializeCleanerData() {
    await loadAssignedTasks();
    await loadCompletedRecords();
    initializeChartsAndCounters();
    initializePagination();
    setupTableObservers();
  }
  
  /**
   * Carga las tareas asignadas (aseo!A2:F) sin vaciar completamente la tabla
   */
  async function loadAssignedTasks() {
    const tasksTableBody = document.getElementById("assigned-tasks-table").querySelector("tbody");
    const assignedTasks = await loadSheetData("aseo!A2:F") || [];
  
    const currentUser = localStorage.getItem("username");
    if (!currentUser) {
      console.warn("No se encontró username en localStorage.");
      return;
    }
  
    // Filtra las tareas de este usuario
    const userTasks = assignedTasks.filter(task => {
      if (!task[0]) return false;
      return task[0].trim().toUpperCase() === currentUser.trim().toUpperCase();
    });
  
    // Identificamos nuevos IDs
    const newTaskIds = new Set(userTasks.map(task => task[1]));
  
    // Agregamos SOLO las tareas que no existían antes
    userTasks.forEach(task => {
      const taskId = task[1];
      if (!lastTaskIds.has(taskId)) {
        const tr = document.createElement("tr");
        // Suponiendo: task[1] => PPU, task[2] => Tarea, task[3] => Fecha Límite
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
   * Carga los registros completados (aseo!I2:L) sin vaciar la tabla
   */
  async function loadCompletedRecords() {
    const recordsTableBody = document.getElementById("completed-records-table").querySelector("tbody");
    const completedRecords = await loadSheetData("aseo!I2:L") || [];
  
    const currentUser = localStorage.getItem("username");
    if (!currentUser) {
      console.warn("No se encontró username en localStorage.");
      return;
    }
  
    const userCompleted = completedRecords.filter(record => {
      if (!record[1]) return false; // record[1] => Cleaner
      return record[1].trim().toUpperCase() === currentUser.trim().toUpperCase();
    });
  
    const newCompletedSet = new Set(userCompleted.map(r => r[1]));
  
    userCompleted.forEach(record => {
      const completedId = record[1];
      if (!lastCompletedIds.has(completedId)) {
        const tr = document.createElement("tr");
        // record[0]=PPU, record[1]=Cleaner, record[2]=Aseo, record[3]=Fecha
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
  
    lastCompletedIds = newCompletedSet;
  
    updateCounts();
    updateAttendanceChart();
    updateAseadoresChart();
  }
  
  /**
   * Registra un nuevo aseo en aseo!I2:L
   */
  async function registerAseo() {
    const busIdInput = document.getElementById("bus-id");
    const aseoType = document.getElementById("aseo-type").value;
    const fechaValue = document.getElementById("date").value;
  
    if (!busIdInput.value || !aseoType || !fechaValue) {
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
  
    const values = [[
      busIdInput.value.trim().toUpperCase(),
      currentUser.trim().toUpperCase(),
      aseoType.trim(),
      fechaValue.trim()
    ]];
  
    await appendData("aseo!I2:L", values);
    console.log("Aseo registrado:", values);
  
    // Solo cargamos de nuevo registros completados
    await loadCompletedRecords();
  
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
   * Abre el modal y muestra los buses pendientes (cleaner!A2:C)
   */
  async function openPendingBusesModal() {
    const modal = document.getElementById("pending-buses-modal");
    const tableBody = document.getElementById("pending-buses-table").querySelector("tbody");
    tableBody.innerHTML = "";
  
    try {
      const currentUser = localStorage.getItem("username");
      if (!currentUser) {
        console.warn("No se encontró username en localStorage.");
        return;
      }
  
      // Mensaje de carga
      const loadingRow = document.createElement("tr");
      const loadingTd = document.createElement("td");
      loadingTd.colSpan = 3;
      loadingTd.textContent = "Cargando...";
      loadingTd.style.textAlign = "center";
      loadingRow.appendChild(loadingTd);
      tableBody.appendChild(loadingRow);
  
      const busesData = await loadSheetData("cleaner!A2:C") || [];
      console.log("Buses Pendientes (cleaner!A2:C):", busesData);
  
      tableBody.innerHTML = "";
  
      // Filtrar buses del usuario
      const userPending = busesData.filter(row => {
        // row[0] => Nombre de Usuario
        if (!row[0]) return false;
        return row[0].trim().toUpperCase() === currentUser.trim().toUpperCase();
      });
  
      if (userPending.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 3;
        td.textContent = "No hay buses pendientes.";
        td.style.textAlign = "center";
        tr.appendChild(td);
        tableBody.appendChild(tr);
      } else {
        const newPending = new Set(userPending.map(b => b[1])); // b[1] => PPU
  
        userPending.forEach(bus => {
          // bus[0]=Usuario, bus[1]=PPU, bus[2]=Motivo/Fecha
          const ppu = bus[1] ? bus[1].trim().toUpperCase() : "N/A";
          const motivo = bus[2] ? bus[2].trim() : "N/A";
          const fecha = ""; // si tuvieras un 3er campo, ajusta aquí
  
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
    modal.style.display = "none";
  }
  
  /**
   * Actualiza los contadores
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
   * Actualiza todo cada 5s
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
    paginateTable(document.getElementById("assigned-tasks-table").querySelector("tbody"), "assignment-pagination");
    paginateTable(document.getElementById("completed-records-table").querySelector("tbody"), "completed-records-pagination");
    paginateTable(document.getElementById("pending-buses-table").querySelector("tbody"), "pending-buses-pagination");
  }
  
  function paginateTable(tableBody, paginationContainerId, rowsPerPage = 10) {
    const paginationContainer = document.getElementById(paginationContainerId);
    let currentPage = 1;
  
    function renderTable() {
      const rows = Array.from(tableBody.rows);
      const totalPages = Math.ceil(rows.length / rowsPerPage);
  
      rows.forEach((row, index) => {
        row.style.display = (index >= (currentPage - 1)*rowsPerPage && index < currentPage*rowsPerPage) ? "" : "none";
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
   * Observadores de tablas para refrescar paginación
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
   * Manejo de gráficos con Chart.js
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
          backgroundColor: "rgba(30,61,89,0.7)"
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
   * Actualiza gráfico Tareas Asignadas
   */
  async function updateTaskChart() {
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
      if (user in taskCounts) {
        taskCounts[user]++;
      }
    });
  
    taskChart.data.datasets[0].data = Object.values(taskCounts);
    taskChart.update();
  }
  
  /**
   * Actualiza gráfico Aseos Realizados por Tipo
   */
  async function updateAttendanceChart() {
    const completedRecords = await loadSheetData("aseo!I2:L") || [];
    const aseoCounts = {
      "Barrido":0,"Trapeado":0,"Barrido y Trapeado":0,"Buses por Inspección":0,"Revisado por ICA":0,
      "Programado por RTG":0,"Programado por DTPM":0,"Programado por APPLUS":0
    };
  
    completedRecords.forEach(row => {
      if (!row[2]) return;
      const aseoType = row[2].trim();
      if (aseoType in aseoCounts) {
        aseoCounts[aseoType]++;
      }
    });
  
    attendanceChart.data.datasets[0].data = Object.values(aseoCounts);
    attendanceChart.update();
  }
  
  /**
   * Actualiza gráfico Registros de Aseadores
   */
  async function updateAseadoresChart() {
    const completedRecords = await loadSheetData("aseo!I2:L") || [];
    const aseadoresCount = {
      "LAURA SOTO":0,"GALINDO SAEZ":0,"LAUREANO RAMIREZ":0,"PAMELA ANDRADES":0,"HUGO CARRASCO":0,
      "GLORIA ANGEL":0,"DANIELA SOLORZA":0,"SILVIA GONZALEZ":0,"SILVIA VILLALOBOS":0,"MARISOL AGUIRRE":0,
      "MARIA LAZCANO":0,"ISAAC MAGUINA":0,"AXIS MAURICE":0,"VITEL DESROSIERS":0,"VERONICA ORTIZ":0,
      "ROSA SMART":0,"PATRICIA QUIRILAO":0
    };
  
    completedRecords.forEach(row => {
      if (!row[1]) return;
      const cleanerName = row[1].trim().toUpperCase();
      if (cleanerName in aseadoresCount) {
        aseadoresCount[cleanerName]++;
      }
    });
  
    aseadoresChart.data.datasets[0].data = Object.values(aseadoresCount);
    aseadoresChart.update();
  }
  