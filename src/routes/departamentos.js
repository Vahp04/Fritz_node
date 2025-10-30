import express from 'express';
import { departamentoController } from '../controllers/departamentoController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/', departamentoController.index);
router.get('/:id', departamentoController.show);
router.get('/:id/usuarios', departamentoController.getUsuarios);
router.post('/', authenticateToken, departamentoController.store);
router.put('/:id', authenticateToken, departamentoController.update);
router.delete('/:id', authenticateToken, departamentoController.destroy);

export default router;