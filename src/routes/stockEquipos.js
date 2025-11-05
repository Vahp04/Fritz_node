import express from 'express';
import { stockEquiposController } from '../controllers/stockEquiposController.js';

const router = express.Router();

router.get('/', stockEquiposController.index);
router.post('/', stockEquiposController.store);
router.get('/resumen', stockEquiposController.resumenStock);
router.get('/stock-bajo', stockEquiposController.stockBajo);
router.get('/search', stockEquiposController.search);
router.get('/tipo/:tipoId', stockEquiposController.porTipo);
router.get('/consumibles', stockEquiposController.equiposConsumibles);
router.get('/para-asignacion', stockEquiposController.equiposParaAsignacion);
router.get('/impresoras', stockEquiposController.equiposImpresoras);
router.get('/mikrotiks', stockEquiposController.equiposMikrotiks);
router.get('/api', stockEquiposController.apiIndex);
router.get('/:id', stockEquiposController.show);
router.put('/:id', stockEquiposController.update);
router.delete('/:id', stockEquiposController.destroy);
router.patch('/:id/cantidades', stockEquiposController.actualizarCantidades);
router.get('/api/:id', stockEquiposController.apiShow);
router.get('/consumibles', stockEquiposController.equiposConsumibles);
export default router;