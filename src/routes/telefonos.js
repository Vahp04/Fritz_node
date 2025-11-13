import express from 'express';
import { telefonoAsignadoController } from '../controllers/telefonoAsignadoController.js';

const router = express.Router();


router.get('/', telefonoAsignadoController.index);
router.post('/', telefonoAsignadoController.store);
router.get('/:id', telefonoAsignadoController.show);
router.put('/:id', telefonoAsignadoController.update);
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