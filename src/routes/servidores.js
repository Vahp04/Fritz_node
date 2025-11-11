import express from 'express';
import { servidoresController } from '../controllers/servidoresController.js';

const router = express.Router();

// Rutas CORREGIDAS - usar los métodos HTTP correctos
router.get('/', servidoresController.index);
router.get('/:id', servidoresController.show);
router.post('/', servidoresController.store);  
router.put('/:id', servidoresController.update); 
router.delete('/:id', servidoresController.destroy);  

router.patch('/:id/estado', servidoresController.cambiarEstado);
router.get('/sede/:sede_id', servidoresController.porSede);
router.get('/estado/:estado', servidoresController.porEstado);
router.get('/estadisticas/generales', servidoresController.estadisticas);
router.get('/buscar/q', servidoresController.buscar);

// Rutas de reportes PDF
router.get('/reporte/general', servidoresController.generarPDFGeneral);
router.get('/reporte/sede/:sede_id', servidoresController.generarPDFPorSede);

// Ruta para equipos servidores del inventario
router.get('/equipos/servidores', servidoresController.equiposServidores);



export default router;