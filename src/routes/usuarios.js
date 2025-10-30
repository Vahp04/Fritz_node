import express from 'express';
import { usuariosController } from '../controllers/usuariosController.js';

const router = express.Router();

router.get('/estadisticas', usuariosController.getEstadisticas);
router.get('/search', usuariosController.search);
router.get('/sede/:sedeId', usuariosController.getBySede);
router.get('/departamento/:departamentoId', usuariosController.getByDepartamento);
router.get('/', usuariosController.index);       
router.post('/', usuariosController.store);      
router.get('/:id', usuariosController.show);     
router.put('/:id', usuariosController.update);   
router.delete('/:id', usuariosController.destroy); 

export default router;