import express from 'express';
import { usuarioController } from '../controllers/usuarioController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticateToken, usuarioController.index);
router.post('/', authenticateToken, usuarioController.store);
router.put('/:id', authenticateToken, usuarioController.update);
router.delete('/:id', authenticateToken, usuarioController.destroy);
router.post('/:id/toggle-status', authenticateToken, usuarioController.toggleStatus);

export default router;