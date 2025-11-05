import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const impresoraController = {

  async index(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const totalRecords = await prisma.impresora.count();

      const impresoras = await prisma.impresora.findMany({
        skip,
        take: limit,
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true,
          toner_actual: {
            include: {
              tipo_equipo: true
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      });

      const totalPages = Math.ceil(totalRecords / limit);

      res.json({
        impresoras: impresoras,
        pagination: {
          current: page,
          total: totalPages,
          totalRecords: totalRecords
        }
      });
    } catch (error) {
      console.error('Error en index impresoras:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async show(req, res) {
    try {
      const { id } = req.params;
      const impresoraId = parseInt(id);

      const impresora = await prisma.impresora.findUnique({
        where: { id: impresoraId },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true,
          toner_actual: {
            include: {
              tipo_equipo: true
            }
          }
        }
      });

      if (!impresora) {
        return res.status(404).json({ error: 'Impresora no encontrada' });
      }

      res.json(impresora);
    } catch (error) {
      console.error('Error en show impresora:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async store(req, res) {
    try {
      const {
        stock_equipos_id,
        nombre,
        descripcion,
        ip_impresora,
        cereal_impresora,
        sede_id,
        departamento_id,
        ubicacion,
        estado_impresora,
        toner // NUEVO: Campo toner agregado
      } = req.body;

      console.log('📝 Datos recibidos para crear impresora:', req.body);

      const stockEquiposId = parseInt(stock_equipos_id);
      const sedeId = parseInt(sede_id);
      const departamentoId = parseInt(departamento_id);

      const impresoraStock = await prisma.stock_equipos.findUnique({
        where: { id: stockEquiposId },
        include: { tipo_equipo: true }
      });

      if (!impresoraStock) {
        return res.status(404).json({ error: 'Equipo no encontrado en inventario' });
      }

      if (impresoraStock.cantidad_disponible <= 0) {
        return res.status(400).json({ error: 'No hay stock disponible para este equipo' });
      }

      const impresoraExistente = await prisma.impresora.findUnique({
        where: { stock_equipos_id: stockEquiposId }
      });

      if (impresoraExistente) {
        return res.status(400).json({ error: 'Ya existe una impresora configurada para este equipo' });
      }

      const resultado = await prisma.$transaction(async (tx) => {
        const impresora = await tx.impresora.create({
          data: {
            stock_equipos_id: stockEquiposId,
            nombre,
            descripcion,
            ip_impresora,
            cereal_impresora,
            sede_id: sedeId,
            departamento_id: departamentoId,
            ubicacion,
            toner, // NUEVO: Campo toner agregado
            estado_impresora: estado_impresora || 'activa',
            contador_impresiones: 0,
            contador_instalacion_toner: 0
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

        await tx.stock_equipos.update({
          where: { id: stockEquiposId },
          data: {
            cantidad_disponible: { decrement: 1 },
            cantidad_asignada: { increment: 1 }
          }
        });

        return impresora;
      });

      res.status(201).json({
        message: 'Impresora activada exitosamente',
        impresora: resultado
      });

    } catch (error) {
      console.error('Error en store impresora:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Actualizar impresora
// En el método update del controlador, agrega el campo contador_instalacion_toner
async update(req, res) {
  try {
    const { id } = req.params;
    const {
      nombre,
      descripcion,
      ip_impresora,
      cereal_impresora,
      sede_id,
      departamento_id,
      ubicacion,
      estado_impresora,
      contador_impresiones,
      toner, // Campo modelo de toner
      contador_instalacion_toner // NUEVO: Campo contador de toner
    } = req.body;

    const impresoraId = parseInt(id);
    const sedeId = sede_id ? parseInt(sede_id) : undefined;
    const departamentoId = departamento_id ? parseInt(departamento_id) : undefined;

    const impresoraActual = await prisma.impresora.findUnique({
      where: { id: impresoraId },
      include: {
        stock_equipos: true,
        toner_actual: true // Incluir toner actual para manejar cambios
      }
    });

    if (!impresoraActual) {
      return res.status(404).json({ error: 'Impresora no encontrada' });
    }

    const resultado = await prisma.$transaction(async (tx) => {
      // Manejar cambios en el contador de toner
      const contadorAnterior = impresoraActual.contador_instalacion_toner || 0;
      const contadorNuevo = parseInt(contador_instalacion_toner) || 0;
      
      console.log(`🔄 Cambio contador toner: ${contadorAnterior} -> ${contadorNuevo}`);

      // Si el contador aumenta, restar del inventario
      if (contadorNuevo > contadorAnterior) {
        const diferencia = contadorNuevo - contadorAnterior;
        
        // Buscar un toner compatible en el inventario
        const tonerCompatible = await tx.stock_equipos.findFirst({
          where: {
            tipo_equipo: {
              nombre: {
                contains: 'toner',
                mode: 'insensitive'
              }
            },
            cantidad_disponible: {
              gt: 0
            }
          }
        });

        if (tonerCompatible) {
          console.log(`📦 Restando ${diferencia} toner(s) del inventario`);
          
          await tx.stock_equipos.update({
            where: { id: tonerCompatible.id },
            data: {
              cantidad_disponible: { decrement: diferencia },
              cantidad_asignada: { increment: diferencia }
            }
          });

          // Actualizar el toner actual si no hay uno asignado
          if (!impresoraActual.toner_actual_id) {
            await tx.impresora.update({
              where: { id: impresoraId },
              data: {
                toner_actual_id: tonerCompatible.id,
                fecha_instalacion_toner: new Date()
              }
            });
          }
        } else {
          console.log('⚠️ No hay toners disponibles en inventario');
        }
      }
      // Si el contador disminuye, devolver al inventario
      else if (contadorNuevo < contadorAnterior && impresoraActual.toner_actual_id) {
        const diferencia = contadorAnterior - contadorNuevo;
        
        console.log(`📦 Devolviendo ${diferencia} toner(s) al inventario`);
        
        await tx.stock_equipos.update({
          where: { id: impresoraActual.toner_actual_id },
          data: {
            cantidad_disponible: { increment: diferencia },
            cantidad_asignada: { decrement: diferencia }
          }
        });
      }

      // Manejar cambio de estado (código existente)
      const estadoAnterior = impresoraActual.estado_impresora;
      const estadoNuevo = estado_impresora;

      if (estadoAnterior !== estadoNuevo) {
        const stockEquipoId = impresoraActual.stock_equipos_id;

        if ((estadoAnterior === 'activa' || estadoAnterior === 'obsoleta') && 
            (estadoNuevo === 'inactiva' || estadoNuevo === 'mantenimiento')) {
          
          console.log(`📦 Devolviendo impresora al inventario (estado: ${estadoNuevo})`);
          
          await tx.stock_equipos.update({
            where: { id: stockEquipoId },
            data: {
              cantidad_disponible: { increment: 1 },
              cantidad_asignada: { decrement: 1 }
            }
          });
        }
        
        else if ((estadoAnterior === 'inactiva' || estadoAnterior === 'mantenimiento' || estadoAnterior === 'obsoleta') && 
                 estadoNuevo === 'activa') {
          
          console.log(`🔧 Asignando impresora desde inventario (activación)`);
          
          await tx.stock_equipos.update({
            where: { id: stockEquipoId },
            data: {
              cantidad_disponible: { decrement: 1 },
              cantidad_asignada: { increment: 1 }
            }
          });
        }
        
        else if (estadoNuevo === 'obsoleta') {
          console.log(`🗑️ Marcando impresora como obsoleta - eliminando del inventario`);
          
          const stockActual = await tx.stock_equipos.findUnique({
            where: { id: stockEquipoId }
          });
          
          if (stockActual) {
            if (estadoAnterior === 'activa') {
              await tx.stock_equipos.update({
                where: { id: stockEquipoId },
                data: {
                  cantidad_total: { decrement: 1 },
                  cantidad_asignada: { decrement: 1 }
                }
              });
            }
            else if (estadoAnterior === 'inactiva' || estadoAnterior === 'mantenimiento') {
              await tx.stock_equipos.update({
                where: { id: stockEquipoId },
                data: {
                  cantidad_total: { decrement: 1 },
                  cantidad_disponible: { decrement: 1 }
                }
              });
            }
          }
        }
      }

      // Actualizar la impresora
      const impresoraActualizada = await tx.impresora.update({
        where: { id: impresoraId },
        data: {
          nombre,
          descripcion,
          ip_impresora,
          cereal_impresora,
          sede_id: sedeId,
          departamento_id: departamentoId,
          ubicacion,
          toner, // Campo modelo de toner
          contador_instalacion_toner: contadorNuevo, // NUEVO: Contador de toner
          estado_impresora,
          contador_impresiones: contador_impresiones ? parseInt(contador_impresiones) : undefined,
          updated_at: new Date()
        },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true,
          toner_actual: {
            include: {
              tipo_equipo: true
            }
          }
        }
      });

      return impresoraActualizada;
    });

    res.json({
      message: 'Impresora actualizada exitosamente',
      impresora: resultado
    });

  } catch (error) {
    console.error('Error en update impresora:', error);
    res.status(500).json({ error: error.message });
  }
},

  // Eliminar impresora
  async destroy(req, res) {
    try {
      const { id } = req.params;

      const impresora = await prisma.impresora.findUnique({
        where: { id: parseInt(id) },
        include: {
          stock_equipos: true
        }
      });

      if (!impresora) {
        return res.status(404).json({ error: 'Impresora no encontrada' });
      }

      await prisma.$transaction(async (tx) => {
        const stockEquipoId = impresora.stock_equipos_id;
        const estadoActual = impresora.estado_impresora;

        console.log(`🗑️ Eliminando impresora con estado: ${estadoActual}`);

        if (estadoActual === 'activa') {
          console.log(`📦 Devolviendo impresora activa al inventario`);
          
          await tx.stock_equipos.update({
            where: { id: stockEquipoId },
            data: {
              cantidad_disponible: { increment: 1 },
              cantidad_asignada: { decrement: 1 }
            }
          });
        } 
        else if (estadoActual === 'inactiva' || estadoActual === 'mantenimiento') {
          console.log(`📦 Impresora ya estaba disponible, no se modifica inventario`);
        }
        
        // Eliminar la impresora
        await tx.impresora.delete({
          where: { id: parseInt(id) }
        });
      });

      res.json({ message: 'Impresora eliminada exitosamente' });

    } catch (error) {
      console.error('Error en destroy impresora:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Cambiar estado de la impresora
  async cambiarEstado(req, res) {
    try {
      const { id } = req.params;
      const { estado_impresora } = req.body;

      const estadosPermitidos = ['activa', 'inactiva', 'mantenimiento', 'sin_toner', 'obsoleta'];
      
      if (!estadosPermitidos.includes(estado_impresora)) {
        return res.status(400).json({ 
          error: 'Estado no válido', 
          estados_permitidos: estadosPermitidos 
        });
      }

      const impresora = await prisma.impresora.findUnique({
        where: { id: parseInt(id) },
        include: {
          stock_equipos: true
        }
      });

      if (!impresora) {
        return res.status(404).json({ error: 'Impresora no encontrada' });
      }

      const impresoraActualizada = await prisma.$transaction(async (tx) => {
        const estadoAnterior = impresora.estado_impresora;
        const estadoNuevo = estado_impresora;
        const stockEquipoId = impresora.stock_equipos_id;

        console.log(`🔄 Cambio de estado impresora: ${estadoAnterior} -> ${estadoNuevo}`);

        if (estadoAnterior !== estadoNuevo) {
          
          if ((estadoAnterior === 'activa' || estadoAnterior === 'obsoleta') && 
              (estadoNuevo === 'inactiva' || estadoNuevo === 'mantenimiento')) {
            
            console.log(`📦 Devolviendo impresora al inventario (estado: ${estadoNuevo})`);
            
            if (estadoAnterior === 'obsoleta') {
              await tx.stock_equipos.update({
                where: { id: stockEquipoId },
                data: {
                  cantidad_total: { increment: 1 },
                  cantidad_disponible: { increment: 1 }
                }
              });
            } else {
              await tx.stock_equipos.update({
                where: { id: stockEquipoId },
                data: {
                  cantidad_disponible: { increment: 1 },
                  cantidad_asignada: { decrement: 1 }
                }
              });
            }
          }
          
          else if ((estadoAnterior === 'inactiva' || estadoAnterior === 'mantenimiento' || estadoAnterior === 'obsoleta') && 
                   estadoNuevo === 'activa') {
            
            console.log(`🔧 Asignando impresora desde inventario (activación)`);
            
            if (estadoAnterior === 'obsoleta') {
              await tx.stock_equipos.update({
                where: { id: stockEquipoId },
                data: {
                  cantidad_total: { increment: 1 },
                  cantidad_disponible: { decrement: 1 },
                  cantidad_asignada: { increment: 1 }
                }
              });
            } else {
              await tx.stock_equipos.update({
                where: { id: stockEquipoId },
                data: {
                  cantidad_disponible: { decrement: 1 },
                  cantidad_asignada: { increment: 1 }
                }
              });
            }
          }
          else if (estadoNuevo === 'obsoleta') {
            console.log(`🗑️ Marcando impresora como obsoleta - eliminando del inventario`);
            
            const stockActual = await tx.stock_equipos.findUnique({
              where: { id: stockEquipoId }
            });
            
            if (stockActual) {
              if (estadoAnterior === 'activa') {
                await tx.stock_equipos.update({
                  where: { id: stockEquipoId },
                  data: {
                    cantidad_total: { decrement: 1 },
                    cantidad_asignada: { decrement: 1 }
                  }
                });
              }
              else if (estadoAnterior === 'inactiva' || estadoAnterior === 'mantenimiento') {
                await tx.stock_equipos.update({
                  where: { id: stockEquipoId },
                  data: {
                    cantidad_total: { decrement: 1 },
                    cantidad_disponible: { decrement: 1 }
                  }
                });
              }
            }
          }
        }

        const impresoraActualizada = await tx.impresora.update({
          where: { id: parseInt(id) },
          data: { 
            estado_impresora,
            updated_at: new Date()
          },
          include: {
            stock_equipos: {
              include: {
                tipo_equipo: true
              }
            },
            sede: true,
            departamento: true,
            toner_actual: {
              include: {
                tipo_equipo: true
              }
            }
          }
        });

        return impresoraActualizada;
      });

      res.json({
        message: `Estado de la impresora cambiado a ${estado_impresora}`,
        impresora: impresoraActualizada
      });

    } catch (error) {
      console.error('Error en cambiarEstado impresora:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Instalar toner en impresora
  async instalarToner(req, res) {
    try {
      const { id } = req.params;
      const { toner_actual_id, toner } = req.body; // NUEVO: Campo toner agregado

      const impresoraId = parseInt(id);
      const tonerId = parseInt(toner_actual_id);

      const tonerStock = await prisma.stock_equipos.findUnique({
        where: { id: tonerId },
        include: { tipo_equipo: true }
      });

      if (!tonerStock) {
        return res.status(404).json({ error: 'Toner no encontrado en inventario' });
      }

      if (tonerStock.cantidad_disponible <= 0) {
        return res.status(400).json({ error: 'No hay stock disponible para este toner' });
      }

      const impresoraActual = await prisma.impresora.findUnique({
        where: { id: impresoraId }
      });

      const resultado = await prisma.$transaction(async (tx) => {
        const impresora = await tx.impresora.update({
          where: { id: impresoraId },
          data: {
            toner_actual_id: tonerId,
            toner, // NUEVO: Campo toner agregado
            fecha_instalacion_toner: new Date(),
            contador_instalacion_toner: {
              increment: 1
            }
          },
          include: {
            stock_equipos: {
              include: {
                tipo_equipo: true
              }
            },
            sede: true,
            departamento: true,
            toner_actual: {
              include: {
                tipo_equipo: true
              }
            }
          }
        });

        await tx.stock_equipos.update({
          where: { id: tonerId },
          data: {
            cantidad_disponible: { decrement: 1 },
            cantidad_asignada: { increment: 1 }
          }
        });

        return impresora;
      });

      res.json({
        message: 'Toner instalado exitosamente',
        impresora: resultado
      });

    } catch (error) {
      console.error('Error en instalarToner:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Actualizar contador de impresiones
  async actualizarContador(req, res) {
    try {
      const { id } = req.params;
      const { contador_impresiones } = req.body;

      const impresora = await prisma.impresora.update({
        where: { id: parseInt(id) },
        data: {
          contador_impresiones: parseInt(contador_impresiones),
          updated_at: new Date()
        },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true,
          toner_actual: {
            include: {
              tipo_equipo: true
            }
          }
        }
      });

      res.json({
        message: 'Contador de impresiones actualizado',
        impresora
      });

    } catch (error) {
      console.error('Error en actualizarContador:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Obtener impresoras por sede
  async porSede(req, res) {
    try {
      const { sede_id } = req.params;

      const impresoras = await prisma.impresora.findMany({
        where: { sede_id: parseInt(sede_id) },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true,
          toner_actual: {
            include: {
              tipo_equipo: true
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      });

      res.json(impresoras);
    } catch (error) {
      console.error('Error en porSede impresoras:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Obtener impresoras por estado
  async porEstado(req, res) {
    try {
      const { estado } = req.params;

      const estadosPermitidos = ['activa', 'inactiva', 'mantenimiento', 'sin_toner', 'obsoleta'];
      
      if (!estadosPermitidos.includes(estado)) {
        return res.status(400).json({ 
          error: 'Estado no válido', 
          estados_permitidos: estadosPermitidos 
        });
      }

      const impresoras = await prisma.impresora.findMany({
        where: { estado_impresora: estado },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true,
          toner_actual: {
            include: {
              tipo_equipo: true
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      });

      res.json(impresoras);
    } catch (error) {
      console.error('Error en porEstado impresoras:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Obtener estadísticas de impresoras
  async estadisticas(req, res) {
    try {
      const totalImpresoras = await prisma.impresora.count();
      
      const impresorasPorEstado = await prisma.impresora.groupBy({
        by: ['estado_impresora'],
        _count: {
          id: true
        }
      });

      const impresorasPorSede = await prisma.impresora.groupBy({
        by: ['sede_id'],
        _count: {
          id: true
        }
      });

      const sedes = await prisma.sedes.findMany({
        where: {
          id: {
            in: impresorasPorSede.map(item => item.sede_id)
          }
        }
      });

      const estadisticasPorSede = impresorasPorSede.map(item => {
        const sede = sedes.find(s => s.id === item.sede_id);
        return {
          sede_id: item.sede_id,
          sede_nombre: sede ? sede.nombre : 'Desconocida',
          cantidad: item._count.id
        };
      });

      const totalImpresiones = await prisma.impresora.aggregate({
        _sum: {
          contador_impresiones: true
        }
      });

      res.json({
        total_impresoras: totalImpresoras,
        total_impresiones: totalImpresiones._sum.contador_impresiones || 0,
        por_estado: impresorasPorEstado.map(item => ({
          estado: item.estado_impresora,
          cantidad: item._count.id
        })),
        por_sede: estadisticasPorSede
      });

    } catch (error) {
      console.error('Error en estadisticas impresoras:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Buscar impresoras
  async buscar(req, res) {
    try {
      const { q } = req.query;

      if (!q) {
        return res.status(400).json({ error: 'Término de búsqueda requerido' });
      }

      const impresoras = await prisma.impresora.findMany({
        where: {
          OR: [
            { nombre: { contains: q, mode: 'insensitive' } },
            { descripcion: { contains: q, mode: 'insensitive' } },
            { ip_impresora: { contains: q, mode: 'insensitive' } },
            { cereal_impresora: { contains: q, mode: 'insensitive' } },
            { ubicacion: { contains: q, mode: 'insensitive' } },
            { toner: { contains: q, mode: 'insensitive' } } // NUEVO: Búsqueda por toner agregada
          ]
        },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true,
          toner_actual: {
            include: {
              tipo_equipo: true
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      });

      res.json(impresoras);
    } catch (error) {
      console.error('Error en buscar impresoras:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // NUEVO: Método para actualizar solo el campo toner
  async actualizarToner(req, res) {
    try {
      const { id } = req.params;
      const { toner } = req.body;

      const impresora = await prisma.impresora.update({
        where: { id: parseInt(id) },
        data: {
          toner,
          updated_at: new Date()
        },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true,
          toner_actual: {
            include: {
              tipo_equipo: true
            }
          }
        }
      });

      res.json({
        message: 'Toner actualizado exitosamente',
        impresora
      });

    } catch (error) {
      console.error('Error en actualizarToner:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async actualizarContadorToner(req, res) {
    try {
        const { id } = req.params;
        const { contador_instalacion_toner } = req.body;

        const impresora = await prisma.impresora.update({
            where: { id: parseInt(id) },
            data: {
                contador_instalacion_toner: parseInt(contador_instalacion_toner),
                updated_at: new Date()
            },
            include: {
                stock_equipos: {
                    include: {
                        tipo_equipo: true
                    }
                },
                sede: true,
                departamento: true,
                toner_actual: {
                    include: {
                        tipo_equipo: true
                    }
                }
            }
        });

        res.json({
            message: 'Contador de toner actualizado',
            impresora
        });

    } catch (error) {
        console.error('Error en actualizarContadorToner:', error);
        res.status(500).json({ error: error.message });
    }
}
};