const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
  name: 'SmartNet Local Agent - Autoctona',
  script: path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next'),
});

svc.on('uninstall', function () {
  console.log('🗑️ Servicio desinstalado correctamente.');
});

svc.uninstall();
