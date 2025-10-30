import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const tipoEquipoController = {
  async index(req, res) {
    try {
      console.log('🔍 Cargando tipos de equipo...');
      
      const tiposEquipo = await prisma.tipo_equipo.findMany({
        orderBy: { id: 'asc' }
      });

      console.log(`✅ ${tiposEquipo.length} tipos encontrados`);

      const tiposConConteo = await Promise.all(
        tiposEquipo.map(async (tipo) => {
          try {
            const stockCount = await prisma.stock_equipos.count({
              where: { tipo_equipo_id: tipo.id }
            });
            
            return {
              id: tipo.id,
              nombre: tipo.nombre,
              descripcion: tipo.descripcion,
              requiere_ip: tipo.requiere_ip,
              // Mapear los campos con guión bajo a camelCase para el frontend
              createdAt: tipo.created_at,  // Cambiado de created_at a createdAt
              updatedAt: tipo.updated_at,  // Cambiado de updated_at a updatedAt
              stock_count: stockCount
            };
          } catch (error) {
            console.error(`Error contando stock para tipo ${tipo.id}:`, error);
            return {
              id: tipo.id,
              nombre: tipo.nombre,
              descripcion: tipo.descripcion,
              requiere_ip: tipo.requiere_ip,
              createdAt: tipo.created_at,  // Mapear a camelCase
              updatedAt: tipo.updated_at,  // Mapear a camelCase
              stock_count: 0
            };
          }
        })
      );

      res.json(tiposConConteo);
    } catch (error) {
      console.error('❌ ERROR en index:', error);
      res.status(500).json({ error: 'Error al cargar tipos de equipo: ' + error.message });
    }
  },

  async store(req, res) {
    try {
      const { nombre, descripcion, requiere_ip } = req.body;

      const existe = await prisma.tipo_equipo.findFirst({
        where: { nombre }
      });

      if (existe) {
        return res.status(400).json({ error: 'El nombre del tipo de equipo ya existe' });
      }

      const tipoEquipo = await prisma.tipo_equipo.create({
        data: {
          nombre,
          descripcion,
          requiere_ip: requiere_ip === 'true' || requiere_ip === true || requiere_ip === '1'
        }
      });

      // Mapear los campos de fecha
      const tipoEquipoConCamposMapeados = {
        id: tipoEquipo.id,
        nombre: tipoEquipo.nombre,
        descripcion: tipoEquipo.descripcion,
        requiere_ip: tipoEquipo.requiere_ip,
        createdAt: tipoEquipo.created_at,  // Mapear a camelCase
        updatedAt: tipoEquipo.updated_at   // Mapear a camelCase
      };

      res.status(201).json({
        message: 'Tipo de equipo creado exitosamente.',
        tipoEquipo: tipoEquipoConCamposMapeados
      });
    } catch (error) {
      console.error('Error en store:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async show(req, res) {
    try {
      const { id } = req.params;
      console.log(`🔍 Cargando tipo de equipo ID: ${id}`);
      
      const tipoEquipo = await prisma.tipo_equipo.findUnique({
        where: { id: parseInt(id) }
      });

      if (!tipoEquipo) {
        return res.status(404).json({ error: 'Tipo de equipo no encontrado' });
      }

      const stockCount = await prisma.stock_equipos.count({
        where: { tipo_equipo_id: parseInt(id) }
      });

      const tipoConConteo = {
        id: tipoEquipo.id,
        nombre: tipoEquipo.nombre,
        descripcion: tipoEquipo.descripcion,
        requiere_ip: tipoEquipo.requiere_ip,
        // Mapear los campos de fecha
        createdAt: tipoEquipo.created_at,  // Mapear a camelCase
        updatedAt: tipoEquipo.updated_at,  // Mapear a camelCase
        stock_count: stockCount
      };

      console.log(`✅ Tipo cargado: ${tipoConConteo.nombre} con ${stockCount} equipos`);
      res.json(tipoConConteo);
    } catch (error) {
      console.error('Error en show:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const { nombre, descripcion, requiere_ip } = req.body;

      const existe = await prisma.tipo_equipo.findFirst({
        where: { 
          nombre,
          NOT: { id: parseInt(id) }
        }
      });

      if (existe) {
        return res.status(400).json({ error: 'El nombre del tipo de equipo ya existe' });
      }

      const tipoEquipo = await prisma.tipo_equipo.update({
        where: { id: parseInt(id) },
        data: {
          nombre,
          descripcion,
          requiere_ip: requiere_ip === 'true' || requiere_ip === true || requiere_ip === '1'
        }
      });

      // Mapear los campos de fecha
      const tipoEquipoConCamposMapeados = {
        id: tipoEquipo.id,
        nombre: tipoEquipo.nombre,
        descripcion: tipoEquipo.descripcion,
        requiere_ip: tipoEquipo.requiere_ip,
        createdAt: tipoEquipo.created_at,  // Mapear a camelCase
        updatedAt: tipoEquipo.updated_at   // Mapear a camelCase
      };

      res.json({
        message: 'Tipo de equipo actualizado exitosamente.',
        tipoEquipo: tipoEquipoConCamposMapeados
      });
    } catch (error) {
      console.error('Error en update:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async destroy(req, res) {
    try {
      const { id } = req.params;

      const stockEquipos = await prisma.stock_equipos.count({
        where: { tipo_equipo_id: parseInt(id) }
      });

      if (stockEquipos > 0) {
        return res.status(400).json({ 
          error: 'No se puede eliminar el tipo de equipo porque tiene equipos en stock asociados.' 
        });
      }

      await prisma.tipo_equipo.delete({
        where: { id: parseInt(id) }
      });

      res.json({ message: 'Tipo de equipo eliminado exitosamente.' });
    } catch (error) {
      console.error('Error en destroy:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async apiIndex(req, res) {
    try {
      console.log('🔍 Cargando tipos de equipo (API)...');
      
      const tiposEquipo = await prisma.tipo_equipo.findMany({
        orderBy: { id: 'asc' }
      });

      const tiposConConteo = await Promise.all(
        tiposEquipo.map(async (tipo) => {
          const stockCount = await prisma.stock_equipos.count({
            where: { tipo_equipo_id: tipo.id }
          });
          
          return {
            id: tipo.id,
            nombre: tipo.nombre,
            descripcion: tipo.descripcion,
            requiere_ip: tipo.requiere_ip,
            // Mapear los campos de fecha
            createdAt: tipo.created_at,  // Mapear a camelCase
            updatedAt: tipo.updated_at,  // Mapear a camelCase
            stock_count: stockCount
          };
        })
      );

      res.json(tiposConConteo);
    } catch (error) {
      console.error('Error en apiIndex:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async apiShow(req, res) {
    try {
      const { id } = req.params;
      
      const tipoEquipo = await prisma.tipo_equipo.findUnique({
        where: { id: parseInt(id) }
      });

      if (!tipoEquipo) {
        return res.status(404).json({ error: 'Tipo de equipo no encontrado' });
      }

      const stockCount = await prisma.stock_equipos.count({
        where: { tipo_equipo_id: parseInt(id) }
      });

      const tipoConConteo = {
        id: tipoEquipo.id,
        nombre: tipoEquipo.nombre,
        descripcion: tipoEquipo.descripcion,
        requiere_ip: tipoEquipo.requiere_ip,
        // Mapear los campos de fecha
        createdAt: tipoEquipo.created_at,  // Mapear a camelCase
        updatedAt: tipoEquipo.updated_at,  // Mapear a camelCase
        stock_count: stockCount
      };

      res.json(tipoConConteo);
    } catch (error) {
      console.error('Error en apiShow:', error);
      res.status(500).json({ error: error.message });
    }
  }
};