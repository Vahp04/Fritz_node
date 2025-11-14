import express from 'express';
import multer from 'multer';
import { equipoAsignadoController } from '../controllers/equipoAsignadoController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB límite
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'), false);
    }
  }
});

router.get('/', authenticateToken, equipoAsignadoController.index);
router.post('/', authenticateToken, equipoAsignadoController.store);
router.get('/estadisticas', authenticateToken, equipoAsignadoController.estadisticas);
router.get('/reporte', authenticateToken, equipoAsignadoController.reporte);
router.get('/api', authenticateToken, equipoAsignadoController.apiIndex);
router.post('/:id/devolver', authenticateToken, equipoAsignadoController.devolver);
router.post('/:id/obsoleto', authenticateToken, equipoAsignadoController.marcarObsoleto);
router.post('/:id/reactivar', authenticateToken,equipoAsignadoController.reactivar);
router.get('/usuario/:usuarioId', authenticateToken, equipoAsignadoController.porUsuario);
router.get('/stock/:stockId', authenticateToken, equipoAsignadoController.porStock);
router.get('/:id', authenticateToken, equipoAsignadoController.show);
router.put('/:id', upload.single('imagen_comprobante'), authenticateToken, equipoAsignadoController.update)
router.delete('/:id', authenticateToken, equipoAsignadoController.destroy);
router.get('/api/:id', authenticateToken, equipoAsignadoController.apiShow);

export default router;