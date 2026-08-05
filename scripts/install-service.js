const Service = require('node-windows').Service;
const path = require('path');

// Configure the Windows Service using custom server.js
const svc = new Service({
  name: 'SmartNet Local Agent - Autoctona',
  description: 'Agente local de lectura para los dashboards de Cocina que Reconforta',
  script: path.join(__dirname, '..', 'server.js'),
  workingDirectory: path.join(__dirname, '..'),
  env: [
    {
      name: 'NODE_ENV',
      value: 'production',
    },
    {
      name: 'PORT',
      value: '3000',
    },
  ],
});

svc.on('install', function () {
  console.log('✅ Servicio "SmartNet Local Agent - Autoctona" instalado correctamente.');
  console.log('🚀 Iniciando servicio...');
  svc.start();
});

svc.on('alreadyinstalled', function () {
  console.log('⚠️ El servicio ya se encuentra instalado en este sistema.');
});

svc.install();
