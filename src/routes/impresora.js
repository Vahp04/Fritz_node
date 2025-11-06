import express from 'express';
import {impresoraController} from '../controllers/impresoraController.js';

const router = express.Router();

router.get('/api/impresoras', impresoraController.index);
router.get('/api/impresoras/:id', impresoraController.show);
router.post('/api/impresoras', impresoraController.store);
router.put('/api/impresoras/:id', impresoraController.update);
router.delete('/api/impresoras/:id', impresoraController.destroy);
router.put('/impresoras/:id/actualizar-contador-toner', impresoraController.actualizarContadorToner);
router.post('/api/impresoras/:id/cambiar-estado', impresoraController.cambiarEstado);
router.post('/api/impresoras/:id/instalar-toner', impresoraController.instalarToner);
router.put('/api/impresoras/:id/contador', impresoraController.actualizarContador);
router.get('/api/impresoras/sede/:sede_id', impresoraController.porSede);
router.get('/api/impresoras/estado/:estado', impresoraController.porEstado);
router.get('/api/impresoras-estadisticas/estadisticas', impresoraController.estadisticas);
router.get('/api/impresoras/buscar', impresoraController.buscar);

router.get('/api/impresoras/reporte/general', impresoraController.generarPDFGeneral);
router.get('/api/impresoras/reporte/sede/:sede_id', impresoraController.generarPDFPorSede);

export default router;