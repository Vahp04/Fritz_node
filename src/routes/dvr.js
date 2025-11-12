import express from 'express';
import { dvrController } from '../controllers/dvrController.js';

const router = express.Router();

router.get('/', dvrController.index);
router.get('/:id', dvrController.show); 
router.post('/', dvrController.store);
router.put('/:id', dvrController.update);
router.delete('/:id', dvrController.destroy);
router.patch('/:id/estado', dvrController.cambiarEstado);
router.get('/sede/:sede_id', dvrController.porSede);
router.get('/estado/:estado', dvrController.porEstado);
router.get('/estadisticas/totales', dvrController.estadisticas);
router.get('/buscar/q', dvrController.buscar);
router.get('/reporte/general', dvrController.generarPDFGeneral);
router.get('/reporte/sede/:sede_id', dvrController.generarPDFPorSede);

export default router;