import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const consumibleController = {

   async index(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const search = req.query.search || '';

      let where = {};

      if (search) {
        where = {
          OR: [
            { nombre: { contains: search, mode: 'insensitive' } },
            { detalles: { contains: search, mode: 'insensitive' } }
          ]
        };
      }

      const totalRecords = await prisma.consumible.count({ where });

      const consumibles = await prisma.consumible.findMany({
        where,
        skip,
        take: limit,
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true
        },
        orderBy: {
          id: 'asc'
        }
      });

      const totalPages = Math.ceil(totalRecords / limit);

      res.json({
        consumibles: consumibles,
        pagination: {
          current: page,
          total: totalPages,
          totalRecords: totalRecords
        }
      });
    } catch (error) {
      console.error('Error en index consumibles:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async show(req, res) {
    try {
      const { id } = req.params;
      const consumibleId = parseInt(id);

      const consumible = await prisma.consumible.findUnique({
        where: { id: consumibleId },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true
        }
      });

      if (!consumible) {
        return res.status(404).json({ error: 'Consumible no encontrado' });
      }

      res.json(consumible);
    } catch (error) {
      console.error('Error en show consumible:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async store(req, res) {
    try {
      const {
        nombre,
        sede_id,
        departamento_id,
        fecha_enviado,
        detalles,
        equipos,
        cantidad_total
      } = req.body;

      console.log('📝 Datos recibidos para crear consumible:', req.body);

      const sedeId = parseInt(sede_id);
      const departamentoId = parseInt(departamento_id);

      // Validaciones básicas
      if (!equipos || !Array.isArray(equipos) || equipos.length === 0) {
        return res.status(400).json({ error: 'Debe seleccionar al menos un equipo' });
      }

      // Validar que la sede existe
      const sede = await prisma.sedes.findUnique({
        where: { id: sedeId }
      });

      if (!sede) {
        return res.status(404).json({ error: 'Sede no encontrada' });
      }

      // Validar que el departamento existe
      const departamento = await prisma.departamentos.findUnique({
        where: { id: departamentoId }
      });

      if (!departamento) {
        return res.status(404).json({ error: 'Departamento no encontrado' });
      }

      const resultados = await prisma.$transaction(async (tx) => {
        const consumiblesCreados = [];

        // Crear un consumible por cada equipo
        for (const equipo of equipos) {
          const stockEquiposId = parseInt(equipo.stock_equipos_id);
          const cantidadValue = parseInt(equipo.cantidad);

          // Validar que el equipo de stock existe
          const stockEquipo = await tx.stock_equipos.findUnique({
            where: { id: stockEquiposId }
          });

          if (!stockEquipo) {
            throw new Error(`Equipo con ID ${stockEquiposId} no encontrado en inventario`);
          }

          // Validar que hay suficiente stock disponible
          if (stockEquipo.cantidad_disponible < cantidadValue) {
            throw new Error(`Stock insuficiente para ${stockEquipo.marca} ${stockEquipo.modelo}. Disponible: ${stockEquipo.cantidad_disponible}, Solicitado: ${cantidadValue}`);
          }

          // Crear el consumible
          const consumible = await tx.consumible.create({
            data: {
              nombre: `${nombre} - ${stockEquipo.marca} ${stockEquipo.modelo}`,
              stock_equipos_id: stockEquiposId,
              sede_id: sedeId,
              cantidad: cantidadValue,
              departamento_id: departamentoId,
              fecha_enviado: new Date(fecha_enviado),
              detalles: detalles || `Consumible: ${stockEquipo.marca} ${stockEquipo.modelo}`
            },
            include: {
              stock_equipos: {
                include: {
                  tipo_equipo: true
                }
              },
              sede: true,
              departamento: true
            }
          });

          // ✅ SOLO RESTAR DEL STOCK DISPONIBLE - NO TOCAR CANTIDAD_ASIGNADA
          await tx.stock_equipos.update({
            where: { id: stockEquiposId },
            data: {
              cantidad_disponible: { decrement: cantidadValue }
              // Se elimina completamente la línea de cantidad_asignada
            }
          });

          consumiblesCreados.push(consumible);
        }

        return consumiblesCreados;
      });

      res.status(201).json({
        message: `Se crearon ${resultados.length} consumibles exitosamente`,
        consumibles: resultados
      });

    } catch (error) {
      console.error('Error en store consumible:', error);
      
      if (error.code === 'P2002') {
        return res.status(400).json({ 
          error: 'Ya existe un consumible con este equipo de stock' 
        });
      }

      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const {
        nombre,
        stock_equipos_id,
        sede_id,
        cantidad,
        departamento_id,
        fecha_enviado,
        detalles
      } = req.body;

      const consumibleId = parseInt(id);
      const stockEquiposId = stock_equipos_id ? parseInt(stock_equipos_id) : undefined;
      const sedeId = sede_id ? parseInt(sede_id) : undefined;
      const departamentoId = departamento_id ? parseInt(departamento_id) : undefined;
      const cantidadValue = cantidad ? parseInt(cantidad) : undefined;

      const consumibleActual = await prisma.consumible.findUnique({
        where: { id: consumibleId }
      });

      if (!consumibleActual) {
        return res.status(404).json({ error: 'Consumible no encontrado' });
      }

      const resultado = await prisma.$transaction(async (tx) => {
        // Manejar cambio de cantidad
        if (cantidadValue !== undefined && cantidadValue !== consumibleActual.cantidad) {
          const diferencia = cantidadValue - consumibleActual.cantidad;
          const stockEquipoId = stock_equipos_id ? stockEquiposId : consumibleActual.stock_equipos_id;

          const stockActual = await tx.stock_equipos.findUnique({
            where: { id: stockEquipoId }
          });

          if (!stockActual) {
            throw new Error('Equipo de stock no encontrado');
          }

          if (diferencia > 0) {
            // Aumento de cantidad - verificar stock disponible
            if (stockActual.cantidad_disponible < diferencia) {
              throw new Error(`Stock insuficiente. Disponible: ${stockActual.cantidad_disponible}, Necesario: ${diferencia}`);
            }

            // ✅ SOLO RESTAR LA DIFERENCIA DEL STOCK DISPONIBLE
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_disponible: { decrement: diferencia }
              }
            });
          } else {
            // Disminución de cantidad - devolver la diferencia al stock
            const diferenciaAbs = Math.abs(diferencia);
            // ✅ SOLO INCREMENTAR STOCK DISPONIBLE
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_disponible: { increment: diferenciaAbs }
              }
            });
          }
        }

        // Manejar cambio de equipo de stock
        if (stock_equipos_id && stockEquiposId !== consumibleActual.stock_equipos_id) {
          // Devolver la cantidad anterior al stock original (SOLO DISPONIBLE)
          await tx.stock_equipos.update({
            where: { id: consumibleActual.stock_equipos_id },
            data: {
              cantidad_disponible: { increment: consumibleActual.cantidad }
            }
          });

          // Verificar stock disponible en el nuevo equipo
          const nuevoStock = await tx.stock_equipos.findUnique({
            where: { id: stockEquiposId }
          });

          if (!nuevoStock) {
            throw new Error('Nuevo equipo de stock no encontrado');
          }

          if (nuevoStock.cantidad_disponible < cantidadValue) {
            throw new Error(`Stock insuficiente en nuevo equipo. Disponible: ${nuevoStock.cantidad_disponible}, Necesario: ${cantidadValue}`);
          }

          // ✅ RESTAR SOLO DEL STOCK DISPONIBLE DEL NUEVO EQUIPO
          await tx.stock_equipos.update({
            where: { id: stockEquiposId },
            data: {
              cantidad_disponible: { decrement: cantidadValue }
            }
          });
        }

        // Actualizar el consumible
        const consumibleActualizado = await tx.consumible.update({
          where: { id: consumibleId },
          data: {
            nombre,
            stock_equipos_id: stockEquiposId,
            sede_id: sedeId,
            cantidad: cantidadValue,
            departamento_id: departamentoId,
            fecha_enviado: fecha_enviado ? new Date(fecha_enviado) : undefined,
            detalles,
            updated_at: new Date()
          },
          include: {
            stock_equipos: {
              include: {
                tipo_equipo: true
              }
            },
            sede: true,
            departamento: true
          }
        });

        return consumibleActualizado;
      });

      res.json({
        message: 'Consumible actualizado exitosamente',
        consumible: resultado
      });

    } catch (error) {
      console.error('Error en update consumible:', error);
      
      if (error.code === 'P2002') {
        return res.status(400).json({ 
          error: 'Ya existe un consumible con este equipo de stock' 
        });
      }

      res.status(500).json({ error: error.message });
    }
  },

  async destroy(req, res) {
    try {
      const { id } = req.params;

      const consumible = await prisma.consumible.findUnique({
        where: { id: parseInt(id) }
      });

      if (!consumible) {
        return res.status(404).json({ error: 'Consumible no encontrado' });
      }

      await prisma.$transaction(async (tx) => {
        // ✅ DEVOLVER SOLO AL STOCK DISPONIBLE - NO TOCAR CANTIDAD_ASIGNADA
        await tx.stock_equipos.update({
          where: { id: consumible.stock_equipos_id },
          data: {
            cantidad_disponible: { increment: consumible.cantidad }
          }
        });

        // Eliminar el consumible
        await tx.consumible.delete({
          where: { id: parseInt(id) }
        });
      });

      res.json({ message: 'Consumible eliminado exitosamente' });

    } catch (error) {
      console.error('Error en destroy consumible:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async porSede(req, res) {
    try {
      const { sede_id } = req.params;

      const consumibles = await prisma.consumible.findMany({
        where: { sede_id: parseInt(sede_id) },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true
        },
        orderBy: {
          id: 'asc'
        }
      });

      res.json(consumibles);
    } catch (error) {
      console.error('Error en porSede consumibles:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async porDepartamento(req, res) {
    try {
      const { departamento_id } = req.params;

      const consumibles = await prisma.consumible.findMany({
        where: { departamento_id: parseInt(departamento_id) },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true
        },
        orderBy: {
          id: 'asc'
        }
      });

      res.json(consumibles);
    } catch (error) {
      console.error('Error en porDepartamento consumibles:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async buscar(req, res) {
    try {
      const { q } = req.query;

      if (!q) {
        return res.status(400).json({ error: 'Término de búsqueda requerido' });
      }

      const consumibles = await prisma.consumible.findMany({
        where: {
          OR: [
            { nombre: { contains: q, mode: 'insensitive' } },
            { detalles: { contains: q, mode: 'insensitive' } }
          ]
        },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true
        },
        orderBy: {
          id: 'asc'
        }
      });

      res.json(consumibles);
    } catch (error) {
      console.error('Error en buscar consumibles:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async estadisticas(req, res) {
    try {
      const totalConsumibles = await prisma.consumible.count();
      
      const consumiblesPorSede = await prisma.consumible.groupBy({
        by: ['sede_id'],
        _count: {
          id: true
        },
        _sum: {
          cantidad: true
        }
      });

      const consumiblesPorDepartamento = await prisma.consumible.groupBy({
        by: ['departamento_id'],
        _count: {
          id: true
        },
        _sum: {
          cantidad: true
        }
      });

      // Obtener nombres de sedes y departamentos
      const sedes = await prisma.sedes.findMany({
        select: { id: true, nombre: true }
      });

      const departamentos = await prisma.departamentos.findMany({
        select: { id: true, nombre: true }
      });

      const totalUnidades = await prisma.consumible.aggregate({
        _sum: {
          cantidad: true
        }
      });

      res.json({
        total_consumibles: totalConsumibles,
        total_unidades: totalUnidades._sum.cantidad || 0,
        por_sede: consumiblesPorSede.map(item => ({
          sede_id: item.sede_id,
          sede_nombre: sedes.find(s => s.id === item.sede_id)?.nombre || 'Desconocida',
          cantidad_consumibles: item._count.id,
          total_unidades: item._sum.cantidad
        })),
        por_departamento: consumiblesPorDepartamento.map(item => ({
          departamento_id: item.departamento_id,
          departamento_nombre: departamentos.find(d => d.id === item.departamento_id)?.nombre || 'Desconocido',
          cantidad_consumibles: item._count.id,
          total_unidades: item._sum.cantidad
        }))
      });

    } catch (error) {
      console.error('Error en estadisticas consumibles:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async consumiblesRecientes(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 10;

      const consumibles = await prisma.consumible.findMany({
        take: limit,
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true
        },
        orderBy: {
          created_at: 'desc'
        }
      });

      res.json(consumibles);
    } catch (error) {
      console.error('Error en consumiblesRecientes:', error);
      res.status(500).json({ error: error.message });
    }
  }
};