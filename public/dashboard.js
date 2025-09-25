// =====================
// Variables globales dashboard
// =====================
let todasCarpetas = [];
let rechazadasCarpetas = [];
let currentPageTodas = 1;
let currentPageRechazadas = 1;
const itemsPerPage = 10;
let searchTermTodas = '';
let searchTermRechazadas = '';

// =====================
// Renderizado de tablas
// =====================

function renderTableCarpetas() {
    const tbody = document.querySelector('#carpetasTable tbody');
    tbody.innerHTML = '';
    let filtradas = todasCarpetas.filter(c =>
        c.nombre.toLowerCase().includes(searchTermTodas)
    );
    const totalPages = Math.ceil(filtradas.length / itemsPerPage) || 1;
    currentPageTodas = Math.min(currentPageTodas, totalPages);
    const start = (currentPageTodas - 1) * itemsPerPage;
    const pageItems = filtradas.slice(start, start + itemsPerPage);
    for (const c of pageItems) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${c.nombre}</td>
            <td>${c.fechaProcesamiento ? new Date(c.fechaProcesamiento).toLocaleString() : '-'}</td>
            <td><button class="acciones-btn" onclick="abrirCarpeta('${c.ruta.replace(/\\/g, '\\\\')}')">Abrir carpeta</button></td>
        `;
        tbody.appendChild(tr);
    }
    renderPagination('paginationTodas', totalPages, currentPageTodas, (page) => { currentPageTodas = page; renderTableCarpetas(); });
}

function abrirCarpeta(ruta) {
    fetch('/api/abrir-carpeta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruta })
    });
}

// =====================
// Helpers UI Dashboard
// =====================

function abrirCarpeta(ruta) {
    fetch('/api/abrir-carpeta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruta })
    });
}

function copiarRuta(ruta) {
    navigator.clipboard.writeText(ruta).then(() => {
        alert('Ruta copiada al portapapeles: ' + ruta);
    });
}


function renderTableRechazadas() {
    const tbody = document.querySelector('#rechazadosTable tbody');
    tbody.innerHTML = '';
    let filtradas = rechazadasCarpetas.filter(c =>
        c.nombre.toLowerCase().includes(searchTermRechazadas)
    );
    const totalPages = Math.ceil(filtradas.length / itemsPerPage) || 1;
    currentPageRechazadas = Math.min(currentPageRechazadas, totalPages);
    const start = (currentPageRechazadas - 1) * itemsPerPage;
    const pageItems = filtradas.slice(start, start + itemsPerPage);
    for (const c of pageItems) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${c.nombre}</td>
            <td>${c.fechaProcesamiento ? new Date(c.fechaProcesamiento).toLocaleString() : '-'}</td>
            <td>
                <button class="acciones-btn" onclick="eliminarCarpeta('${c.nombre}')">Eliminar</button>
                <button class="acciones-btn" onclick="verErroresRechazo('${c.nombre}')">Ver errores</button>
            </td>
        `;
        tbody.appendChild(tr);
    }
    renderPagination('paginationRechazadas', totalPages, currentPageRechazadas, (page) => { currentPageRechazadas = page; renderTableRechazadas(); });
}

async function verErroresRechazo(nombre) {
    try {
        const resp = await fetch(`/api/rechazo-errores/${encodeURIComponent(nombre)}`);
        const data = await resp.json();
        mostrarErroresCard(nombre, data.errores || [], data.infoFactura || {});
    } catch (e) {
        mostrarErroresCard(nombre, [{Descripcion: 'No se pudo obtener el detalle de errores', PathFuente: ''}], {});
    }
}

function mostrarErroresCard(nombre, errores, infoFactura = {}) {
    let html = `<div style='text-align:left;'>`;
    html += `<h3 style='margin-top:0;'>Errores de rechazo para: ${nombre}</h3>`;
    if (infoFactura && Object.keys(infoFactura).length > 0) {
        html += `<div style='margin-bottom:10px;'>
            <b>Factura:</b> ${infoFactura.NumFactura || '-'}<br>
            <b>Fecha Radicación:</b> ${infoFactura.FechaRadicacion ? new Date(infoFactura.FechaRadicacion).toLocaleString() : '-'}<br>
            <b>Código Único Validación:</b> ${infoFactura.CodigoUnicoValidacion || '-'}<br>
            <b>Estado Resultado:</b> ${infoFactura.ResultState ? '✔️' : '❌'}
        </div>`;
    }
    if (!errores.length) {
        html += '<p style="color:#b00;font-weight:bold;">No hay errores de rechazo.</p>';
    } else {
        html += `<div style="overflow-x:auto;"><table class='tabla-modal-errores'>
        <thead><tr>
            <th>Clase</th>
            <th>Código</th>
            <th>Descripción</th>
            <th>Observaciones</th>
            <th>PathFuente</th>
        </tr></thead><tbody>`;
        for (let i=0; i<errores.length; i++) {
            const err = errores[i];
            html += `<tr>
                <td>${err.Clase || 'RECHAZADO'}</td>
                <td>${err.Codigo || '-'}</td>
                <td>${err.Descripcion || '-'}</td>
                <td>${err.Observaciones || '-'}</td>
                <td>${err.PathFuente || '-'}</td>
            </tr>`;
        }
        html += '</tbody></table></div>';
    }
    html += `</div>`;
    Swal.fire({
        title: '',
        html: html,
        width: '90vw',
        padding: '2em',
        background: '#f9fafd',
        showCloseButton: true,
        showConfirmButton: false,
        customClass: {
            popup: 'swal2-modal-rechazo swal2-modal-rechazo-xl'
        }
    });
}

function cerrarCardErrores() {
    let div = document.getElementById('rechazoErroresCard');
    if (div) div.style.display = 'none';
}


function renderPagination(containerId, totalPages, currentPage, onPageChange) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    if (totalPages <= 1) return;
    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        btn.className = i === currentPage ? 'active' : '';
        btn.onclick = () => onPageChange(i);
        container.appendChild(btn);
    }
}

async function cargarCarpetas() {
    // Procesadas
    const resp = await fetch('/api/carpetas');
    const data = await resp.json();
    todasCarpetas = [];
    for (const [nombre, info] of Object.entries(data)) {
        const obj = {
            nombre,
            fechaProcesamiento: info.fechaProcesamiento,
            ruta: info.ruta
        };
        todasCarpetas.push(obj);
    }

    // Rechazadas
    try {
        const respRech = await fetch('/api/carpeta-rechazadas');
        const dataRech = await respRech.json();
        rechazadasCarpetas = dataRech.map(item => ({
            nombre: item.nombre,
            fechaProcesamiento: item.fechaProcesamiento,
            estado: item.estado,
            ubicacion: item.ubicacion
        }));
    } catch (e) {
        rechazadasCarpetas = [];
    }

    renderTableCarpetas();
    renderTableRechazadas();
}


async function reprocesarCarpeta(nombre) {
    await fetch(`/api/carpeta/${encodeURIComponent(nombre)}/reprocesar`, { method: 'POST' });
    cargarCarpetas();
}

async function eliminarCarpeta(nombre) {
    if (!confirm('¿Seguro que quieres eliminar la carpeta rechazada?')) return;
    await fetch(`/api/carpeta/${encodeURIComponent(nombre)}`, { method: 'DELETE' });
    cargarCarpetas();
}

document.getElementById('playBtn').onclick = async () => {
    Swal.fire({
        title: 'Iniciando procesamiento...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });
    await fetch('/api/procesar', { method: 'POST' });
    Swal.close();
    cargarCarpetas();
};
document.getElementById('stopBtn').onclick = async () => {
    await fetch('/api/detener', { method: 'POST' });
};

// --- Eliminar rechazadas del control ---
const eliminarRechazadasBtn = document.getElementById('eliminarRechazadasBtn');
if (eliminarRechazadasBtn) {
    eliminarRechazadasBtn.onclick = async () => {
        const result = await Swal.fire({
            title: '¿Eliminar todas las rechazadas del control?',
            html: '<div style="color:#b00;font-weight:bold;">Esto solo las quita del control, no borra archivos físicos.<br>Las carpetas podrán reprocesarse.</div>',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            customClass: {
                popup: 'swal2-modal-rechazo'
            }
        });
        if (result.isConfirmed) {
            try {
                const resp = await fetch('/api/carpetas/eliminar-rechazadas', { method: 'POST' });
                const data = await resp.json();
                if (data.ok) {
                    await Swal.fire({
                        title: '¡Listo!',
                        html: `<b>Eliminadas del control:</b> <span style='color:#0a0;'>${data.eliminadas.length}</span>`,
                        icon: 'success',
                        timer: 2000,
                        showConfirmButton: false
                    });
                    cargarCarpetas();
                } else {
                    Swal.fire('Error', 'No se pudo eliminar.', 'error');
                }
            } catch (e) {
                Swal.fire('Error', 'Error de red o servidor.', 'error');
            }
        }
    };
}

// --- Tabs funcionales ---
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
tabBtns.forEach(btn => {
    btn.addEventListener('click', function() {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(tc => tc.classList.remove('active'));
        this.classList.add('active');
        document.getElementById('tab-' + this.dataset.tab).classList.add('active');
    });
});

// --- Buscadores reactivos ---
document.getElementById('searchTodas').addEventListener('input', function() {
    searchTermTodas = this.value.trim().toLowerCase();
    currentPageTodas = 1;
    renderTableCarpetas();
});
document.getElementById('searchRechazadas').addEventListener('input', function() {
    searchTermRechazadas = this.value.trim().toLowerCase();
    currentPageRechazadas = 1;
    renderTableRechazadas();
});

async function actualizarEstadoProceso() {
    const span = document.getElementById('estadoProceso');
    try {
        const resp = await fetch('/api/estado-proceso');
        const data = await resp.json();
        if (data.enEjecucion) {
            span.textContent = '🟢 En ejecución';
            span.classList.add('ejecucion');
            span.classList.remove('detenido');
        } else {
            span.textContent = '🔴 Detenido';
            span.classList.add('detenido');
            span.classList.remove('ejecucion');
        }
    } catch {
        span.textContent = '⚠️ Estado desconocido';
        span.classList.remove('ejecucion','detenido');
    }
}

// Auto-refresh cada 5 segundos
setInterval(() => {
    cargarCarpetas();
    actualizarEstadoProceso();
    renderTableCarpetas();
    renderTableRechazadas();
}, 5000);
cargarCarpetas();
actualizarEstadoProceso();
