import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import PuppeteerPDF from '../services/puppeteerPDF.js';
import { renderTemplate } from '../helpers/renderHelper.js';

export const equipoAsignadoController = {
  async index(req, res) {
    try {
      const equiposAsignados = await prisma.equipo_asignado.findMany({
        include: {
          usuarios: {
            include: {
              sede: true,
              departamento: true
            }
          },
          usuario: true,
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          }
        },
        orderBy: { id: 'asc' }
      });

      console.log('🔍 Equipos asignados encontrados:', equiposAsignados.length);
      
      // Formatear la respuesta para el frontend - USAR CEREAL_EQUIPO
      const response = equiposAsignados.map(asignacion => ({
        id: asignacion.id,
        usuarios_id: asignacion.usuarios_id,
        stock_equipos_id: asignacion.stock_equipos_id,
        fecha_asignacion: asignacion.fecha_asignacion,
        fecha_devolucion: asignacion.fecha_devolucion,
        ip_equipo: asignacion.ip_equipo,
        numero_serie: asignacion.cereal_equipo, // CAMBIAR A cereal_equipo
        observaciones: asignacion.observaciones,
        estado: asignacion.estado,
        created_at: asignacion.created_at,
        updated_at: asignacion.updated_at,
        // Relaciones formateadas correctamente
        usuarioAsignado: asignacion.usuarios ? {
          id: asignacion.usuarios.id,
          nombre: asignacion.usuarios.nombre,
          apellido: asignacion.usuarios.apellido,
          cargo: asignacion.usuarios.cargo,
          correo: asignacion.usuarios.correo,
          sede: asignacion.usuarios.sede,
          departamento: asignacion.usuarios.departamento
        } : null,
        stockEquipo: asignacion.stock_equipos ? {
          id: asignacion.stock_equipos.id,
          marca: asignacion.stock_equipos.marca,
          modelo: asignacion.stock_equipos.modelo,
          tipo_equipo: asignacion.stock_equipos.tipo_equipo
        } : null,
        usuarioAsignador: asignacion.usuario ? {
          id: asignacion.usuario.id,
          name: asignacion.usuario.name,
          email: asignacion.usuario.email
        } : null
      }));

      res.json(response);

    } catch (error) {
      console.error('Error en index:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async store(req, res) {
    try {
      const {
        usuarios_id,
        stock_equipos_id,
        fecha_asignacion,
        ip_equipo,
        numero_serie, 
        fecha_devolucion,
        observaciones,
        estado = 'activo'
      } = req.body;

      console.log('📝 Datos recibidos para crear asignación:', {
        usuarios_id,
        stock_equipos_id,
        fecha_asignacion,
        ip_equipo,
        numero_serie,
        fecha_devolucion,
        observaciones,
        estado
      });

      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Usuario no autenticado' });
      }

      const stockEquipo = await prisma.stock_equipos.findUnique({
        where: { id: parseInt(stock_equipos_id) },
        include: { tipo_equipo: true }
      });

      if (!stockEquipo) {
        return res.status(400).json({ error: 'Equipo en stock no encontrado' });
      }

      if (stockEquipo.cantidad_disponible <= 0) {
        return res.status(400).json({ error: 'El equipo seleccionado no tiene stock disponible' });
      }

      // USAR CEREAL_EQUIPO en la base de datos
      const equipoAsignado = await prisma.equipo_asignado.create({
        data: {
          usuarios_id: parseInt(usuarios_id),
          stock_equipos_id: parseInt(stock_equipos_id),
          fecha_asignacion: new Date(fecha_asignacion),
          ip_equipo,
          cereal_equipo: numero_serie, // Mapear numero_serie a cereal_equipo
          fecha_devolucion: fecha_devolucion ? new Date(fecha_devolucion) : null,
          observaciones,
          usuario_id: req.user.id,
          estado
        },
        include: {
          usuarios: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              cargo: true,
              correo: true
            }
          },
          usuario: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          stock_equipos: {
            include: {
              tipo_equipo: {
                select: {
                  id: true,
                  nombre: true,
                  requiere_ip: true,
                  requiere_cereal: true
                }
              }
            }
          }
        }
      });

      if (estado === 'activo') {
        await prisma.stock_equipos.update({
          where: { id: parseInt(stock_equipos_id) },
          data: {
            cantidad_disponible: { decrement: 1 },
            cantidad_asignada: { increment: 1 }
          }
        });
      }

      res.status(201).json({
        message: 'Equipo asignado exitosamente.',
        equipoAsignado
      });

    } catch (error) {
      console.error('Error en store:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async show(req, res) {
    try {
      const { id } = req.params;
      const equipoAsignado = await prisma.equipo_asignado.findUnique({
        where: { id: parseInt(id) },
        include: {
          usuarios: {
            include: {
              sede: true,
              departamento: true
            }
          },
          usuario: true,
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          }
        }
      });

      if (!equipoAsignado) {
        return res.status(404).json({ error: 'Asignación no encontrada' });
      }

      // Formatear respuesta para mantener consistencia con el frontend
      const response = {
        ...equipoAsignado,
        numero_serie: equipoAsignado.cereal_equipo || null // Mapear cereal_equipo a numero_serie para el frontend
      };

      res.json(response);
    } catch (error) {
      console.error('Error en show:', error);
      res.status(500).json({ error: error.message });
    }
  },

async update(req, res) {
  try {
    const { id } = req.params;
    const {
      usuarios_id,
      stock_equipos_id,
      fecha_asignacion,
      ip_equipo,
      numero_serie,
      fecha_devolucion,
      observaciones,
      estado
    } = req.body;

    console.log('📝 Datos recibidos para actualizar asignación:', {
      usuarios_id,
      stock_equipos_id,
      fecha_asignacion,
      ip_equipo,
      numero_serie,
      fecha_devolucion,
      observaciones,
      estado
    });

    const equipoAsignado = await prisma.equipo_asignado.findUnique({
      where: { id: parseInt(id) }
    });

    if (!equipoAsignado) {
      return res.status(404).json({ error: 'Asignación no encontrada' });
    }

    const nuevoEstado = estado;
    const estadoAnterior = equipoAsignado.estado;

    // ELIMINAR LA LÓGICA QUE BORRA EQUIPOS OBSOLETOS
    // Solo actualizar el estado sin eliminar el registro
    if (nuevoEstado === 'obsoleto' && estadoAnterior !== 'obsoleto') {
      // Actualizar el stock cuando se marca como obsoleto
      const stockEquipo = await prisma.stock_equipos.findUnique({
        where: { id: parseInt(stock_equipos_id) }
      });

      if (stockEquipo) {
        const updateData = {
          cantidad_total: { decrement: 1 }
        };

        if (estadoAnterior === 'activo') {
          updateData.cantidad_asignada = { decrement: 1 };
        } else if (estadoAnterior === 'devuelto') {
          updateData.cantidad_disponible = { decrement: 1 };
        }

        await prisma.stock_equipos.update({
          where: { id: stockEquipo.id },
          data: updateData
        });

        // Verificar si hay que eliminar el stock
        const stockActualizado = await prisma.stock_equipos.findUnique({
          where: { id: stockEquipo.id }
        });

        if (stockActualizado.cantidad_total <= 0) {
          await prisma.stock_equipos.delete({
            where: { id: stockEquipo.id }
          });
        }
      }
    }

    // LÓGICA ORIGINAL PARA OTROS CAMBIOS DE ESTADO
    if (estadoAnterior === 'devuelto' && nuevoEstado === 'activo') {
      const stockEquipo = await prisma.stock_equipos.findUnique({
        where: { id: parseInt(stock_equipos_id) }
      });
      if (stockEquipo && stockEquipo.cantidad_disponible > 0) {
        await prisma.stock_equipos.update({
          where: { id: stockEquipo.id },
          data: {
            cantidad_disponible: { decrement: 1 },
            cantidad_asignada: { increment: 1 }
          }
        });
      } else {
        return res.status(400).json({ error: 'No hay stock disponible para reactivar la asignación' });
      }
    } else if (estadoAnterior === 'activo' && nuevoEstado === 'devuelto') {
      const stockEquipo = await prisma.stock_equipos.findUnique({
        where: { id: parseInt(stock_equipos_id) }
      });
      if (stockEquipo) {
        await prisma.stock_equipos.update({
          where: { id: stockEquipo.id },
          data: {
            cantidad_disponible: { increment: 1 },
            cantidad_asignada: { decrement: 1 }
          }
        });
      }
    }

    // USAR CEREAL_EQUIPO en la base de datos
    const updated = await prisma.equipo_asignado.update({
      where: { id: parseInt(id) },
      data: {
        usuarios_id: parseInt(usuarios_id),
        stock_equipos_id: parseInt(stock_equipos_id),
        fecha_asignacion: new Date(fecha_asignacion),
        ip_equipo,
        cereal_equipo: numero_serie,
        fecha_devolucion: fecha_devolucion ? new Date(fecha_devolucion) : null,
        observaciones,
        estado: nuevoEstado
      },
      include: {
        usuarios: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            cargo: true,
            correo: true
          }
        },
        usuario: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        stock_equipos: {
          include: {
            tipo_equipo: {
              select: {
                id: true,
                nombre: true,
                requiere_ip: true,
                requiere_cereal: true
              }
            }
          }
        }
      }
    });

    res.json({
      message: 'Asignación actualizada exitosamente.',
      equipoAsignado: updated
    });

  } catch (error) {
    console.error('Error en update:', error);
    res.status(500).json({ error: error.message });
  }
},

async destroy(req, res) {  
  try {
    const { id } = req.params;
    console.log('Eliminando asignación:', id);

    const equipoAsignado = await prisma.equipo_asignado.findUnique({
      where: { id: parseInt(id) }
    });

    if (!equipoAsignado) {
      return res.status(404).json({ error: 'Asignación no encontrada' });
    }

    // PERMITIR ELIMINAR EQUIPOS OBSOLETOS
    if (equipoAsignado.estado === 'obsoleto') {
      await prisma.equipo_asignado.delete({
        where: { id: parseInt(id) }
      });
      
      return res.json({ 
        message: 'Asignación obsoleta eliminada exitosamente.' 
      });
    }

    // Para equipos no obsoletos, mantener la lógica actual
    if (equipoAsignado.estado !== 'devuelto') {
      const stockEquipo = await prisma.stock_equipos.findUnique({
        where: { id: equipoAsignado.stock_equipos_id }
      });
      if (stockEquipo) {
        await prisma.stock_equipos.update({
          where: { id: stockEquipo.id },
          data: {
            cantidad_disponible: { increment: 1 },
            cantidad_asignada: { decrement: 1 }
          }
        });
      }
    }

    await prisma.equipo_asignado.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Asignación eliminada exitosamente.' });

  } catch (error) {
    console.error('Error en destroy:', error);
    res.status(500).json({ error: error.message });
  }
},

  async devolver(req, res) {
    try {
      const { id } = req.params;

      const equipoAsignado = await prisma.equipo_asignado.findUnique({
        where: { id: parseInt(id) }
      });

      if (!equipoAsignado) {
        return res.status(404).json({ error: 'Asignación no encontrada' });
      }

      if (equipoAsignado.estado === 'devuelto') {
        return res.status(400).json({ error: 'El equipo ya fue devuelto anteriormente' });
      }

      if (equipoAsignado.estado === 'obsoleto') {
        return res.status(400).json({ error: 'No se puede devolver un equipo obsoleto' });
      }

      const updated = await prisma.equipo_asignado.update({
        where: { id: parseInt(id) },
        data: {
          estado: 'devuelto',
          fecha_devolucion: new Date()
        }
      });

      const stockEquipo = await prisma.stock_equipos.findUnique({
        where: { id: equipoAsignado.stock_equipos_id }
      });
      if (stockEquipo) {
        await prisma.stock_equipos.update({
          where: { id: stockEquipo.id },
          data: {
            cantidad_disponible: { increment: 1 },
            cantidad_asignada: { decrement: 1 }
          }
        });
      }

      res.json({ 
        message: 'Equipo devuelto exitosamente.',
        equipoAsignado: updated
      });

    } catch (error) {
      console.error('Error en devolver:', error);
      res.status(500).json({ error: error.message });
    }
  },

async marcarObsoleto(req, res) {
  try {
    const { id } = req.params;

    const equipoAsignado = await prisma.equipo_asignado.findUnique({
      where: { id: parseInt(id) },
      include: {
        stock_equipos: true
      }
    });

    if (!equipoAsignado) {
      return res.status(404).json({ error: 'Asignación no encontrada' });
    }

    if (equipoAsignado.estado === 'obsoleto') {
      return res.status(400).json({ error: 'El equipo ya está marcado como obsoleto' });
    }

    // SOLO ACTUALIZAR EL ESTADO, NO ELIMINAR
    const updated = await prisma.equipo_asignado.update({
      where: { id: parseInt(id) },
      data: {
        estado: 'obsoleto',
        fecha_devolucion: new Date() // Opcional: establecer fecha de devolución
      }
    });

    // ACTUALIZAR EL STOCK - REDUCIR CANTIDADES
    const stockEquipo = await prisma.stock_equipos.findUnique({
      where: { id: equipoAsignado.stock_equipos_id }
    });

    if (stockEquipo) {
      const updateData = {
        cantidad_total: { decrement: 1 }
      };

      if (equipoAsignado.estado === 'activo') {
        updateData.cantidad_asignada = { decrement: 1 };
      } else if (equipoAsignado.estado === 'devuelto') {
        updateData.cantidad_disponible = { decrement: 1 };
      }

      await prisma.stock_equipos.update({
        where: { id: stockEquipo.id },
        data: updateData
      });

      // Si después de esta operación el stock queda en 0, eliminar el registro del stock
      const stockActualizado = await prisma.stock_equipos.findUnique({
        where: { id: stockEquipo.id }
      });

      if (stockActualizado.cantidad_total <= 0) {
        await prisma.stock_equipos.delete({
          where: { id: stockEquipo.id }
        });
        console.log(`🗑️ Equipo de stock ${stockEquipo.id} eliminado por cantidad total 0`);
      }
    }

    res.json({ 
      message: 'Equipo marcado como obsoleto exitosamente.',
      equipoActualizado: updated
    });

  } catch (error) {
    console.error('Error en marcarObsoleto:', error);
    res.status(500).json({ error: error.message });
  }
},

async reactivar(req, res) {
  try {
    const { id } = req.params;

    const equipoAsignado = await prisma.equipo_asignado.findUnique({
      where: { id: parseInt(id) }
    });

    if (!equipoAsignado) {
      return res.status(404).json({ error: 'Asignación no encontrada' });
    }

    if (equipoAsignado.estado !== 'obsoleto') {
      return res.status(400).json({ error: 'Solo se pueden reactivar equipos obsoletos' });
    }

    const updated = await prisma.equipo_asignado.update({
      where: { id: parseInt(id) },
      data: {
        estado: 'activo',
        fecha_devolucion: null
      }
    });

    // Actualizar el stock
    const stockEquipo = await prisma.stock_equipos.findUnique({
      where: { id: equipoAsignado.stock_equipos_id }
    });

    if (stockEquipo) {
      await prisma.stock_equipos.update({
        where: { id: stockEquipo.id },
        data: {
          cantidad_total: { increment: 1 },
          cantidad_asignada: { increment: 1 }
        }
      });
    }

    res.json({ 
      message: 'Equipo reactivado exitosamente.',
      equipoAsignado: updated
    });

  } catch (error) {
    console.error('Error en reactivar:', error);
    res.status(500).json({ error: error.message });
  }
},

  async porUsuario(req, res) {
    try {
      const { usuarioId } = req.params;
      const equiposAsignados = await prisma.equipo_asignado.findMany({
        where: { usuarios_id: parseInt(usuarioId) },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          usuario: true
        }
      });

      res.json(equiposAsignados);
    } catch (error) {
      console.error('Error en porUsuario:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async porStock(req, res) {
    try {
      const { stockId } = req.params;
      const historial = await prisma.equipo_asignado.findMany({
        where: { stock_equipos_id: parseInt(stockId) },
        include: {
          usuarios: true,
          usuario: true
        },
        orderBy: { fecha_asignacion: 'desc' }
      });

      res.json(historial);
    } catch (error) {
      console.error('Error en porStock:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async reporte(req, res) {
    try {
      const { estado, fecha_desde, fecha_hasta } = req.query;
      
      let where = {};
      
      if (estado) {
        where.estado = estado;
      }
      
      if (fecha_desde) {
        where.fecha_asignacion = {
          gte: new Date(fecha_desde)
        };
      }
      
      if (fecha_hasta) {
        where.fecha_asignacion = {
          ...where.fecha_asignacion,
          lte: new Date(fecha_hasta)
        };
      }

      const equiposAsignados = await prisma.equipo_asignado.findMany({
        where,
        include: {
          usuarios: true,
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          }
        }
      });

      res.json(equiposAsignados);
    } catch (error) {
      console.error('Error en reporte:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async estadisticas(req, res) {
    try {
      const totalAsignaciones = await prisma.equipo_asignado.count();
      const asignacionesActivas = await prisma.equipo_asignado.count({
        where: { estado: 'activo' }
      });
      const asignacionesDevueltas = await prisma.equipo_asignado.count({
        where: { estado: 'devuelto' }
      });
      const asignacionesObsoletas = await prisma.equipo_asignado.count({
        where: { estado: 'obsoleto' }
      });
      
      const asignacionesPorEstado = await prisma.equipo_asignado.groupBy({
        by: ['estado'],
        _count: {
          id: true
        }
      });

      const asignacionesPorMes = await prisma.$queryRaw`
        SELECT 
          YEAR(fecha_asignacion) as año, 
          MONTH(fecha_asignacion) as mes, 
          COUNT(*) as total
        FROM equipo_asignado 
        GROUP BY año, mes 
        ORDER BY año DESC, mes DESC
      `;

      res.json({
        total_asignaciones: totalAsignaciones,
        asignaciones_activas: asignacionesActivas,
        asignaciones_devueltas: asignacionesDevueltas,
        asignaciones_obsoletas: asignacionesObsoletas,
        asignaciones_por_estado: asignacionesPorEstado,
        asignaciones_por_mes: asignacionesPorMes
      });
    } catch (error) {
      console.error('Error en estadisticas:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async apiIndex(req, res) {
    try {
      const equiposAsignados = await prisma.equipo_asignado.findMany({
        include: {
          usuarios: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              cargo: true,
              correo: true
            }
          },
          usuario: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          stock_equipos: {
            include: {
              tipo_equipo: {
                select: {
                  id: true,
                  nombre: true,
                  requiere_ip: true
                }
              }
            }
          }
        },
        orderBy: { id: 'asc' }
      });

      console.log('Equipos asignados cargados:', equiposAsignados.length);
      res.json(equiposAsignados);
    } catch (error) {
      console.error('Error en apiIndex:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async apiShow(req, res) {
    try {
      const { id } = req.params;
      const equipoAsignado = await prisma.equipo_asignado.findUnique({
        where: { id: parseInt(id) },
        include: {
          usuarios: {
            include: {
              sede: true,
              departamento: true
            }
          },
          usuario: true,
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          }
        }
      });

      if (!equipoAsignado) {
        return res.status(404).json({ error: 'Asignación no encontrada' });
      }

      res.json(equipoAsignado);
    } catch (error) {
      console.error('Error en apiShow:', error);
      res.status(500).json({ error: error.message });
    }
  },

   async generarPdfAsignaciones(req, res) {
    console.log('=== GENERAR PDF ASIGNACIONES INICIADO ===');
   try {
        const equiposAsignados = await prisma.equipo_asignado.findMany({
            select: { // CAMBIAR include por select para controlar explícitamente los campos
                id: true,
                usuarios_id: true,
                stock_equipos_id: true,
                fecha_asignacion: true,
                fecha_devolucion: true,
                ip_equipo: true,
                cereal_equipo: true, // ¡IMPORTANTE! Incluir este campo
                observaciones: true,
                estado: true,
                created_at: true,
                updated_at: true,
                usuarios: {
                    select: {
                        id: true,
                        nombre: true,
                        apellido: true,
                        cargo: true,
                        correo: true,
                        sede: {
                            select: {
                                nombre: true
                            }
                        },
                        departamento: {
                            select: {
                                nombre: true
                            }
                        }
                    }
                },
                usuario: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                stock_equipos: {
                    include: {
                        tipo_equipo: {
                            select: {
                                id: true,
                                nombre: true,
                                requiere_ip: true,
                                requiere_cereal: true
                            }
                        }
                    }
                }
            },
            orderBy: [
                { estado: 'asc' },
                { fecha_asignacion: 'desc' }
            ]
        });

        console.log(`📊 ${equiposAsignados.length} asignaciones encontradas`);
        
        // Formatear los datos para la plantilla EJS
        const asignacionesProcesadas = equiposAsignados.map(asignacion => {
            const usuario = asignacion.usuarios || {};
            const stock = asignacion.stock_equipos || {};
            const tipoEquipo = stock.tipo_equipo || {};
            const asignador = asignacion.usuario || {};
            
            return {
                // Propiedades básicas
                id: asignacion.id,
                usuarios_id: asignacion.usuarios_id,
                stock_equipos_id: asignacion.stock_equipos_id,
                fecha_asignacion: asignacion.fecha_asignacion,
                fecha_devolucion: asignacion.fecha_devolucion,
                ip_equipo: asignacion.ip_equipo,
                cereal_equipo: asignacion.cereal_equipo, // ¡AHORA SÍ ESTARÁ DISPONIBLE!
                observaciones: asignacion.observaciones,
                estado: asignacion.estado,
                created_at: asignacion.created_at,
                updated_at: asignacion.updated_at,
                
                // Relaciones
                usuarioAsignado: {
                    id: usuario.id || 0,
                    nombre: usuario.nombre || 'N/A',
                    apellido: usuario.apellido || '',
                    cargo: usuario.cargo || 'Sin cargo',
                    correo: usuario.correo || 'Sin correo',
                    sede: usuario.sede || { nombre: 'Sin sede' },
                    departamento: usuario.departamento || { nombre: 'Sin departamento' }
                },
                stockEquipo: {
                    id: stock.id || 0,
                    marca: stock.marca || 'N/A',
                    modelo: stock.modelo || '',
                    descripcion: stock.descripcion || '',
                    tipoEquipo: {
                        id: tipoEquipo.id || 0,
                        nombre: tipoEquipo.nombre || 'Sin tipo',
                        requiere_ip: tipoEquipo.requiere_ip || false,
                        requiere_cereal: tipoEquipo.requiere_cereal || false
                    }
                },
                usuarioAsignador: {
                    id: asignador.id || 0,
                    name: asignador.name || 'Sistema',
                    email: asignador.email || 'N/A'
                },
                
                // Propiedades formateadas
                fecha_asignacion_formateada: asignacion.fecha_asignacion ? 
                    new Date(asignacion.fecha_asignacion).toLocaleDateString('es-ES') : 'N/A',
                fecha_devolucion_formateada: asignacion.fecha_devolucion ? 
                    new Date(asignacion.fecha_devolucion).toLocaleDateString('es-ES') : 'No devuelto'
            };
        });

        // Verificar que ahora sí viene el cereal_equipo
        console.log('🔍 Verificando cereal_equipo en datos procesados:');
        if (asignacionesProcesadas.length > 0) {
            console.log('Primera asignación - cereal_equipo:', asignacionesProcesadas[0].cereal_equipo);
        }

        const totalAsignaciones = asignacionesProcesadas.length;
        const asignacionesActivas = asignacionesProcesadas.filter(a => a.estado === 'activo').length;
        const asignacionesDevueltas = asignacionesProcesadas.filter(a => a.estado === 'devuelto').length;
        const asignacionesObsoletas = asignacionesProcesadas.filter(a => a.estado === 'obsoleto').length;

        const asignacionesPorTipo = {};
        asignacionesProcesadas.forEach(asignacion => {
            const tipoNombre = asignacion.stockEquipo.tipoEquipo.nombre;
            if (!asignacionesPorTipo[tipoNombre]) {
                asignacionesPorTipo[tipoNombre] = 0;
            }
            asignacionesPorTipo[tipoNombre]++;
        });

        const data = {
            equiposAsignados: asignacionesProcesadas,
            fechaGeneracion: new Date().toLocaleString('es-ES'),
            totalAsignaciones: totalAsignaciones,
            asignacionesActivas: asignacionesActivas,
            asignacionesDevueltas: asignacionesDevueltas,
            asignacionesObsoletas: asignacionesObsoletas,
            asignacionesPorTipo: asignacionesPorTipo
        };

        console.log('📄 Generando HTML para PDF...');
        console.log('📋 Datos para la plantilla:', {
            total: data.equiposAsignados.length,
            primeraAsignacion: data.equiposAsignados[0] ? {
                usuario: data.equiposAsignados[0].usuarioAsignado,
                equipo: data.equiposAsignados[0].stockEquipo
            } : 'No hay asignaciones'
        });

        const htmlContent = await renderTemplate(req.app, 'pdfs/asignaciones', data);
        
        console.log('🖨️ Generando PDF...');
        const pdfBuffer = await PuppeteerPDF.generatePDF(htmlContent, {
            format: 'Letter',
            landscape: true
        });

        console.log('✅ PDF generado exitosamente');

        if (res.headersSent) return;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="reporte-asignaciones.pdf"');
        res.setHeader('Content-Length', pdfBuffer.length);
        res.setHeader('Cache-Control', 'no-cache');

        res.end(pdfBuffer);

    } catch (error) {
        console.error('❌ ERROR generando PDF de asignaciones:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Error al generar el PDF: ' + error.message
            });
        }
    }
},

// Aplicar la misma corrección a verPdfAsignaciones
async verPdfAsignaciones(req, res) {
    console.log('=== VER PDF ASIGNACIONES INICIADO ===');
  try {
        const equiposAsignados = await prisma.equipo_asignado.findMany({
            select: { // CAMBIAR include por select
                id: true,
                usuarios_id: true,
                stock_equipos_id: true,
                fecha_asignacion: true,
                fecha_devolucion: true,
                ip_equipo: true,
                cereal_equipo: true, // ¡IMPORTANTE! Incluir este campo
                observaciones: true,
                estado: true,
                usuarios: {
                    select: {
                        id: true,
                        nombre: true,
                        apellido: true,
                        cargo: true,
                        correo: true,
                        sede: {
                            select: {
                                nombre: true
                            }
                        },
                        departamento: {
                            select: {
                                nombre: true
                            }
                        }
                    }
                },
                usuario: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                stock_equipos: {
                    include: {
                        tipo_equipo: {
                            select: {
                                id: true,
                                nombre: true,
                                requiere_ip: true,
                                requiere_cereal: true
                            }
                        }
                    }
                }
            },
            orderBy: [
                { estado: 'asc' },
                { fecha_asignacion: 'desc' }
            ]
        });

        // CORREGIR: Usar el mismo formateo que en generarPdfAsignaciones
        const asignacionesProcesadas = equiposAsignados.map(asignacion => {
            const usuario = asignacion.usuarios || {};
            const stock = asignacion.stock_equipos || {};
            const tipoEquipo = stock.tipo_equipo || {};
            const asignador = asignacion.usuario || {};
            
            return {
                id: asignacion.id,
                usuarios_id: asignacion.usuarios_id,
                stock_equipos_id: asignacion.stock_equipos_id,
                fecha_asignacion: asignacion.fecha_asignacion,
                fecha_devolucion: asignacion.fecha_devolucion,
                ip_equipo: asignacion.ip_equipo,
                numero_serie: asignacion.cereal_equipo, 
                cereal_equipo: asignacion.cereal_equipo,
                observaciones: asignacion.observaciones,
                estado: asignacion.estado,
                
                // NOMBRES CORRECTOS para la plantilla
                usuarioAsignado: {
                    id: usuario.id || 0,
                    nombre: usuario.nombre || 'N/A',
                    apellido: usuario.apellido || '',
                    cargo: usuario.cargo || 'Sin cargo',
                    correo: usuario.correo || 'Sin correo',
                    sede: usuario.sede || { nombre: 'Sin sede' },
                    departamento: usuario.departamento || { nombre: 'Sin departamento' }
                },
                stockEquipo: {
                    id: stock.id || 0,
                    marca: stock.marca || 'N/A',
                    modelo: stock.modelo || '',
                    tipoEquipo: {
                        id: tipoEquipo.id || 0,
                        nombre: tipoEquipo.nombre || 'Sin tipo',
                        requiere_ip: tipoEquipo.requiere_ip || false,
                        requiere_cereal: tipoEquipo.requiere_cereal || false,
                    }
                },
                usuarioAsignador: {
                    id: asignador.id || 0,
                    name: asignador.name || 'Sistema',
                    email: asignador.email || 'N/A'
                },
                
                fecha_asignacion_formateada: asignacion.fecha_asignacion ? 
                    new Date(asignacion.fecha_asignacion).toLocaleDateString('es-ES') : 'N/A',
                fecha_devolucion_formateada: asignacion.fecha_devolucion ? 
                    new Date(asignacion.fecha_devolucion).toLocaleDateString('es-ES') : 'No devuelto'
            };
        });

        const totalAsignaciones = asignacionesProcesadas.length;
        const asignacionesActivas = asignacionesProcesadas.filter(a => a.estado === 'activo').length;
        const asignacionesDevueltas = asignacionesProcesadas.filter(a => a.estado === 'devuelto').length;
        const asignacionesObsoletas = asignacionesProcesadas.filter(a => a.estado === 'obsoleto').length;

        const asignacionesPorTipo = {};
        asignacionesProcesadas.forEach(asignacion => {
            const tipoNombre = asignacion.stockEquipo.tipoEquipo.nombre;
            if (!asignacionesPorTipo[tipoNombre]) {
                asignacionesPorTipo[tipoNombre] = 0;
            }
            asignacionesPorTipo[tipoNombre]++;
        });

        const data = {
            equiposAsignados: asignacionesProcesadas,
            fechaGeneracion: new Date().toLocaleString('es-ES'),
            totalAsignaciones: totalAsignaciones,
            asignacionesActivas: asignacionesActivas,
            asignacionesDevueltas: asignacionesDevueltas,
            asignacionesObsoletas: asignacionesObsoletas,
            asignacionesPorTipo: asignacionesPorTipo
        };

        const htmlContent = await renderTemplate(req.app, 'pdfs/asignaciones', data);
        const pdfBuffer = await PuppeteerPDF.generatePDF(htmlContent, {
            format: 'Letter',
            landscape: true
        });

        console.log('=== VER PDF ASIGNACIONES GENERADO EXITOSAMENTE ===');

        if (res.headersSent) return;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="reporte-asignaciones.pdf"');
        res.setHeader('Content-Length', pdfBuffer.length);
        res.setHeader('Cache-Control', 'no-cache');

        res.end(pdfBuffer);

    } catch (error) {
        console.error('ERROR viendo PDF de asignaciones:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Error al cargar el PDF: ' + error.message 
            });
        }
    }
},

async generarPdfPorUsuario(req, res) {
    console.log('=== GENERAR PDF POR USUARIO INICIADO ===');
    
    try {
        const { usuarioId } = req.params;

        // Obtener o crear el contador de registros
        let contador = await prisma.contadorRegistros.upsert({
            where: { tipo: 'reporte_equipos' },
            update: { ultimoNumero: { increment: 1 } },
            create: { 
                tipo: 'reporte_equipos',
                ultimoNumero: 1
            }
        });

        // Formatear el número de registro (T0001, T0002, etc.)
        const numeroRegistro = `T${contador.ultimoNumero.toString().padStart(4, '0')}`;

        const usuario = await prisma.usuarios.findUnique({
            where: { id: parseInt(usuarioId) },
            include: {
                sede: { select: { nombre: true } },
                departamento: { select: { nombre: true } }
            }
        });

        if (!usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const equiposAsignados = await prisma.equipo_asignado.findMany({
            where: { usuarios_id: parseInt(usuarioId) },
            select: { // CAMBIAR include por select
                id: true,
                fecha_asignacion: true,
                fecha_devolucion: true,
                ip_equipo: true,
                cereal_equipo: true, 
                estado: true,
                stock_equipos: {
                    include: {
                        tipo_equipo: { select: { nombre: true } }
                    }
                },
                usuario: {
                    select: { name: true }
                }
            },
            orderBy: [
                { estado: 'asc' },
                { fecha_asignacion: 'desc' }
            ]
        });

        // Formatear los datos para la plantilla
        const equiposProcesados = equiposAsignados.map(asignacion => {
            const stock = asignacion.stock_equipos || {};
            const tipoEquipo = stock.tipo_equipo || {};
            const asignador = asignacion.usuario || {};
            
            return {
                id: asignacion.id,
                fecha_asignacion: asignacion.fecha_asignacion,
                fecha_devolucion: asignacion.fecha_devolucion,
                ip_equipo: asignacion.ip_equipo,
                cereal_equipo: asignacion.cereal_equipo, 
                estado: asignacion.estado,
                
                stockEquipo: {
                    id: stock.id || 0,
                    marca: stock.marca || 'N/A',
                    modelo: stock.modelo || '',
                    descripcion: stock.descripcion || '',
                    tipoEquipo: {
                        nombre: tipoEquipo.nombre || 'Sin tipo'
                    }
                },
                usuarioAsignador: {
                    name: asignador.name || 'Sistema'
                }
            };
        });

        const totalEquipos = equiposProcesados.length;
        const equiposActivos = equiposProcesados.filter(a => a.estado === 'activo').length;
        const equiposDevueltos = equiposProcesados.filter(a => a.estado === 'devuelto').length;
        const equiposObsoletos = equiposProcesados.filter(a => a.estado === 'obsoleto').length;

        const data = {
            usuario: usuario,
            equiposAsignados: equiposProcesados,
            fechaGeneracion: new Date().toLocaleString('es-ES'),
            totalEquipos: totalEquipos,
            equiposActivos: equiposActivos,
            equiposDevueltos: equiposDevueltos,
            equiposObsoletos: equiposObsoletos,
            formatoDuplicado: true,
            numeroRegistro: numeroRegistro 
        };

        const htmlContent = await renderTemplate(req.app, 'pdfs/asignaciones-usuario', data);
        const pdfBuffer = await PuppeteerPDF.generatePDF(htmlContent, {
            format: 'Letter',
            landscape: false
        });

        console.log('=== PDF POR USUARIO GENERADO EXITOSAMENTE ===');
        console.log(`Número de registro asignado: ${numeroRegistro}`);

        if (res.headersSent) return;

        const nombreArchivo = `equipos-${usuario.nombre.replace(/\s+/g, '-')}-${numeroRegistro}.pdf`;
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.setHeader('Cache-Control', 'no-cache');

        res.end(pdfBuffer);

    } catch (error) {
        console.error('ERROR generando PDF por usuario:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Error al generar el PDF: ' + error.message 
            });
        }
    }
},

async verPdfPorUsuario(req, res) {
    console.log('=== VER PDF POR USUARIO INICIADO ===');
    
    try {
        const { usuarioId } = req.params;

        // Obtener el contador actual sin incrementarlo (solo para visualización)
        let contador = await prisma.contadorRegistros.findUnique({
            where: { tipo: 'reporte_equipos' }
        });

        // Si no existe el contador, crear uno temporal
        if (!contador) {
            contador = { ultimoNumero: 1 };
        }

        const numeroRegistro = `T${contador.ultimoNumero.toString().padStart(4, '0')}`;

        const usuario = await prisma.usuarios.findUnique({
            where: { id: parseInt(usuarioId) },
            include: {
                sede: { select: { nombre: true } },
                departamento: { select: { nombre: true } }
            }
        });

        if (!usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

       const equiposAsignados = await prisma.equipo_asignado.findMany({
            where: { usuarios_id: parseInt(usuarioId) },
            select: { // CAMBIAR include por select
                id: true,
                fecha_asignacion: true,
                fecha_devolucion: true,
                ip_equipo: true,
                cereal_equipo: true, 
                estado: true,
                stock_equipos: {
                    include: {
                        tipo_equipo: { select: { nombre: true } }
                    }
                },
                usuario: {
                    select: { name: true }
                }
            },
            orderBy: [
                { estado: 'asc' },
                { fecha_asignacion: 'desc' }
            ]
        });

        const equiposProcesados = equiposAsignados.map(asignacion => {
            const stock = asignacion.stock_equipos || {};
            const tipoEquipo = stock.tipo_equipo || {};
            const asignador = asignacion.usuario || {};
            
            return {
                id: asignacion.id,
                fecha_asignacion: asignacion.fecha_asignacion,
                fecha_devolucion: asignacion.fecha_devolucion,
                ip_equipo: asignacion.ip_equipo,
                cereal_equipo: asignacion.cereal_equipo, 
                estado: asignacion.estado,
                
                stockEquipo: {
                    id: stock.id || 0,
                    marca: stock.marca || 'N/A',
                    modelo: stock.modelo || '',
                    descripcion: stock.descripcion || '',
                    tipoEquipo: {
                        nombre: tipoEquipo.nombre || 'Sin tipo'
                    }
                },
                usuarioAsignador: {
                    name: asignador.name || 'Sistema'
                }
            };
        });

        const totalEquipos = equiposProcesados.length;
        const equiposActivos = equiposProcesados.filter(a => a.estado === 'activo').length;
        const equiposDevueltos = equiposProcesados.filter(a => a.estado === 'devuelto').length;
        const equiposObsoletos = equiposProcesados.filter(a => a.estado === 'obsoleto').length;

        const data = {
            usuario: usuario,
            equiposAsignados: equiposProcesados,
            fechaGeneracion: new Date().toLocaleString('es-ES'),
            totalEquipos: totalEquipos,
            equiposActivos: equiposActivos,
            equiposDevueltos: equiposDevueltos,
            equiposObsoletos: equiposObsoletos,
            formatoDuplicado: true,
            numeroRegistro: numeroRegistro
        };

        const htmlContent = await renderTemplate(req.app, 'pdfs/asignaciones-usuario', data);
        const pdfBuffer = await PuppeteerPDF.generatePDF(htmlContent, {
            format: 'Letter',
            landscape: false
        });

        console.log('=== VER PDF POR USUARIO GENERADO EXITOSAMENTE ===');

        if (res.headersSent) return;

        const nombreArchivo = `equipos-${usuario.nombre.replace(/\s+/g, '-')}-${numeroRegistro}.pdf`;
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${nombreArchivo}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.setHeader('Cache-Control', 'no-cache');

        res.end(pdfBuffer);

    } catch (error) {
        console.error('ERROR viendo PDF por usuario:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Error al cargar el PDF: ' + error.message 
            });
        }
    }
}
}