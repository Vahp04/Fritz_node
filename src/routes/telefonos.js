import express from 'express';
import multer from 'multer';
import { telefonoAsignadoController } from '../controllers/telefonoAsignadoController.js';

const router = express.Router();

// Configuración de multer para subida de imágenes
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
router.get('/', telefonoAsignadoController.index);
router.post('/', telefonoAsignadoController.store);
router.get('/:id', telefonoAsignadoController.show);
router.put('/:id', upload.single('imagen_comprobante'), telefonoAsignadoController.update); 
router.delete('/:id', telefonoAsignadoController.destroy);

router.get('/usuario/:usuarioId', telefonoAsignadoController.porUsuario);
router.get('/stock/:stockId', telefonoAsignadoController.porStock);
router.get('/reporte/general', telefonoAsignadoController.reporte);
router.get('/estadisticas/general', telefonoAsignadoController.estadisticas);

router.get('/api/todos', telefonoAsignadoController.apiIndex);
router.get('/api/:id', telefonoAsignadoController.apiShow);

router.get('/pdf/usuario/:usuarioId', telefonoAsignadoController.generarPDFPorUsuario);
router.get('/pdf/general', telefonoAsignadoController.generarPDFGeneral);
router.post('/:id/devolver', telefonoAsignadoController.devolverTelefono);

export default router;