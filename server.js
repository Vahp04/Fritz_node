// server.js
import app from './src/app.js';

const PORT = process.env.PORT || 3000;


// Iniciar el servidor
const server = app.listen(PORT, () => {
    console.log('=== FRITZ C.A - SISTEMA DE GESTIÓN ===');
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
    console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Iniciado: ${new Date().toLocaleString()}`);
    console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
    console.log(`API Base: http://localhost:${PORT}/api`);
    console.log('=====================================');
    console.log('Presiona Ctrl+C para detener el servidor');
});

// Manejo graceful de shutdown
process.on('SIGINT', () => {
    console.log('\nRecibida señal de interrupción (SIGINT)');
    console.log('Cerrando servidor gracefulmente...');
    
    server.close(() => {
        console.log('Servidor cerrado exitosamente');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n Recibida señal de terminación (SIGTERM)');
    server.close(() => {
        console.log(' Servidor cerrado exitosamente');
        process.exit(0);
    });
});

process.on('uncaughtException', (error) => {
    console.error('Error no capturado:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Promise rechazada no manejada:', reason);
    process.exit(1);
});