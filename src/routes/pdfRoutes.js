import express from 'express';
import { usuariosController } from '../controllers/usuariosController.js';
import { stockEquiposController } from '../controllers/stockEquiposController.js';
import { equipoAsignadoController } from '../controllers/equipoAsignadoController.js';

const router = express.Router();

router.get('/usuarios', usuariosController.generarPdf);
router.get('/usuarios/ver', usuariosController.verPdf);

router.get('/stock', stockEquiposController.generarPdfStock);
router.get('/stock/ver', stockEquiposController.verPdfStock);

router.get('/asignaciones', equipoAsignadoController.generarPdfAsignaciones);
router.get('/asignaciones/ver', equipoAsignadoController.verPdfAsignaciones);
router.get('/asignaciones/usuario/:usuarioId', equipoAsignadoController.generarPdfPorUsuario);
router.get('/asignaciones/usuario/:usuarioId/ver', equipoAsignadoController.verPdfPorUsuario);

router.get('/usuarios-alt', async (req, res) => {
    try {
        console.log('=== PDF ALTERNATIVO ===');
        
        const usuarios = await prisma.usuarios.findMany({
            include: {
                sede: { select: { nombre: true } },
                departamento: { select: { nombre: true } }
            },
            orderBy: { id: 'asc' }
        });

        const simpleHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Reporte Usuarios</title>
            <style>
                body { font-family: Arial; padding: 20px; }
                h1 { color: #DC2626; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #DC2626; color: white; }
            </style>
        </head>
        <body>
            <h1>FRITZ C.A - Reporte de Usuarios</h1>
            <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-ES')}</p>
            <p><strong>Total usuarios:</strong> ${usuarios.length}</p>
            
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Nombre</th>
                        <th>Cargo</th>
                        <th>Correo</th>
                        <th>Sede</th>
                    </tr>
                </thead>
                <tbody>
                    ${usuarios.map(user => `
                        <tr>
                            <td>${user.id}</td>
                            <td>${user.nombre} ${user.apellido}</td>
                            <td>${user.cargo}</td>
                            <td>${user.correo}</td>
                            <td>${user.sede?.nombre || 'N/A'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </body>
        </html>
        `;

        const pdfBuffer = await PuppeteerPDF.generatePDF(simpleHTML, {
            format: 'A4',
            landscape: false
        });

        console.log('PDF alternativo generado:', pdfBuffer.length, 'bytes');

        // Método alternativo
        res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="usuarios-alt.pdf"',
            'Content-Length': pdfBuffer.length,
            'Cache-Control': 'no-cache'
        });
        
        res.end(pdfBuffer);

    } catch (error) {
        console.error('Error en PDF alternativo:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/verificar-buffer', async (req, res) => {
    try {
        const testHTML = `
        <html>
        <body>
            <h1>Test PDF</h1>
            <p>Este es un PDF de prueba.</p>
            <p>Fecha: ${new Date().toISOString()}</p>
        </body>
        </html>
        `;

        const pdfBuffer = await PuppeteerPDF.generatePDF(testHTML);
        
        // Verificar el buffer
        console.log('Buffer type:', typeof pdfBuffer);
        console.log('Buffer length:', pdfBuffer.length);
        console.log('Is Buffer:', Buffer.isBuffer(pdfBuffer));
        console.log('First 100 bytes:', pdfBuffer.slice(0, 100).toString('hex'));

        // Verificar si es un PDF válido (debe empezar con %PDF)
        const pdfHeader = pdfBuffer.slice(0, 4).toString();
        console.log('PDF header:', pdfHeader);
        
        if (pdfHeader === '%PDF') {
            console.log('PDF válido detectado');
        } else {
            console.log('PDF inválido - header incorrecto:', pdfHeader);
        }

        res.json({
            bufferType: typeof pdfBuffer,
            bufferLength: pdfBuffer.length,
            isBuffer: Buffer.isBuffer(pdfBuffer),
            pdfHeader: pdfHeader,
            isValidPDF: pdfHeader === '%PDF'
        });

    } catch (error) {
        console.error('Error verificando buffer:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/usuarios-stream', async (req, res) => {
    try {
        console.log('=== PDF CON STREAMING ===');
        
        const usuarios = await prisma.usuarios.findMany({
            include: {
                sede: { select: { nombre: true } },
                departamento: { select: { nombre: true } }
            },
            orderBy: { id: 'asc' }
        });

        const data = {
            usuarios: usuarios,
            fechaGeneracion: new Date().toLocaleString('es-ES'),
            totalUsuarios: usuarios.length
        };

        const htmlContent = await renderTemplate(req.app, 'pdfs/usuarios', data);
        const pdfBuffer = await PuppeteerPDF.generatePDF(htmlContent);

        console.log('PDF stream generado:', pdfBuffer.length, 'bytes');

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="usuarios-stream.pdf"');
        res.setHeader('Content-Length', pdfBuffer.length);
        
        const { Readable } = require('stream');
        const stream = Readable.from(pdfBuffer);
        
        stream.pipe(res);

    } catch (error) {
        console.error('Error en PDF stream:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
});

export default router;