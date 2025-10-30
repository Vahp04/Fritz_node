import express from 'express';
import { equipoAsignadoController } from '../controllers/equipoAsignadoController.js';

const router = express.Router();

router.get('/', equipoAsignadoController.index);
router.post('/', equipoAsignadoController.store);
router.get('/estadisticas', equipoAsignadoController.estadisticas);
router.get('/reporte', equipoAsignadoController.reporte);
router.get('/api', equipoAsignadoController.apiIndex);
router.post('/:id/devolver', equipoAsignadoController.devolver);
router.post('/:id/obsoleto', equipoAsignadoController.marcarObsoleto);
router.get('/usuario/:usuarioId', equipoAsignadoController.porUsuario);
router.get('/stock/:stockId', equipoAsignadoController.porStock);
router.get('/:id', equipoAsignadoController.show);
router.put('/:id', equipoAsignadoController.update);
router.delete('/:id', equipoAsignadoController.destroy);
router.get('/api/:id', equipoAsignadoController.apiShow);

export default router;