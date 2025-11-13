import express from 'express';
import { stockEquiposController } from '../controllers/stockEquiposController.js';

const router = express.Router();

router.get('/resumen', stockEquiposController.resumenStock);
router.get('/stock-bajo', stockEquiposController.stockBajo);
router.get('/search', stockEquiposController.search);
router.get('/tipo/:tipoId', stockEquiposController.porTipo);
router.get('/consumibles', stockEquiposController.equiposConsumibles);
router.get('/para-asignacion', stockEquiposController.equiposParaAsignacion);
router.get('/impresoras', stockEquiposController.equiposImpresoras);
router.get('/mikrotiks', stockEquiposController.equiposMikrotiks);
router.get('/toners/todos', stockEquiposController.todosLosToners);
router.get('/servidores', stockEquiposController.servidores);
router.get('/dvrs', stockEquiposController.getDvrs);
router.get('/equipos/dvr', stockEquiposController.equiposDvr);
router.get('/para-telefonos-completo', stockEquiposController.equiposParaTelefonosCompleto); 

router.get('/api', stockEquiposController.apiIndex);
router.get('/api/:id', stockEquiposController.apiShow);

router.get('/', stockEquiposController.index);
router.post('/', stockEquiposController.store);
router.get('/:id', stockEquiposController.show);
router.put('/:id', stockEquiposController.update);
router.delete('/:id', stockEquiposController.destroy);
router.patch('/:id/cantidades', stockEquiposController.actualizarCantidades);

export default router;