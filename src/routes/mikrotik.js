import express from 'express';
import { mikrotikController } from '../controllers/mikrotikController.js';

const router = express.Router();

// Rutas para Mikrotiks
router.get('/mikrotiks', mikrotikController.index);
router.get('/mikrotiks/:id', mikrotikController.show);
router.post('/mikrotiks', mikrotikController.store);
router.put('/mikrotiks/:id', mikrotikController.update);
router.delete('/mikrotiks/:id', mikrotikController.destroy);

// Rutas específicas
router.put('/mikrotiks/:id/estado', mikrotikController.cambiarEstado);
router.get('/mikrotiks/sede/:sede_id', mikrotikController.porSede);
router.get('/mikrotiks/estado/:estado', mikrotikController.porEstado);
router.get('/mikrotiks/estadisticas/estadisticas', mikrotikController.estadisticas);
router.get('/mikrotiks/buscar', mikrotikController.buscar);

export default router;