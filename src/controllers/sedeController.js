import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const sedeController = {
  async index(req, res) {
    try {
      const sedes = await prisma.sedes.findMany({
        include: {
          usuarios: {
            select: { id: true }
          }
        }
      });

      const sedesConCount = sedes.map(sede => ({
        id: sede.id,
        nombre: sede.nombre,
        ubicacion: sede.ubicacion,
        createdAt: sede.created_at,  
        updatedAt: sede.updated_at, 
        usuarios_count: sede.usuarios.length
      }));

      res.json(sedesConCount);
    } catch (error) {
      console.error('Error en index:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async store(req, res) {
    try {
      const { nombre, ubicacion } = req.body;

      const existe = await prisma.sedes.findFirst({
        where: { nombre }
      });

      if (existe) {
        return res.status(400).json({ error: 'El nombre de la sede ya existe' });
      }

      const sede = await prisma.sedes.create({
        data: { nombre, ubicacion }
      });

      const sedeConCamposMapeados = {
        id: sede.id,
        nombre: sede.nombre,
        ubicacion: sede.ubicacion,
        createdAt: sede.created_at,  
        updatedAt: sede.updated_at  
      };

      res.status(201).json({
        message: 'Sede creada exitosamente.',
        sede: sedeConCamposMapeados
      });
    } catch (error) {
      console.error('Error en store:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async show(req, res) {
    try {
      const { id } = req.params;
      const sede = await prisma.sedes.findUnique({
        where: { id: parseInt(id) },
        include: { usuarios: true }
      });

      if (!sede) {
        return res.status(404).json({ error: 'Sede no encontrada' });
      }
      
      const sedeConConteo = {
        id: sede.id,
        nombre: sede.nombre,
        ubicacion: sede.ubicacion,
        createdAt: sede.created_at,  
        updatedAt: sede.updated_at,  
        usuarios_count: sede.usuarios ? sede.usuarios.length : 0,
        usuarios: sede.usuarios
      };

      res.json(sedeConConteo);
    } catch (error) {
      console.error('Error en show:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const { nombre, ubicacion } = req.body;

      const existe = await prisma.sedes.findFirst({
        where: { 
          nombre,
          NOT: { id: parseInt(id) }
        }
      });

      if (existe) {
        return res.status(400).json({ error: 'El nombre de la sede ya existe' });
      }

      const sede = await prisma.sedes.update({
        where: { id: parseInt(id) },
        data: { nombre, ubicacion }
      });

      const sedeConCamposMapeados = {
        id: sede.id,
        nombre: sede.nombre,
        ubicacion: sede.ubicacion,
        createdAt: sede.created_at,  
        updatedAt: sede.updated_at  
      };

      res.json({
        message: 'Sede actualizada exitosamente.',
        sede: sedeConCamposMapeados
      });
    } catch (error) {
      console.error('Error en update:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async destroy(req, res) {
    try {
      const { id } = req.params;

      const usuarios = await prisma.usuarios.findMany({
        where: { sede_id: parseInt(id) }
      });

      if (usuarios.length > 0) {
        return res.status(400).json({ 
          error: 'No se puede eliminar la sede porque tiene usuarios asociados.' 
        });
      }

      await prisma.sedes.delete({
        where: { id: parseInt(id) }
      });

      res.json({ message: 'Sede eliminada exitosamente.' });
    } catch (error) {
      console.error('Error en destroy:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async getUsuarios(req, res) {
    try {
      const { id } = req.params;
      const sede = await prisma.sedes.findUnique({
        where: { id: parseInt(id) },
        include: { usuarios: true }
      });

      if (!sede) {
        return res.status(404).json({ error: 'Sede no encontrada' });
      }

      const sedeConCamposMapeados = {
        id: sede.id,
        nombre: sede.nombre,
        ubicacion: sede.ubicacion,
        createdAt: sede.created_at,  
        updatedAt: sede.updated_at,  
        usuarios_count: sede.usuarios.length
      };

      res.json({
        sede: sedeConCamposMapeados,
        usuarios: sede.usuarios
      });
    } catch (error) {
      console.error('Error en getUsuarios:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async getEstadisticas(req, res) {
    try {
      const sedes = await prisma.sedes.findMany({
        include: {
          usuarios: {
            select: { id: true }
          }
        }
      });

      const estadisticas = sedes.map(sede => ({
        id: sede.id,
        nombre: sede.nombre,
        ubicacion: sede.ubicacion,
        createdAt: sede.created_at, 
        updatedAt: sede.updated_at,  
        usuarios_count: sede.usuarios.length
      }));

      res.json({
        total_sedes: estadisticas.length,
        total_usuarios: estadisticas.reduce((sum, sede) => sum + sede.usuarios_count, 0),
        sedes: estadisticas
      });
    } catch (error) {
      console.error('Error en getEstadisticas:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async search(req, res) {
    try {
      const { query } = req.query;
      
      if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
      }

      const sedes = await prisma.sedes.findMany({
        where: {
          OR: [
            { nombre: { contains: query, mode: 'insensitive' } },
            { ubicacion: { contains: query, mode: 'insensitive' } }
          ]
        }
      });

      const sedesConCamposMapeados = sedes.map(sede => ({
        id: sede.id,
        nombre: sede.nombre,
        ubicacion: sede.ubicacion,
        createdAt: sede.created_at,  
        updatedAt: sede.updated_at   
      }));

      res.json(sedesConCamposMapeados);
    } catch (error) {
      console.error('Error en search:', error);
      res.status(500).json({ error: error.message });
    }
  }
};