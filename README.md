# Microservicio RIPS - Ministerio de Salud Colombia

## Descripción
Este microservicio está diseñado para automatizar el envío de archivos RIPS (Registro Individual de Prestación de Servicios) al Ministerio de Salud de Colombia. El sistema permite la programación y ejecución automática de envíos de archivos RIPS, facilitando el cumplimiento de los requisitos regulatorios del sector salud.

## Características Principales
- 🕒 Múltiples modos de ejecución:
  - Programado (usando CRON)
  - Continuo (intervalos configurable)
  - Manual (ejecución única)
- 📊 Monitoreo y estadísticas de ejecución
- 🔄 Procesamiento automático de archivos RIPS
- ⚡ Configuración flexible mediante variables de entorno
- 🐳 Soporte para Docker
- 📝 Logs detallados de ejecución

## Requisitos Previos
- Node.js >= 14.0.0
- npm o yarn
- Docker (opcional, para ejecución en contenedor)

## Instalación

1. Clonar el repositorio:
```bash
git clone [URL_DEL_REPOSITORIO]
cd microservicio-rips-minsalud
```

2. Instalar dependencias:
```bash
npm install
```

3. Configurar variables de entorno:
Crear un archivo `.env` en la raíz del proyecto con las siguientes variables:
```env
MODO_EJECUCION=programado
CRON_SCHEDULE=0 */30 * * * *
INTERVALO_CONTINUO=30000
```

## Uso

### Modo Programado
```bash
npm run programado
```

### Modo Continuo
```bash
npm run continuo
```

### Modo Manual
```bash
npm run manual
```

### Desarrollo
```bash
npm run dev
```

### Docker
```bash
docker-compose up
```

## Scripts Disponibles
- `npm start`: Inicia el servicio en modo producción
- `npm run dev`: Inicia el servicio en modo desarrollo con nodemon
- `npm run manual`: Ejecuta el servicio en modo manual
- `npm run continuo`: Ejecuta el servicio en modo continuo
- `npm run programado`: Ejecuta el servicio en modo programado
- `npm test`: Ejecuta pruebas de configuración

## Estructura del Proyecto
```
microservicio-rips-minsalud/
├── src/
│   └── services/
│       └── MicroservicioRIPS.js
├── public/
├── build/
├── index.js
├── package.json
├── Dockerfile
└── docker-compose.yml
```

## Dependencias Principales
- dotenv: Gestión de variables de entorno
- moment: Manejo de fechas
- node-cron: Programación de tareas
- xml2js: Procesamiento de XML
- xmldom: Manipulación de DOM XML

## Contribución
1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## Licencia
Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

## Autor
LorveOne

## Soporte
Para soporte, por favor abrir un issue en el repositorio del proyecto. 