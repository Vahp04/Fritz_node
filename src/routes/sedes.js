import express from 'express';
import { sedeController } from '../controllers/sedeController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/', sedeController.index);
router.get('/:id', sedeController.show);
router.get('/:id/usuarios', sedeController.getUsuarios);
router.get('/estadisticas/data', sedeController.getEstadisticas);
router.get('/search/query', sedeController.search);
router.post('/', authenticateToken, sedeController.store);
router.put('/:id', authenticateToken, sedeController.update);
router.delete('/:id', authenticateToken, sedeController.destroy);

export default router;