import express from 'express';
import { tipoEquipoController } from '../controllers/tipoEquipoController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/', tipoEquipoController.index);
router.get('/:id', tipoEquipoController.show);
router.get('/api/tipo_equipo', tipoEquipoController.apiIndex);
router.get('/api/tipo_equipo/:id', tipoEquipoController.apiShow);
router.post('/', authenticateToken, tipoEquipoController.store);
router.put('/:id', authenticateToken, tipoEquipoController.update);
router.delete('/:id', authenticateToken, tipoEquipoController.destroy);

export default router;