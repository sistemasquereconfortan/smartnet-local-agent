const Service = require('node-windows').Service;
const path = require('path');

// Configure the Windows Service
const svc = new Service({
  name: 'SmartNet Local Agent - Autoctona',
  description: 'Agente local de lectura para los dashboards de Cocina que Reconforta',
  script: path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next'),
  scriptArgs: ['start', '-p', '3000'],
  workingDirectory: path.join(__dirname, '..'),
  env: [
    {
      name: 'NODE_ENV',
      value: 'production',
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
