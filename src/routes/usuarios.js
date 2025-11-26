import express from 'express';
import multer from 'multer';

import { usuariosController } from '../controllers/usuariosController.js';

const router = express.Router();

const storage = multer.memoryStorage();

const upload = multer({
  storage: storage, 
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB límite
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || 
        file.mimetype === 'application/pdf' ||
        file.mimetype === 'application/msword' ||
        file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes, PDF y documentos Word'), false);
    }
  }
});

router.get('/estadisticas', usuariosController.getEstadisticas);
router.get('/search', usuariosController.search);
router.get('/sede/:sedeId', usuariosController.getBySede);
router.get('/departamento/:departamentoId', usuariosController.getByDepartamento);
router.get('/para-select', usuariosController.usuariosParaSelect);
router.get('/', usuariosController.index);       
router.post('/usuarios', upload.none(), usuariosController.store);     
router.get('/:id', usuariosController.show);     
router.put('/:id', upload.single('comprobante'), usuariosController.update);   
router.delete('/:id', usuariosController.destroy); 
router.get('/:id/reporte/pdf', usuariosController.generarReporteIndividual);
router.get('/:id/reporte/ver', usuariosController.verReporteIndividual);

export default router;