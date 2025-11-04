import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const mikrotikController = {

  // Obtener todos los mikrotik
async index(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Obtener total de registros
    const totalRecords = await prisma.mikrotik.count();

    const mikrotiks = await prisma.mikrotik.findMany({
      include: {
        stock_equipos: {
          include: {
            tipo_equipo: true
          }
        },
        sede: true
      },
      orderBy: {
        id: 'asc'
      },
      skip: skip,
      take: limit
    });

    const totalPages = Math.ceil(totalRecords / limit);

    res.json({
      mikrotiks: mikrotiks,
      pagination: {
        current: page,
        total: totalPages,
        totalRecords: totalRecords
      }
    });
  } catch (error) {
    console.error('Error en index:', error);
    res.status(500).json({ error: error.message });
  }
},

async show(req, res) {
  try {
    const { id } = req.params;
    const mikrotikId = parseInt(id); 

    const mikrotik = await prisma.mikrotik.findUnique({
      where: { id: mikrotikId }, 
      include: {
        stock_equipos: {
          include: {
            tipo_equipo: true
          }
        },
        sede: true
      }
    });

    if (!mikrotik) {
      return res.status(404).json({ error: 'Mikrotik no encontrado' });
    }

    res.json(mikrotik);
  } catch (error) {
    console.error('Error en show:', error);
    res.status(500).json({ error: error.message });
  }
},

async store(req, res) {
  try {
    const { 
      stock_equipos_id,
      descripcion, 
      sede_id, 
      ubicacion, 
      ip_mikrotik,
      cereal_mikrotik,
      estado 
    } = req.body;

    console.log('📝 Datos recibidos para crear mikrotik:', req.body);

    const stockEquiposId = parseInt(stock_equipos_id);
    const sedeId = parseInt(sede_id);

    // Verificar que el mikrotik existe en inventario
    const mikrotikStock = await prisma.stock_equipos.findUnique({
      where: { id: stockEquiposId }, 
      include: { tipo_equipo: true }
    });

    if (!mikrotikStock) {
      return res.status(404).json({ error: 'Equipo no encontrado en inventario' });
    }

    if (mikrotikStock.cantidad_disponible <= 0) {
      return res.status(400).json({ error: 'No hay stock disponible para este equipo' });
    }

    // Verificar que no existe ya un mikrotik con este stock_equipos_id
    const mikrotikExistente = await prisma.mikrotik.findUnique({
      where: { stock_equipos_id: stockEquiposId } 
    });

    if (mikrotikExistente) {
      return res.status(400).json({ error: 'Ya existe un mikrotik configurado para este equipo' });
    }

    // Crear el mikrotik usando transacción
    const resultado = await prisma.$transaction(async (tx) => {
      // Crear registro de mikrotik
      const mikrotik = await tx.mikrotik.create({
        data: {
          stock_equipos_id: stockEquiposId, 
          descripcion,
          sede_id: sedeId, 
          ubicacion,
          ip_mikrotik,
          cereal_mikrotik,
          estado: estado || 'activo'
        }
      });

      // Actualizar stock del equipo
      await tx.stock_equipos.update({
        where: { id: stockEquiposId }, 
        data: {
          cantidad_disponible: { decrement: 1 },
          cantidad_asignada: { increment: 1 }
        }
      });

      return mikrotik;
    });

    res.status(201).json({
      message: 'Mikrotik activado exitosamente',
      mikrotik: resultado
    });

  } catch (error) {
    console.error('Error en store:', error);
    res.status(500).json({ error: error.message });
  }
},

 async update(req, res) {
  try {
    const { id } = req.params;
    const { 
      descripcion, 
      sede_id, 
      ubicacion, 
      ip_mikrotik,
      cereal_mikrotik,
      estado 
    } = req.body;

    // ✅ Convertir IDs a números
    const mikrotikId = parseInt(id);
    const sedeId = sede_id ? parseInt(sede_id) : undefined;

    const mikrotik = await prisma.mikrotik.findUnique({
      where: { id: mikrotikId } // ✅ Usar número
    });

    if (!mikrotik) {
      return res.status(404).json({ error: 'Mikrotik no encontrado' });
    }

    const mikrotikActualizado = await prisma.mikrotik.update({
      where: { id: mikrotikId }, // ✅ Usar número
      data: {
        descripcion,
        sede_id: sedeId, // ✅ Ya convertido
        ubicacion,
        ip_mikrotik,
        cereal_mikrotik,
        estado,
        updated_at: new Date()
      },
      include: {
        stock_equipos: {
          include: {
            tipo_equipo: true
          }
        },
        sede: true
      }
    });

    res.json({
      message: 'Mikrotik actualizado exitosamente',
      mikrotik: mikrotikActualizado
    });

  } catch (error) {
    console.error('Error en update:', error);
    res.status(500).json({ error: error.message });
  }
},

  // Eliminar mikrotik (desactivar)
  async destroy(req, res) {
    try {
      const { id } = req.params;

      const mikrotik = await prisma.mikrotik.findUnique({
        where: { id: parseInt(id) }
      });

      if (!mikrotik) {
        return res.status(404).json({ error: 'Mikrotik no encontrado' });
      }

      // Usar transacción para asegurar consistencia
      await prisma.$transaction(async (tx) => {
        // Liberar stock del equipo
        await tx.stock_equipos.update({
          where: { id: mikrotik.stock_equipos_id },
          data: {
            cantidad_disponible: { increment: 1 },
            cantidad_asignada: { decrement: 1 }
          }
        });

        // Eliminar el mikrotik
        await tx.mikrotik.delete({
          where: { id: parseInt(id) }
        });
      });

      res.json({ message: 'Mikrotik eliminado exitosamente' });

    } catch (error) {
      console.error('Error en destroy:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Cambiar estado del mikrotik
  async cambiarEstado(req, res) {
    try {
      const { id } = req.params;
      const { estado } = req.body;

      const estadosPermitidos = ['activo', 'inactivo', 'mantenimiento', 'desuso'];
      
      if (!estadosPermitidos.includes(estado)) {
        return res.status(400).json({ 
          error: 'Estado no válido', 
          estados_permitidos: estadosPermitidos 
        });
      }

      const mikrotik = await prisma.mikrotik.findUnique({
        where: { id: parseInt(id) }
      });

      if (!mikrotik) {
        return res.status(404).json({ error: 'Mikrotik no encontrado' });
      }

      const mikrotikActualizado = await prisma.mikrotik.update({
        where: { id: parseInt(id) },
        data: { 
          estado,
          updated_at: new Date()
        },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true
        }
      });

      res.json({
        message: `Estado del mikrotik cambiado a ${estado}`,
        mikrotik: mikrotikActualizado
      });

    } catch (error) {
      console.error('Error en cambiarEstado:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Obtener mikrotiks por sede
  async porSede(req, res) {
    try {
      const { sede_id } = req.params;

      const mikrotiks = await prisma.mikrotik.findMany({
        where: { sede_id: parseInt(sede_id) },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      });

      res.json(mikrotiks);
    } catch (error) {
      console.error('Error en porSede:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Obtener mikrotiks por estado
  async porEstado(req, res) {
    try {
      const { estado } = req.params;

      const estadosPermitidos = ['activo', 'inactivo', 'mantenimiento', 'desuso'];
      
      if (!estadosPermitidos.includes(estado)) {
        return res.status(400).json({ 
          error: 'Estado no válido', 
          estados_permitidos: estadosPermitidos 
        });
      }

      const mikrotiks = await prisma.mikrotik.findMany({
        where: { estado },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true
        },
        orderBy: {
          id: 'asc'
        }
      });

      res.json(mikrotiks);
    } catch (error) {
      console.error('Error en porEstado:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Obtener estadísticas de mikrotiks
  async estadisticas(req, res) {
    try {
      const totalMikrotiks = await prisma.mikrotik.count();
      
      const mikrotiksPorEstado = await prisma.mikrotik.groupBy({
        by: ['estado'],
        _count: {
          id: true
        }
      });

      const mikrotiksPorSede = await prisma.mikrotik.groupBy({
        by: ['sede_id'],
        _count: {
          id: true
        }
      });

      // Obtener nombres de sedes
      const sedes = await prisma.sedes.findMany({
        where: {
          id: {
            in: mikrotiksPorSede.map(item => item.sede_id)
          }
        }
      });

      const estadisticasPorSede = mikrotiksPorSede.map(item => {
        const sede = sedes.find(s => s.id === item.sede_id);
        return {
          sede_id: item.sede_id,
          sede_nombre: sede ? sede.nombre : 'Desconocida',
          cantidad: item._count.id
        };
      });

      res.json({
        total_mikrotiks: totalMikrotiks,
        por_estado: mikrotiksPorEstado.map(item => ({
          estado: item.estado,
          cantidad: item._count.id
        })),
        por_sede: estadisticasPorSede
      });

    } catch (error) {
      console.error('Error en estadisticas:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Buscar mikrotiks por IP o descripción
  async buscar(req, res) {
    try {
      const { q } = req.query;

      if (!q) {
        return res.status(400).json({ error: 'Término de búsqueda requerido' });
      }

      const mikrotiks = await prisma.mikrotik.findMany({
        where: {
          OR: [
            { ip_mikrotik: { contains: q, mode: 'insensitive' } },
            { descripcion: { contains: q, mode: 'insensitive' } },
            { cereal_mikrotik: { contains: q, mode: 'insensitive' } },
            { ubicacion: { contains: q, mode: 'insensitive' } }
          ]
        },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true
        },
        orderBy: {
          id: 'asc'
        }
      });

      res.json(mikrotiks);
    } catch (error) {
      console.error('Error en buscar:', error);
      res.status(500).json({ error: error.message });
    }
  }
};