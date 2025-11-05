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
          consumible_equipos: {
            include: {
              stock_equipos: {
                include: {
                  tipo_equipo: true
                }
              }
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
          consumible_equipos: {
            include: {
              stock_equipos: {
                include: {
                  tipo_equipo: true
                }
              }
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
        equipos
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

      const resultado = await prisma.$transaction(async (tx) => {
        // Validar stock disponible para todos los equipos primero
        for (const equipo of equipos) {
          const stockEquiposId = parseInt(equipo.stock_equipos_id);
          const cantidadValue = parseInt(equipo.cantidad);

          const stockEquipo = await tx.stock_equipos.findUnique({
            where: { id: stockEquiposId }
          });

          if (!stockEquipo) {
            throw new Error(`Equipo con ID ${stockEquiposId} no encontrado en inventario`);
          }

          if (stockEquipo.cantidad_disponible < cantidadValue) {
            throw new Error(`Stock insuficiente para ${stockEquipo.marca} ${stockEquipo.modelo}. Disponible: ${stockEquipo.cantidad_disponible}, Solicitado: ${cantidadValue}`);
          }
        }

        // Crear UN SOLO consumible
        const consumible = await tx.consumible.create({
          data: {
            nombre: nombre,
            sede_id: sedeId,
            departamento_id: departamentoId,
            fecha_enviado: new Date(fecha_enviado),
            detalles: detalles
          }
        });

        // Crear las relaciones con los equipos
        for (const equipo of equipos) {
          const stockEquiposId = parseInt(equipo.stock_equipos_id);
          const cantidadValue = parseInt(equipo.cantidad);

          // Crear relación consumible_equipo
          await tx.consumibleEquipo.create({
            data: {
              consumible_id: consumible.id,
              stock_equipos_id: stockEquiposId,
              cantidad: cantidadValue
            }
          });

          // Restar del stock disponible
          await tx.stock_equipos.update({
            where: { id: stockEquiposId },
            data: {
              cantidad_disponible: { decrement: cantidadValue }
            }
          });
        }

        // Obtener el consumible creado con toda la información
        const consumibleCompleto = await tx.consumible.findUnique({
          where: { id: consumible.id },
          include: {
            consumible_equipos: {
              include: {
                stock_equipos: {
                  include: {
                    tipo_equipo: true
                  }
                }
              }
            },
            sede: true,
            departamento: true
          }
        });

        return consumibleCompleto;
      });

      res.status(201).json({
        message: `Consumible creado exitosamente con ${equipos.length} equipos`,
        consumible: resultado
      });

    } catch (error) {
      console.error('Error en store consumible:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const {
        nombre,
        sede_id,
        departamento_id,
        fecha_enviado,
        detalles,
        equipos
      } = req.body;

      const consumibleId = parseInt(id);
      const sedeId = sede_id ? parseInt(sede_id) : undefined;
      const departamentoId = departamento_id ? parseInt(departamento_id) : undefined;

      const consumibleActual = await prisma.consumible.findUnique({
        where: { id: consumibleId },
        include: {
          consumible_equipos: {
            include: {
              stock_equipos: true
            }
          }
        }
      });

      if (!consumibleActual) {
        return res.status(404).json({ error: 'Consumible no encontrado' });
      }

      const resultado = await prisma.$transaction(async (tx) => {
        // Si se están actualizando los equipos
        if (equipos && Array.isArray(equipos)) {
          // Crear map de equipos actuales para comparación
          const equiposActualesMap = new Map();
          consumibleActual.consumible_equipos.forEach(ce => {
            equiposActualesMap.set(ce.stock_equipos_id, ce);
          });

          // Crear map de equipos nuevos
          const equiposNuevosMap = new Map();
          equipos.forEach(eq => {
            equiposNuevosMap.set(parseInt(eq.stock_equipos_id), {
              stock_equipos_id: parseInt(eq.stock_equipos_id),
              cantidad: parseInt(eq.cantidad)
            });
          });

          // Procesar equipos eliminados
          for (const [stockEquiposId, equipoActual] of equiposActualesMap) {
            if (!equiposNuevosMap.has(stockEquiposId)) {
              // Equipo fue eliminado - devolver stock
              await tx.stock_equipos.update({
                where: { id: stockEquiposId },
                data: {
                  cantidad_disponible: { increment: equipoActual.cantidad }
                }
              });

              // Eliminar relación
              await tx.consumibleEquipo.deleteMany({
                where: {
                  consumible_id: consumibleId,
                  stock_equipos_id: stockEquiposId
                }
              });
            }
          }

          // Procesar equipos nuevos y modificados
          for (const [stockEquiposId, equipoNuevo] of equiposNuevosMap) {
            const equipoActual = equiposActualesMap.get(stockEquiposId);
            const cantidadNueva = equipoNuevo.cantidad;

            // Validar stock disponible
            const stockEquipo = await tx.stock_equipos.findUnique({
              where: { id: stockEquiposId }
            });

            if (!stockEquipo) {
              throw new Error(`Equipo con ID ${stockEquiposId} no encontrado en inventario`);
            }

            if (equipoActual) {
              // Equipo existente - verificar cambios en cantidad
              const cantidadAnterior = equipoActual.cantidad;
              
              if (cantidadNueva !== cantidadAnterior) {
                const diferencia = cantidadNueva - cantidadAnterior;
                
                if (diferencia > 0) {
                  // Aumento de cantidad
                  if (stockEquipo.cantidad_disponible < diferencia) {
                    throw new Error(`Stock insuficiente para ${stockEquipo.marca} ${stockEquipo.modelo}. Disponible: ${stockEquipo.cantidad_disponible}, Necesario: ${diferencia}`);
                  }
                  
                  // Restar diferencia del stock
                  await tx.stock_equipos.update({
                    where: { id: stockEquiposId },
                    data: {
                      cantidad_disponible: { decrement: diferencia }
                    }
                  });
                } else {
                  // Disminución de cantidad - devolver diferencia
                  const diferenciaAbs = Math.abs(diferencia);
                  await tx.stock_equipos.update({
                    where: { id: stockEquiposId },
                    data: {
                      cantidad_disponible: { increment: diferenciaAbs }
                    }
                  });
                }

                // Actualizar cantidad en la relación
                await tx.consumibleEquipo.updateMany({
                  where: {
                    consumible_id: consumibleId,
                    stock_equipos_id: stockEquiposId
                  },
                  data: {
                    cantidad: cantidadNueva
                  }
                });
              }
            } else {
              // Equipo nuevo - validar stock y crear relación
              if (stockEquipo.cantidad_disponible < cantidadNueva) {
                throw new Error(`Stock insuficiente para ${stockEquipo.marca} ${stockEquipo.modelo}. Disponible: ${stockEquipo.cantidad_disponible}, Solicitado: ${cantidadNueva}`);
              }

              // Crear nueva relación
              await tx.consumibleEquipo.create({
                data: {
                  consumible_id: consumibleId,
                  stock_equipos_id: stockEquiposId,
                  cantidad: cantidadNueva
                }
              });

              // Restar del stock disponible
              await tx.stock_equipos.update({
                where: { id: stockEquiposId },
                data: {
                  cantidad_disponible: { decrement: cantidadNueva }
                }
              });
            }
          }
        }

        // Actualizar el consumible
        const consumibleActualizado = await tx.consumible.update({
          where: { id: consumibleId },
          data: {
            nombre,
            sede_id: sedeId,
            departamento_id: departamentoId,
            fecha_enviado: fecha_enviado ? new Date(fecha_enviado) : undefined,
            detalles,
            updated_at: new Date()
          },
          include: {
            consumible_equipos: {
              include: {
                stock_equipos: {
                  include: {
                    tipo_equipo: true
                  }
                }
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
      res.status(500).json({ error: error.message });
    }
  },

  async destroy(req, res) {
    try {
      const { id } = req.params;

      const consumible = await prisma.consumible.findUnique({
        where: { id: parseInt(id) },
        include: {
          consumible_equipos: true
        }
      });

      if (!consumible) {
        return res.status(404).json({ error: 'Consumible no encontrado' });
      }

      await prisma.$transaction(async (tx) => {
        /* Devolver todo el stock de los equipos
        for (const equipo of consumible.consumible_equipos) {
          await tx.stock_equipos.update({
            where: { id: equipo.stock_equipos_id },
            data: {
              cantidad_disponible: { increment: equipo.cantidad }
            }
          });
        }*/

        // Eliminar el consumible (las relaciones se eliminarán en cascada)
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