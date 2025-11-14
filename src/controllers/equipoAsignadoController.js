import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import PuppeteerPDF from '../services/puppeteerPDF.js';
import { renderTemplate } from '../helpers/renderHelper.js';
import FileUploadService from '../services/fileUploadService.js';

export const equipoAsignadoController = {
  async index(req, res) {
      try {
          const page = parseInt(req.query.page) || 1;
          const limit = 10;
          const skip = (page - 1) * limit;

    
          const { usuario, equipo, estado } = req.query;
          
          console.log(' Filtros recibidos en equipos asignados:', { usuario, equipo, estado });

  
          let whereClause = {};

        
          if (usuario) {
              whereClause.usuarios = {
                  OR: [
                      { nombre: { contains: usuario, mode: 'insensitive' } },
                      { apellido: { contains: usuario, mode: 'insensitive' } }
                  ]
              };
          }


          if (equipo) {
              whereClause.stock_equipos = {
                  OR: [
                      { marca: { contains: equipo, mode: 'insensitive' } },
                      { modelo: { contains: equipo, mode: 'insensitive' } }
                  ]
              };
          }


          if (estado) {
              whereClause.estado = estado;
          }

          console.log(' Where clause para equipos asignados:', JSON.stringify(whereClause, null, 2));


          const total = await prisma.equipo_asignado.count({
              where: whereClause
          });

          console.log(` Total de asignaciones con filtros: ${total}`);

  
          let equiposAsignados = [];
          if (total > 0) {
              equiposAsignados = await prisma.equipo_asignado.findMany({
                  where: whereClause,
                  skip,
                  take: limit,
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
          }

          console.log('Equipos asignados encontrados:', equiposAsignados.length);
          

          const response = equiposAsignados.map(asignacion => ({
              id: asignacion.id,
              usuarios_id: asignacion.usuarios_id,
              stock_equipos_id: asignacion.stock_equipos_id,
              fecha_asignacion: asignacion.fecha_asignacion,
              fecha_devolucion: asignacion.fecha_devolucion,
              ip_equipo: asignacion.ip_equipo,
              numero_serie: asignacion.cereal_equipo,
              observaciones: asignacion.observaciones,
              estado: asignacion.estado,
              created_at: asignacion.created_at,
              updated_at: asignacion.updated_at,
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

          res.json({
              equiposAsignados: response,
              pagination: {
                  current: page,
                  total: Math.ceil(total / limit),
                  totalRecords: total
              }
          });

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

      console.log('Datos recibidos para crear asignación:', {
        usuarios_id,
        stock_equipos_id,
        fecha_asignacion,
        ip_equipo,
        numero_serie,
        fecha_devolucion,
        observaciones,
        estado
      });

      console.log('Creación - No se procesa imagen');

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

      const equipoAsignado = await prisma.equipo_asignado.create({
        data: {
          usuarios_id: parseInt(usuarios_id),
          stock_equipos_id: parseInt(stock_equipos_id),
          fecha_asignacion: new Date(fecha_asignacion),
          ip_equipo,
          cereal_equipo: numero_serie, 
          fecha_devolucion: fecha_devolucion ? new Date(fecha_devolucion) : null,
          observaciones,
          usuario_id: req.user.id,
          estado,
          imagen_comprobante: null 
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

      const response = {
        ...equipoAsignado,
        numero_serie: equipoAsignado.cereal_equipo || null,
        imagen_url: equipoAsignado.imagen_comprobante 
          ? `/uploads/${equipoAsignado.imagen_comprobante}`
          : null
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
        estado,
        delete_imagen 
      } = req.body;

      console.log('Datos recibidos para actualizar asignación:', {
        usuarios_id,
        stock_equipos_id,
        fecha_asignacion,
        ip_equipo,
        numero_serie,
        fecha_devolucion,
        observaciones,
        estado,
        delete_imagen
      });

      const equipoAsignado = await prisma.equipo_asignado.findUnique({
        where: { id: parseInt(id) }
      });

      if (!equipoAsignado) {
        return res.status(404).json({ error: 'Asignación no encontrada' });
      }

      let imagenPath = equipoAsignado.imagen_comprobante;
      
      if (delete_imagen === 'true') {
        console.log('Eliminando imagen existente...');
        if (equipoAsignado.imagen_comprobante) {
          await FileUploadService.deleteFile(equipoAsignado.imagen_comprobante);
        }
        imagenPath = null;
      }
      
      if (req.file) {
        console.log('Procesando imagen de comprobante en edición...');
        
        try {
          FileUploadService.validateImage(req.file);
          
          if (equipoAsignado.imagen_comprobante && delete_imagen !== 'true') {
            await FileUploadService.deleteFile(equipoAsignado.imagen_comprobante);
          }
          
          imagenPath = await FileUploadService.uploadFile(req.file, 'equipos/comprobantes');
          console.log('Imagen subida:', imagenPath);
        } catch (uploadError) {
          console.error('Error subiendo imagen:', uploadError);
          return res.status(400).json({ error: `Error al subir imagen: ${uploadError.message}` });
        }
      }

    const nuevoEstado = estado;
    const estadoAnterior = equipoAsignado.estado;

    if (nuevoEstado === 'obsoleto' && estadoAnterior !== 'obsoleto') {
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
          imagen_comprobante: imagenPath, 
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

      if (equipoAsignado.imagen_comprobante) {
        await FileUploadService.deleteFile(equipoAsignado.imagen_comprobante);
      }

      if (equipoAsignado.estado === 'obsoleto') {
        await prisma.equipo_asignado.delete({
          where: { id: parseInt(id) }
        });
        
        return res.json({ 
          message: 'Asignación obsoleta eliminada exitosamente.' 
        });
      }

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

      const updated = await prisma.equipo_asignado.update({
        where: { id: parseInt(id) },
        data: {
          estado: 'obsoleto',
          fecha_devolucion: new Date() 
        }
      });
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

        const stockActualizado = await prisma.stock_equipos.findUnique({
          where: { id: stockEquipo.id }
        });

        if (stockActualizado.cantidad_total <= 0) {
          await prisma.stock_equipos.delete({
            where: { id: stockEquipo.id }
          });
          console.log(`Equipo de stock ${stockEquipo.id} eliminado por cantidad total 0`);
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
            select: {
                id: true,
                usuarios_id: true,
                stock_equipos_id: true,
                fecha_asignacion: true,
                fecha_devolucion: true,
                ip_equipo: true,
                cereal_equipo: true, 
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

        console.log(`${equiposAsignados.length} asignaciones encontradas`);
        

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
                cereal_equipo: asignacion.cereal_equipo, 
                observaciones: asignacion.observaciones,
                estado: asignacion.estado,
                created_at: asignacion.created_at,
                updated_at: asignacion.updated_at,
                
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
                
                fecha_asignacion_formateada: asignacion.fecha_asignacion ? 
                    new Date(asignacion.fecha_asignacion).toLocaleDateString('es-ES') : 'N/A',
                fecha_devolucion_formateada: asignacion.fecha_devolucion ? 
                    new Date(asignacion.fecha_devolucion).toLocaleDateString('es-ES') : 'No devuelto'
            };
        });

        console.log('Verificando cereal_equipo en datos procesados:');
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

        const htmlContent = await renderTemplate(req.app, 'pdfs/asignaciones', data);
        
        console.log('Generando PDF...');
        const pdfBuffer = await PuppeteerPDF.generatePDF(htmlContent, {
            format: 'Letter',
            landscape: true
        });

        console.log('PDF generado exitosamente');

        if (res.headersSent) return;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="reporte-asignaciones.pdf"');
        res.setHeader('Content-Length', pdfBuffer.length);
        res.setHeader('Cache-Control', 'no-cache');

        res.end(pdfBuffer);

    } catch (error) {
        console.error('ERROR generando PDF de asignaciones:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Error al generar el PDF: ' + error.message
            });
        }
    }
  },

  async verPdfAsignaciones(req, res) {
      console.log('=== VER PDF ASIGNACIONES INICIADO ===');
    try {
          const equiposAsignados = await prisma.equipo_asignado.findMany({
              select: {
                  id: true,
                  usuarios_id: true,
                  stock_equipos_id: true,
                  fecha_asignacion: true,
                  fecha_devolucion: true,
                  ip_equipo: true,
                  cereal_equipo: true, 
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

          let contador = await prisma.contadorRegistros.upsert({
              where: { tipo: 'reporte_equipos' },
              update: { ultimoNumero: { increment: 1 } },
              create: { 
                  tipo: 'reporte_equipos',
                  ultimoNumero: 1
              }
          });

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
              select: { 
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

          let contador = await prisma.$transaction(async (tx) => {
              let counter = await tx.contadorRegistros.findUnique({
                  where: { tipo: 'reporte_equipos' }
              });

              if (!counter) {
                  counter = await tx.contadorRegistros.create({
                      data: {
                          tipo: 'reporte_equipos',
                          ultimoNumero: 1
                      }
                  });
              } else {
                  counter = await tx.contadorRegistros.update({
                      where: { tipo: 'reporte_equipos' },
                      data: {
                          ultimoNumero: { increment: 1 }
                      }
                  });
              }

              return counter;
          });

          const numeroRegistro = `T${contador.ultimoNumero.toString().padStart(4, '0')}`;
          console.log(`Número de registro generado: ${numeroRegistro}`);

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
              select: {
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
        console.log(`Número de registro utilizado: ${numeroRegistro}`);

        if (res.headersSent) return;

        const nombreArchivo = `equipos-${usuario.nombre.replace(/\s+/g, '-')}-${numeroRegistro}.pdf`;
          
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${nombreArchivo}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

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