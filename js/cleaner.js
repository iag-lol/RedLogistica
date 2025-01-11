// cleaner.js

import {
    initializeGapiClient,
    loadSheetData,
    appendData,
    updateSheetData,
    isUserAuthenticated
  } from '/RedLogistica/api/googleSheets.js';
  
  // Variables para el manejo de estados
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
        setInterval(updateAllChartsAndCounters, 5000); // Actualiza los gráficos y tareas cada 5s
      } else {
        console.warn("No se pudo autenticar con Google Sheets.");
        updateConnectionStatus(false);
        alert('Autenticación fallida. Verifica tus credenciales o conexión.');
      }
  
      // Formulario de Registro de Aseo
      const registerAseoForm = document.getElementById("register-aseo-form");
      registerAseoForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        await registerAseo();
      });
  
      // Botón para ver Buses Pendientes
      const pendingBusesBtn = document.getElementById("pending-buses-btn");
      pendingBusesBtn.addEventListener("click", openPendingBusesModal);
  
      // Cerrar Modal de Buses Pendientes
      const closeModalBtn = document.getElementById("close-modal");
      closeModalBtn.addEventListener("click", closePendingBusesModal);
  
      // Cerrar modal al hacer clic fuera
      window.addEventListener("click", (event) => {
        const modal = document.getElementById("pending-buses-modal");
        if (event.target === modal) {
          closePendingBusesModal();
        }
      });
  
    } catch (error) {
      console.error("Error al inicializar la aplicación:", error);
      alert("Ocurrió un error al inicializar la aplicación. Revisa la consola.");
    }
  });
  
  /**
   * Actualiza el estado de conexión en la interfaz
   * @param {boolean} connected - Indica si está conectado o no
   */
  function updateConnectionStatus(connected) {
    const connectionStatus = document.getElementById("connection-status");
    const usernameDisplay = document.getElementById("username-display");
    const username = localStorage.getItem("username") || "Usuario desconocido";
  
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
   * Inicializa los datos y funcionalidades principales
   */
  async function initializeCleanerData() {
    await loadAssignedTasks();
    await loadCompletedRecords();
    initializeChartsAndCounters();
    initializePagination();
    setupTableObservers();
  }
  
  /**
   * Carga las tareas asignadas desde la hoja "aseo!A2:F"
   */
  async function loadAssignedTasks() {
    const tasksTableBody = document.getElementById("assigned-tasks-table").querySelector("tbody");
    tasksTableBody.innerHTML = ""; // Limpia la tabla antes de cargar datos
  
    const assignedTasks = await loadSheetData("aseo!A2:F");
    console.log("Tareas asignadas cargadas:", assignedTasks);
  
    const currentUser = localStorage.getItem("username");
    if (!currentUser) {
      console.warn("No se encontró el nombre de usuario en localStorage.");
      return;
    }
  
    const userTasks = assignedTasks.filter(task => {
      // task[0] => Nombre de Usuario
      if (task[0] && task[0].trim().toUpperCase() === currentUser.trim().toUpperCase()) {
        return true;
      }
      return false;
    });
  
    const newTaskIds = new Set(userTasks.map(task => task[1])); // Se asume que task[1] es un ID único o PPU
    
    userTasks.forEach(task => {
      if (!lastTaskIds.has(task[1])) {
        const tr = document.createElement("tr");
        // Asumiendo que task[1]=PPU BUS, task[2]=Tarea, task[3]=Fecha Límite
        const ppu = task[1] ? task[1].trim().toUpperCase() : "N/A";
        const tarea = task[2] ? task[2].trim() : "N/A";
        const fecha = task[3] ? task[3].trim() : "N/A";
  
        // Crear celdas
        [ppu, tarea, fecha].forEach(value => {
          const td = document.createElement("td");
          td.textContent = value;
          tr.appendChild(td);
        });
  
        tasksTableBody.appendChild(tr);
        lastTaskIds.add(task[1]);
      }
    });
  
    updateCounts();
    updateTaskChart();
  }
  
  /**
   * Carga registros completados desde la hoja "aseo!I2:L"
   */
  async function loadCompletedRecords() {
    const recordsTableBody = document.getElementById("completed-records-table").querySelector("tbody");
    recordsTableBody.innerHTML = "";
  
    const completedRecords = await loadSheetData("aseo!I2:L");
    console.log("Registros completados cargados:", completedRecords);
  
    const currentUser = localStorage.getItem("username");
    if (!currentUser) {
      console.warn("No se encontró el nombre de usuario en localStorage.");
      return;
    }
  
    const userCompleted = completedRecords.filter(record => {
      // record[1] => Nombre de Usuario
      if (record[1] && record[1].trim().toUpperCase() === currentUser.trim().toUpperCase()) {
        return true;
      }
      return false;
    });
  
    const newCompletedIds = new Set(userCompleted.map(record => record[1]));
    userCompleted.forEach(record => {
      if (!lastCompletedIds.has(record[1])) {
        const tr = document.createElement("tr");
        // Asumiendo: record[0]=PPU BUS, record[1]=Cleaner, record[2]=Aseo, record[3]=Fecha
        const ppu = record[0] ? record[0].trim().toUpperCase() : "N/A";
        const cleaner = record[1] ? record[1].trim().toUpperCase() : "N/A";
        const aseo = record[2] ? record[2].trim() : "N/A";
        const fecha = record[3] ? record[3].trim() : "N/A";
  
        [ppu, cleaner, aseo, fecha].forEach(value => {
          const td = document.createElement("td");
          td.textContent = value;
          tr.appendChild(td);
        });
  
        recordsTableBody.appendChild(tr);
      }
    });
  
    lastCompletedIds = newCompletedIds;
  
    updateCounts();
    updateAttendanceChart();
    updateAseadoresChart();
  }
  
  /**
   * Registra un nuevo aseo en la hoja "aseo!I2:L"
   */
  async function registerAseo() {
    const busIdInput = document.getElementById("bus-id");
    const aseoType = document.getElementById("aseo-type").value;
    const dateInput = document.getElementById("date").value;
  
    if (!busIdInput.value || !aseoType || !dateInput) {
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
  
    // Insertar en la hoja "aseo!I2:L": [PPU BUS, NOMBRE USUARIO, ASEO, FECHA]
    const values = [[
      busIdInput.value.trim().toUpperCase(),
      currentUser.trim().toUpperCase(),
      aseoType.trim(),
      dateInput.trim()
    ]];
    
    await appendData("aseo!I2:L", values);
    console.log("Aseo registrado:", values);
  
    // Actualizar la tabla de completados
    await loadCompletedRecords();
  
    // Limpiar formulario
    Swal.fire({
      icon: 'success',
      title: 'Registro Exitoso',
      text: 'Se ha registrado el aseo correctamente.',
      timer: 2500,
      showConfirmButton: false
    });
    busIdInput.value = "";
    document.getElementById("aseo-type").selectedIndex = 0;
    document.getElementById("date").value = "";
  }
  
  /**
   * Abre el modal y carga los buses pendientes del usuario desde "cleaner!A2:C"
   */
  async function openPendingBusesModal() {
    const pendingBusesModal = document.getElementById("pending-buses-modal");
    const pendingBusesTableBody = document.getElementById("pending-buses-table").querySelector("tbody");
    pendingBusesTableBody.innerHTML = "";
  
    try {
      const currentUser = localStorage.getItem("username");
      if (!currentUser) {
        console.warn("No se encontró el nombre de usuario en localStorage.");
        return;
      }
  
      // Mostrar mensaje de carga
      const loadingRow = document.createElement("tr");
      const loadingTd = document.createElement("td");
      loadingTd.colSpan = 3;
      loadingTd.textContent = "Cargando...";
      loadingTd.style.textAlign = "center";
      loadingRow.appendChild(loadingTd);
      pendingBusesTableBody.appendChild(loadingRow);
  
      const busesData = await loadSheetData("cleaner!A2:C");
      console.log("Buses Pendientes:", busesData);
  
      // Limpiar mensaje de carga
      pendingBusesTableBody.innerHTML = "";
  
      const userPending = busesData.filter(row => {
        // row[0] = Nombre de Usuario, row[1] = PPU BUS, row[2] = Motivo/Fecha
        if (row[0] && row[0].trim().toUpperCase() === currentUser.trim().toUpperCase()) {
          return true;
        }
        return false;
      });
  
      if (userPending.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 3;
        td.textContent = "No hay buses pendientes.";
        td.style.textAlign = "center";
        tr.appendChild(td);
        pendingBusesTableBody.appendChild(tr);
      } else {
        userPending.forEach(bus => {
          const tr = document.createElement("tr");
          tr.style.cursor = "pointer";
  
          // Asumiendo row[1] = PPU BUS, row[2] = Motivo/Fecha
          const ppu = bus[1] ? bus[1].trim().toUpperCase() : "N/A";
          const motivo = bus[2] ? bus[2].trim() : "N/A";
          const fecha = ""; // O un campo adicional si lo requieres
  
          // Crear celdas
          [ppu, motivo, fecha].forEach(val => {
            const td = document.createElement("td");
            td.textContent = val;
            tr.appendChild(td);
          });
  
          tr.addEventListener("click", () => {
            document.getElementById("bus-id").value = ppu;
            closePendingBusesModal();
            showAlert('success', 'PPU BUS Agregado', `Bus ${ppu} agregado al registro.`);
          });
  
          pendingBusesTableBody.appendChild(tr);
        });
      }
  
      pendingBusesModal.style.display = "flex";
    } catch (error) {
      console.error("Error al cargar buses pendientes:", error);
      pendingBusesTableBody.innerHTML = "";
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 3;
      td.textContent = "Error al cargar datos.";
      td.style.textAlign = "center";
      tr.appendChild(td);
      pendingBusesTableBody.appendChild(tr);
      showAlert('error', 'Error', 'No se pudieron cargar los buses pendientes.');
    }
  }
  
  /**
   * Cierra el modal de Buses Pendientes
   */
  function closePendingBusesModal() {
    const pendingBusesModal = document.getElementById("pending-buses-modal");
    pendingBusesModal.style.display = "none";
  }
  
  /**
   * Actualiza los contadores de tareas y aseos
   */
  function updateCounts() {
    const totalTasksCount = document.getElementById("total-tasks-count");
    const totalAttendanceCount = document.getElementById("total-attendance-count");
  
    const assignedTableBody = document.getElementById("assigned-tasks-table").querySelector("tbody");
    const completedTableBody = document.getElementById("completed-records-table").querySelector("tbody");
  
    totalTasksCount.textContent = assignedTableBody.rows.length;
    totalAttendanceCount.textContent = completedTableBody.rows.length;
  }
  
  /**
   * Inicializa los gráficos y contadores
   */
  function initializeChartsAndCounters() {
    initializeCharts(); // Crear gráficos
    updateTaskChart();
    updateAttendanceChart();
    updateAseadoresChart();
    updateCounts();
  }
  
  /**
   * Actualiza todos los gráficos y recarga datos
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
   * Paginación de tablas
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
   * Observadores de cambios en tablas
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
  
    // Gráfico de Tareas Asignadas
    taskChart = new Chart(taskCtx, {
      type: 'bar',
      data: {
        labels: ["LAURA SOTO", "GALINDO SAEZ", "LAUREANO RAMIREZ", "PAMELA ANDRADES", "HUGO CARRASCO", "GLORIA ANGEL", "DANIELA SOLORZA", "SILVIA GONZALEZ", "SILVIA VILLALOBOS", "MARISOL AGUIRRE", "MARIA LAZCANO", "ISAAC MAGUINA", "AXIS MAURICE", "VITEL DESROSIERS", "VERONICA ORTIZ", "ROSA SMART", "PATRICIA QUIRILAO"],
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
  
    // Gráfico de Aseos Realizados por Tipo
    attendanceChart = new Chart(attendanceCtx, {
      type: 'bar',
      data: {
        labels: ["Barrido", "Trapeado", "Barrido y Trapeado", "Buses por Inspección", "Revisado por ICA", "Programado por RTG", "Programado por DTPM", "Programado por APPLUS"],
        datasets: [{
          label: "Aseos Realizados",
          data: [0, 0, 0, 0, 0, 0, 0, 0],
          backgroundColor: "rgba(23, 162, 184, 0.7)"
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
  
    // Gráfico de Registros de Aseadores
    aseadoresChart = new Chart(aseadoresCtx, {
      type: 'bar',
      data: {
        labels: ["LAURA SOTO", "GALINDO SAEZ", "LAUREANO RAMIREZ", "PAMELA ANDRADES", "HUGO CARRASCO", "GLORIA ANGEL", "DANIELA SOLORZA", "SILVIA GONZALEZ", "SILVIA VILLALOBOS", "MARISOL AGUIRRE", "MARIA LAZCANO", "ISAAC MAGUINA", "AXIS MAURICE", "VITEL DESROSIERS", "VERONICA ORTIZ", "ROSA SMART", "PATRICIA QUIRILAO"],
        datasets: [{
          label: "Registros de Aseos",
          data: new Array(17).fill(0),
          backgroundColor: "rgba(75, 192, 192, 0.7)"
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
    const assignedTasks = await loadSheetData("aseo!A2:F");
    console.log("Actualizando gráfico de tareas asignadas:", assignedTasks);
  
    const taskCounts = {
      "LAURA SOTO": 0, "GALINDO SAEZ": 0, "LAUREANO RAMIREZ": 0,
      "PAMELA ANDRADES": 0, "HUGO CARRASCO": 0, "GLORIA ANGEL": 0,
      "DANIELA SOLORZA": 0, "SILVIA GONZALEZ": 0, "SILVIA VILLALOBOS": 0,
      "MARISOL AGUIRRE": 0, "MARIA LAZCANO": 0, "ISAAC MAGUINA": 0,
      "AXIS MAURICE": 0, "VITEL DESROSIERS": 0, "VERONICA ORTIZ": 0,
      "ROSA SMART": 0, "PATRICIA QUIRILAO": 0
    };
  
    assignedTasks.forEach(row => {
      if (!row[0]) return;  // row[0] => Nombre de Usuario
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
    const completedRecords = await loadSheetData("aseo!I2:L");
    console.log("Actualizando gráfico de Aseos Realizados:", completedRecords);
  
    const aseoCounts = {
      "Barrido": 0, "Trapeado": 0, "Barrido y Trapeado": 0,
      "Buses por Inspección": 0, "Revisado por ICA": 0,
      "Programado por RTG": 0, "Programado por DTPM": 0, "Programado por APPLUS": 0
    };
  
    completedRecords.forEach(row => {
      // row[2] => Tipo de Aseo
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
   * Actualiza el gráfico de Registros de Aseadores
   */
  async function updateAseadoresChart() {
    const completedRecords = await loadSheetData("aseo!I2:L");
    console.log("Actualizando gráfico de Aseadores:", completedRecords);
  
    const aseadoresCount = {
      "LAURA SOTO": 0, "GALINDO SAEZ": 0, "LAUREANO RAMIREZ": 0,
      "PAMELA ANDRADES": 0, "HUGO CARRASCO": 0, "GLORIA ANGEL": 0,
      "DANIELA SOLORZA": 0, "SILVIA GONZALEZ": 0, "SILVIA VILLALOBOS": 0,
      "MARISOL AGUIRRE": 0, "MARIA LAZCANO": 0, "ISAAC MAGUINA": 0,
      "AXIS MAURICE": 0, "VITEL DESROSIERS": 0, "VERONICA ORTIZ": 0,
      "ROSA SMART": 0, "PATRICIA QUIRILAO": 0
    };
  
    completedRecords.forEach(row => {
      // row[1] => Nombre de Usuario (Cleaner)
      if (!row[1]) return;
      const cleanerName = row[1].trim().toUpperCase();
      if (cleanerName in aseadoresCount) {
        aseadoresCount[cleanerName]++;
      }
    });
  
    aseadoresChart.data.datasets[0].data = Object.values(aseadoresCount);
    aseadoresChart.update();
  }
  
  /**
   * Alertas utilizando SweetAlert2
   */
  function showAlert(type, title, message) {
    Swal.fire({
      icon: type,
      title: title,
      text: message,
      timer: 3000,
      timerProgressBar: true,
      showConfirmButton: false,
      position: 'top-end',
      toast: true,
      background: '#1e3d59',
      color: '#fff'
    });
  }
  
  function showPersistentAlert(type, title, message) {
    Swal.fire({
      icon: type,
      title: title,
      text: message,
      showConfirmButton: true,
      confirmButtonText: 'OK',
      position: 'top-end',
      toast: true,
      background: '#1e3d59',
      color: '#fff'
    });
  }
  