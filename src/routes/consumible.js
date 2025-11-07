import express from 'express';
import { consumibleController } from '../controllers/consumibleController.js';

const router = express.Router();

router.get('/sedes/:sede_id', consumibleController.porSede);
router.get('/departamentos/:departamento_id', consumibleController.porDepartamento);
router.get('/buscar', consumibleController.buscar);
router.get('/stats/estadisticas', consumibleController.estadisticas);
router.get('/recientes', consumibleController.consumiblesRecientes);
router.get('/orden-salida/:consumible_id/:sede_origen_id', consumibleController.generarPDFOrdenSalida);
router.get('/', consumibleController.index);
router.get('/:id', consumibleController.show);
router.post('/', consumibleController.store);
router.put('/:id', consumibleController.update);
router.delete('/:id', consumibleController.destroy);

export default router;