import express from 'express';
import { usuariosController } from '../controllers/usuariosController.js';

const router = express.Router();

router.get('/estadisticas', usuariosController.getEstadisticas);
router.get('/search', usuariosController.search);
router.get('/sede/:sedeId', usuariosController.getBySede);
router.get('/departamento/:departamentoId', usuariosController.getByDepartamento);
router.get('/para-select', usuariosController.usuariosParaSelect);
router.get('/', usuariosController.index);       
router.post('/', usuariosController.store);      
router.get('/:id', usuariosController.show);     
router.put('/:id', usuariosController.update);   
router.delete('/:id', usuariosController.destroy); 
router.get('/:id/reporte/pdf', usuariosController.generarReporteIndividual);
router.get('/:id/reporte/ver', usuariosController.verReporteIndividual);

export default router;