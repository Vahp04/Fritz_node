import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const tipoEquipoController = {
   async index(req, res) {
    try {
      console.log(' Cargando tipos de equipo...');
      const { page = 1, limit = 10, all = false } = req.query;
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      if (all === 'true') {
        const tiposEquipo = await prisma.tipo_equipo.findMany({
          orderBy: { id: 'asc' }
        });

        console.log(` ${tiposEquipo.length} tipos encontrados`);

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
                requiere_cereal: tipo.requiere_cereal,
                createdAt: tipo.created_at,
                updatedAt: tipo.updated_at,
                stock_count: stockCount
              };
            } catch (error) {
              console.error(`Error contando stock para tipo ${tipo.id}:`, error);
              return {
                id: tipo.id,
                nombre: tipo.nombre,
                descripcion: tipo.descripcion,
                requiere_ip: tipo.requiere_ip,
                requiere_cereal: tipo.requiere_cereal,
                createdAt: tipo.created_at,
                updatedAt: tipo.updated_at,
                stock_count: 0
              };
            }
          })
        );

        return res.json(tiposConConteo);
      }

      const [tiposEquipo, totalCount] = await Promise.all([
        prisma.tipo_equipo.findMany({
          orderBy: { id: 'asc' },
          skip: skip,
          take: limitNum
        }),
        prisma.tipo_equipo.count()
      ]);

      console.log(` ${tiposEquipo.length} tipos encontrados (página ${pageNum})`);

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
              requiere_cereal: tipo.requiere_cereal,
              createdAt: tipo.created_at,
              updatedAt: tipo.updated_at,
              stock_count: stockCount
            };
          } catch (error) {
            console.error(`Error contando stock para tipo ${tipo.id}:`, error);
            return {
              id: tipo.id,
              nombre: tipo.nombre,
              descripcion: tipo.descripcion,
              requiere_ip: tipo.requiere_ip,
              requiere_cereal: tipo.requiere_cereal,
              createdAt: tipo.created_at,
              updatedAt: tipo.updated_at,
              stock_count: 0
            };
          }
        })
      );

      const totalPages = Math.ceil(totalCount / limitNum);

      res.json({
        tiposEquipo: tiposConConteo,
        pagination: {
          currentPage: pageNum,
          totalPages: totalPages,
          totalItems: totalCount,
          itemsPerPage: limitNum,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1
        }
      });
    } catch (error) {
      console.error(' ERROR en index:', error);
      res.status(500).json({ error: 'Error al cargar tipos de equipo: ' + error.message });
    }
  },

  async store(req, res) {
    try {
      const { nombre, descripcion, requiere_ip, requiere_cereal } = req.body; 

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
          requiere_ip: requiere_ip === 'true' || requiere_ip === true || requiere_ip === '1',
          requiere_cereal: requiere_cereal === 'true' || requiere_cereal === true || requiere_cereal === '1' 
        }
      });

      const tipoEquipoConCamposMapeados = {
        id: tipoEquipo.id,
        nombre: tipoEquipo.nombre,
        descripcion: tipoEquipo.descripcion,
        requiere_ip: tipoEquipo.requiere_ip,
        requiere_cereal: tipoEquipo.requiere_cereal, 
        createdAt: tipoEquipo.created_at,  
        updatedAt: tipoEquipo.updated_at   
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
      console.log(` Cargando tipo de equipo ID: ${id}`);
      
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
        requiere_cereal: tipoEquipo.requiere_cereal, 
        createdAt: tipoEquipo.created_at, 
        updatedAt: tipoEquipo.updated_at,  
        stock_count: stockCount
      };

      console.log(` Tipo cargado: ${tipoConConteo.nombre} con ${stockCount} equipos`);
      res.json(tipoConConteo);
    } catch (error) {
      console.error('Error en show:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const { nombre, descripcion, requiere_ip, requiere_cereal } = req.body; 

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
          requiere_ip: requiere_ip === 'true' || requiere_ip === true || requiere_ip === '1',
          requiere_cereal: requiere_cereal === 'true' || requiere_cereal === true || requiere_cereal === '1' 
        }
      });

      const tipoEquipoConCamposMapeados = {
        id: tipoEquipo.id,
        nombre: tipoEquipo.nombre,
        descripcion: tipoEquipo.descripcion,
        requiere_ip: tipoEquipo.requiere_ip,
        requiere_cereal: tipoEquipo.requiere_cereal, 
        createdAt: tipoEquipo.created_at,  
        updatedAt: tipoEquipo.updated_at   
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
      console.log(' Cargando tipos de equipo (API)...');
      
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
            requiere_cereal: tipo.requiere_cereal, 
            createdAt: tipo.created_at,  
            updatedAt: tipo.updated_at,  
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
        requiere_cereal: tipoEquipo.requiere_cereal, 
        createdAt: tipoEquipo.created_at,  
        updatedAt: tipoEquipo.updated_at,  
        stock_count: stockCount
      };

      res.json(tipoConConteo);
    } catch (error) {
      console.error('Error en apiShow:', error);
      res.status(500).json({ error: error.message });
    }
  },
  
  async getTiposConCereal(req, res) {
    try {
      console.log(' Cargando tipos de equipo que requieren cereal...');
      
      const tiposEquipo = await prisma.tipo_equipo.findMany({
        where: { 
          requiere_cereal: true 
        },
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
            requiere_cereal: tipo.requiere_cereal,
            createdAt: tipo.created_at,
            updatedAt: tipo.updated_at,
            stock_count: stockCount
          };
        })
      );

      console.log(` ${tiposConConteo.length} tipos con cereal encontrados`);
      res.json(tiposConConteo);
    } catch (error) {
      console.error('Error en getTiposConCereal:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async getTiposConIP(req, res) {
    try {
      console.log(' Cargando tipos de equipo que requieren IP...');
      
      const tiposEquipo = await prisma.tipo_equipo.findMany({
        where: { 
          requiere_ip: true 
        },
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
            requiere_cereal: tipo.requiere_cereal,
            createdAt: tipo.created_at,
            updatedAt: tipo.updated_at,
            stock_count: stockCount
          };
        })
      );

      console.log(` ${tiposConConteo.length} tipos con IP encontrados`);
      res.json(tiposConConteo);
    } catch (error) {
      console.error('Error en getTiposConIP:', error);
      res.status(500).json({ error: error.message });
    }
  }
};