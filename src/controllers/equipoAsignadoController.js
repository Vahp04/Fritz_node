import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import PuppeteerPDF from '../services/puppeteerPDF.js';
import PDFDocument from 'pdfkit';
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

          if (ip_equipo) {
        const ipExistente = await prisma.equipo_asignado.findFirst({
          where: { ip_equipo }
        });
        if (ipExistente) {
          return res.status(400).json({ error: 'La dirección IP ya está en uso por otro equipo' });
        }
      }

      if (numero_serie) {
        const cerealExistente = await prisma.equipo_asignado.findFirst({
          where: { cereal_equipo: numero_serie }
        });
        if (cerealExistente) {
          return res.status(400).json({ error: 'El número de serie ya está en uso por otro equipo' });
        }
      }

        console.log('=== DEBUG STORE INICIADO ===');
        console.log('Datos recibidos:', {
            usuarios_id: parseInt(usuarios_id),
            stock_equipos_id: parseInt(stock_equipos_id),
            estado
        });

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

           const asignacionExistente = await prisma.equipo_asignado.findFirst({
            where: {
                usuarios_id: parseInt(usuarios_id),
                stock_equipos_id: parseInt(stock_equipos_id),
                estado: {
                    in: ['activo', 'devuelto']
                }
            }
        });

        console.log('Resultado de búsqueda de duplicados:', asignacionExistente);

        if (asignacionExistente) {
            console.log('DUPLICADO DETECTADO:', {
                id_existente: asignacionExistente.id,
                usuario_id_existente: asignacionExistente.usuarios_id,
                equipo_id_existente: asignacionExistente.stock_equipos_id,
                estado_existente: asignacionExistente.estado
            });
            return res.status(400).json({ 
                error: 'Ya existe una asignación para este usuario y equipo' 
            });
        }

        console.log('No se encontraron duplicados, procediendo con la creación...');

        if (asignacionExistente) {
            console.log('Asignación duplicada detectada:', asignacionExistente.id);
            return res.status(400).json({ 
                error: 'Ya existe una asignación para este usuario y equipo' 
            });
        }

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
    
    if (error.code === 'P2002') {
      const campo = error.meta?.target?.[0];
      const mensajes = {
        ip_equipo: 'La dirección IP ya está en uso',
        cereal_equipo: 'El número de serie ya está en uso'
      };
      return res.status(400).json({ 
        error: mensajes[campo] || 'El valor ya existe en otro registro' 
      });
    }
    
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

      const equipoAsignado = await prisma.equipo_asignado.findUnique({
        where: { id: parseInt(id) }
      });

      if (!equipoAsignado) {
        return res.status(404).json({ error: 'Asignación no encontrada' });
      }


       const equipoId = parseInt(id);
      if (ip_equipo) {
      const ipExistente = await prisma.equipo_asignado.findFirst({
        where: {
          ip_equipo,
          id: { not: equipoId }
        }
      });
      if (ipExistente) {
        return res.status(400).json({ error: 'La dirección IP ya está en uso por otro equipo' });
      }
    }

    if (numero_serie) {
      const cerealExistente = await prisma.equipo_asignado.findFirst({
        where: {
          cereal_equipo: numero_serie,
          id: { not: equipoId }
        }
      });
      if (cerealExistente) {
        return res.status(400).json({ error: 'El número de serie ya está en uso por otro equipo' });
      }
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
    if (error.code === 'P2002') {
      const campo = error.meta?.target?.[0];
      const mensajes = {
        ip_equipo: 'La dirección IP ya está en uso',
        cereal_equipo: 'El número de serie ya está en uso'
      };
      return res.status(400).json({ 
        error: mensajes[campo] || 'El valor ya existe en otro registro' 
      });
    }
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
        const { usuario, equipo, estado } = req.query;
        
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

        console.log('Where clause para estadísticas:', JSON.stringify(whereClause, null, 2));

        const totalAsignaciones = await prisma.equipo_asignado.count({
            where: whereClause
        });

        const asignacionesActivas = await prisma.equipo_asignado.count({
            where: { 
                ...whereClause,
                estado: 'activo' 
            }
        });

        const asignacionesDevueltas = await prisma.equipo_asignado.count({
            where: { 
                ...whereClause,
                estado: 'devuelto' 
            }
        });

        const asignacionesObsoletas = await prisma.equipo_asignado.count({
            where: { 
                ...whereClause,
                estado: 'obsoleto' 
            }
        });
        
        const asignacionesPorEstado = await prisma.equipo_asignado.groupBy({
            by: ['estado'],
            _count: {
                id: true
            },
            where: whereClause
        });

        const asignacionesPorMes = [];

        res.json({
            total_asignaciones: totalAsignaciones,
            asignaciones_activas: asignacionesActivas,
            asignaciones_devueltas: asignacionesDevueltas,
            asignaciones_obsoletas: asignacionesObsoletas,
            asignaciones_por_estado: asignacionesPorEstado,
            asignaciones_por_mes: asignacionesPorMes,
            filtros_aplicados: { usuario, equipo, estado } 
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

        console.log('Generando PDF con PDFKit...');

        // Crear documento PDF
        const doc = new PDFDocument({ 
            margin: 20,
            size: 'LETTER',
            layout: 'landscape'
        });

        if (res.headersSent) return;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="reporte-asignaciones.pdf"');
        res.setHeader('Cache-Control', 'no-cache');

        // Pipe el PDF a la respuesta
        doc.pipe(res);

        // Función helper para formatear porcentaje
        const formatPercent = (value, total) => {
            return total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%';
        };

        // ===== HEADER =====
        // Logo placeholder
        doc.fillColor('#DC2626')
           .rect(20, 20, 60, 40)
           .fill()
           .fillColor('white')
           .fontSize(10)
           .text('FRITZ C.A', 25, 35, { width: 50, align: 'center' });

        // Título
        doc.fillColor('#DC2626')
           .fontSize(12)
           .font('Helvetica-Bold')
           .text('Reporte de Equipos Asignados', 90, 25, {align: 'center'});
        
        doc.fillColor('#666')
           .fontSize(10)
           .font('Helvetica')
           .text('Sistema de Gestión de Inventario', 90, 50, {align: 'center'});

        doc.moveTo(20, 70)
           .lineTo(770, 70)
           .strokeColor('#DC2626')
           .lineWidth(2)
           .stroke();

        let yPosition = 85;

        // ===== INFORMACIÓN GENERAL =====
        doc.rect(20, yPosition, 750, 30)
           .fillColor('#e9ecef')
           .fill();
        
        doc.fillColor('#333')
           .fontSize(10)
           .font('Helvetica-Bold')
           .text('Fecha de generación:', 25, yPosition + 8)
           .font('Helvetica')
           .text(data.fechaGeneracion, 250, yPosition + 8);
        
        doc.font('Helvetica-Bold')
           .text('Total de asignaciones:', 25, yPosition + 20)
           .font('Helvetica')
           .text(data.totalAsignaciones.toString(), 250, yPosition + 20);

        yPosition += 40;

        // ===== ESTADÍSTICAS =====
        const stats = [
            { label: 'Activas', value: data.asignacionesActivas },
            { label: 'Devueltas', value: data.asignacionesDevueltas },
            { label: 'Obsoletas', value: data.asignacionesObsoletas },
            { label: 'Total', value: data.totalAsignaciones }
        ];

        const statWidth = 180;
        stats.forEach((stat, index) => {
            const x = 20 + (index * statWidth);
            
            doc.rect(x, yPosition, statWidth - 10, 35)
               .fillColor('#e9ecef')
               .fill();
            
            doc.fillColor('#DC2626')
               .fontSize(16)
               .font('Helvetica-Bold')
               .text(stat.value.toString(), x + 5, yPosition + 5, { width: statWidth - 20, align: 'center' });
            
            doc.fillColor('#666')
               .fontSize(9)
               .font('Helvetica')
               .text(stat.label, x + 5, yPosition + 22, { width: statWidth - 20, align: 'center' });
        });

        yPosition += 50;

        // ===== DISTRIBUCIÓN POR TIPO =====
        doc.rect(20, yPosition, 750, 50)
           .fillColor('#e9ecef')
           .fill();
        
        doc.fillColor('#333')
           .fontSize(11)
           .font('Helvetica-Bold')
           .text('Distribución por Tipo de Equipo', 25, yPosition + 7);

        let tipoY = yPosition + 20;
        let tipoX = 25;
        Object.entries(data.asignacionesPorTipo).forEach(([tipo, cantidad]) => {
            if (tipoX > 600) {
                tipoX = 25;
                tipoY += 15;
            }
            
            doc.rect(tipoX, tipoY, 180, 12)
               .fillColor('white')
               .fill();
            
            doc.rect(tipoX, tipoY, 3, 12)
               .fillColor('#DC2626')
               .fill();
            
            doc.fillColor('#333')
               .fontSize(8)
               .text(tipo + ': ' + cantidad + ' asignaciones', tipoX + 8, tipoY + 2);
            
            tipoX += 185;
        });

        yPosition += 65;

        // ===== TABLA DE ASIGNACIONES =====
        if (data.equiposAsignados.length > 0) {
            // Encabezados de tabla
            const headers = ['Usuario', 'Cargo', 'Sede', 'Departamento', 'Equipo', 'Tipo', 'Serial', 'Fecha Asig.', 'Fecha Dev.', 'IP Equipo', 'Asignado Por', 'Estado'];
            const columnWidths = [62, 55, 58, 70, 95, 55, 58, 55, 55, 60, 67, 60];
            
            let headerX = 20;
            
            // Dibujar fondo de encabezados
            headers.forEach((header, index) => {
                doc.rect(headerX, yPosition, columnWidths[index], 15)
                   .fillColor('#DC2626')
                   .fill();
                headerX += columnWidths[index];
            });

            // Escribir texto de encabezados
            headerX = 20;
            doc.fillColor('white')
               .fontSize(8)
               .font('Helvetica-Bold');
            
            headers.forEach((header, index) => {
                const alignment = index === headers.length - 1 ? 'center' : 'left';
                
                doc.text(header, headerX + 3, yPosition + 4, { 
                    width: columnWidths[index] - 6, 
                    align: alignment 
                });
                
                headerX += columnWidths[index];
            });

            yPosition += 15;

            // Filas de datos
            data.equiposAsignados.forEach((asignacion, rowIndex) => {
                // Verificar si necesitamos nueva página
                if (yPosition > 500) {
                    doc.addPage();
                    yPosition = 50;
                    
                    // Redibujar encabezados de tabla en nueva página
                    let newHeaderX = 20;
                    headers.forEach((header, index) => {
                        doc.rect(newHeaderX, yPosition, columnWidths[index], 15)
                           .fillColor('#DC2626')
                           .fill();
                        newHeaderX += columnWidths[index];
                    });

                    newHeaderX = 20;
                    doc.fillColor('white')
                       .fontSize(7)
                       .font('Helvetica-Bold');
                    
                    headers.forEach((header, index) => {
                        const alignment = index === headers.length - 1 ? 'center' : 'left';
                        
                        doc.text(header, newHeaderX + 3, yPosition + 4, { 
                            width: columnWidths[index] - 6, 
                            align: alignment 
                        });
                        
                        newHeaderX += columnWidths[index];
                    });

                    yPosition += 15;
                }

                // Color de fondo según estado
                let backgroundColor = '#ffffff';
                if (asignacion.estado === 'activo') {
                    backgroundColor = '#d4edda';
                } else if (asignacion.estado === 'devuelto') {
                    backgroundColor = '#d1ecf1';
                } else if (asignacion.estado === 'obsoleto') {
                    backgroundColor = '#fff3cd';
                }

                // Fondo de fila
                if (rowIndex % 2 === 0 || asignacion.estado !== 'activo') {
                    doc.rect(20, yPosition, 750, 10)
                       .fillColor(backgroundColor)
                       .fill();
                }

                let cellX = 20;
                const rowData = [
                    `${asignacion.usuarioAsignado.nombre} ${asignacion.usuarioAsignado.apellido}`,
                    asignacion.usuarioAsignado.cargo,
                    asignacion.usuarioAsignado.sede.nombre,
                    asignacion.usuarioAsignado.departamento.nombre,
                    `${asignacion.stockEquipo.marca} ${asignacion.stockEquipo.modelo}`,
                    asignacion.stockEquipo.tipoEquipo.nombre,
                    asignacion.cereal_equipo || 'N/A',
                    asignacion.fecha_asignacion_formateada,
                    asignacion.fecha_devolucion ? asignacion.fecha_devolucion_formateada : '-',
                    asignacion.ip_equipo || 'No requiere',
                    asignacion.usuarioAsignador.name || 'Sistema',
                    getEstadoTexto(asignacion.estado)
                ];

                doc.fillColor('#333')
                   .fontSize(8)
                   .font('Helvetica');

                rowData.forEach((cell, index) => {
                    const alignment = index === rowData.length - 1 ? 'center' : 'left';
                    
                    doc.text(cell, cellX + 3, yPosition + 2, { 
                        width: columnWidths[index] - 6, 
                        align: alignment 
                    });
                    
                    cellX += columnWidths[index];
                });

                yPosition += 10;
            });

            yPosition += 15;

            // ===== RESUMEN FINAL =====
            doc.rect(20, yPosition, 750, 60)
               .fillColor('#e9ecef')
               .fill();
            
            doc.fillColor('#333')
               .fontSize(10)
               .font('Helvetica-Bold')
               .text('Resumen de Asignaciones', 25, yPosition + 10);

            const summaryData = [
                { 
                    label: 'Total de asignaciones activas:', 
                    value: `${data.asignacionesActivas} (${formatPercent(data.asignacionesActivas, data.totalAsignaciones)})` 
                },
                { 
                    label: 'Total de asignaciones devueltas:', 
                    value: `${data.asignacionesDevueltas} (${formatPercent(data.asignacionesDevueltas, data.totalAsignaciones)})` 
                },
                { 
                    label: 'Total de asignaciones obsoletas:', 
                    value: `${data.asignacionesObsoletas} (${formatPercent(data.asignacionesObsoletas, data.totalAsignaciones)})` 
                }
            ];

            let summaryY = yPosition + 25;
            summaryData.forEach(item => {
                doc.font('Helvetica-Bold')
                   .text(item.label, 25, summaryY);
                
                doc.font('Helvetica')
                   .text(item.value, 300, summaryY, { align: 'right' });
                
                summaryY += 12;
            });
        } else {
            // No hay asignaciones
            doc.fillColor('#666')
               .fontSize(14)
               .text('No hay equipos asignados', 20, yPosition, { align: 'center' });
        }

        // ===== FOOTER =====
        const footerY = 560;
        doc.moveTo(20, footerY)
           .lineTo(770, footerY)
           .strokeColor('#ddd')
           .lineWidth(1)
           .stroke();
        
        doc.fillColor('#666')
           .fontSize(8)
           .text('Sistema de Gestión - FRITZ C.A', 20, footerY + 8)
           .text('Generado el ' + data.fechaGeneracion, 20, footerY + 8, { align: 'right' });

        // Función helper para estado
        function getEstadoTexto(estado) {
            switch(estado) {
                case 'activo':
                    return 'Activo';
                case 'devuelto':
                    return 'Devuelto';
                case 'obsoleto':
                    return 'Obsoleto';
                default:
                    return estado.charAt(0).toUpperCase() + estado.slice(1);
            }
        }

        doc.end();

        console.log('=== VER PDF ASIGNACIONES GENERADO EXITOSAMENTE ===');

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
    
    // Validar que los headers no se hayan enviado ya
    if (res.headersSent) {
        console.log('Headers ya enviados, abortando...');
        return;
    }

    try {
        const { usuarioId } = req.params;

        // Validar que el usuarioId esté presente
        if (!usuarioId) {
            return res.status(400).json({ error: 'ID de usuario es requerido' });
        }

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
                observaciones: true,
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
                observaciones: asignacion.observaciones || '',
                
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

        console.log('Generando PDF con PDFKit...');

        // Crear documento PDF
        const doc = new PDFDocument({ 
            margin: 20,
            size: 'LETTER',
            layout: 'landscape'
        });

        // Configurar headers ANTES de pipe
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="reporte-usuario-${usuario.nombre}-${usuario.apellido}.pdf"`);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('X-Content-Type-Options', 'nosniff');

        // Pipe el PDF a la respuesta
        doc.pipe(res);

        // Funciones helper para estados
        function getEstadoTexto(estado) {
            switch(estado) {
                case 'activo':
                    return 'Activo';
                case 'devuelto':
                    return 'Devuelto';
                case 'obsoleto':
                    return 'Obsoleto';
                default:
                    return estado.charAt(0).toUpperCase() + estado.slice(1);
            }
        }

        function getEstadoColor(estado) {
            switch(estado) {
                case 'activo':
                    return { background: '#d4edda', text: '#155724' };
                case 'devuelto':
                    return { background: '#cce7ff', text: '#004085' };
                case 'obsoleto':
                    return { background: '#fff3cd', text: '#856404' };
                default:
                    return { background: '#e9ecef', text: '#495057' };
            }
        }

        // Función para dibujar una columna (copia)
        const dibujarColumna = (x, y, width, height, esCopia = false) => {
            // Borde de la columna
            doc.rect(x, y, width, height)
               .strokeColor('#000')
               .lineWidth(1)
               .stroke();

            let currentY = y + 15;

            // ===== HEADER =====
            // Logo placeholder
            doc.fillColor('#f73737')
               .rect(x + 10, currentY, 40, 30)
               .fill()
               .fillColor('white')
               .fontSize(8)
               .text('FRITZ C.A', x + 15, currentY + 10, { width: 30, align: 'center' });

            // Títulos - USANDO FUENTES BÁSICAS
            doc.fillColor('#f73737')
               .fontSize(12)
               .text('FRITZ C.A', x + 60, currentY, { 
                   width: width - 70, 
                   align: 'center' 
               });

            currentY += 12;

            doc.fillColor('#666')
               .fontSize(12)
               .text('Reporte de Equipos Asignados', x + 60, currentY, { 
                   width: width - 70, 
                   align: 'center' 
               });

            currentY += 12;

            doc.fillColor('#000')
               .fontSize(10)
               .text('Generado el: ' + data.fechaGeneracion, x + 60, currentY, { 
                   width: width - 70, 
                   align: 'center' 
               });

            currentY += 25;

            // Línea separadora del header
            doc.moveTo(x + 10, currentY)
               .lineTo(x + width - 10, currentY)
               .strokeColor('#000')
               .lineWidth(1)
               .stroke();

            currentY += 20;

            // ===== INFORMACIÓN DEL USUARIO =====
            doc.rect(x + 10, currentY, width - 50, 85)
               .fillColor('#e9ecef')
               .fill();
            
            doc.rect(x + 10, currentY, 4, 85)
               .fillColor('#DC2626')
               .fill();

            doc.fillColor('#333')
               .fontSize(11)
               .text('Información del Usuario', x + 20, currentY + 10);

            currentY += 25;

            const infoUsuario = [
                `Nombre: ${usuario.nombre} ${usuario.apellido}`,
                `Cargo: ${usuario.cargo || 'No especificado'}`,
                `Departamento: ${usuario.departamento?.nombre || 'No asignado'}`,
                `Sede: ${usuario.sede?.nombre || 'No asignada'}`,
                `Correo: ${usuario.correo || 'No especificado'}`
            ];

            infoUsuario.forEach((linea, index) => {
                doc.fontSize(9)
                   .text(linea, x + 20, currentY + (index * 12));
            });

            currentY += 70;

            // ===== DETALLE DE EQUIPOS ASIGNADOS =====
            doc.fillColor('#333')
               .fontSize(11)
               .text('Detalle de Equipos Asignados', x + 10, currentY);

            currentY += 15;

            if (data.equiposAsignados.length > 0) {
                // Encabezados de tabla
                const headers = ['ID', 'Equipo', 'Tipo', 'Fecha Asig.', 'Estado', 'Observaciones'];
                const columnWidths = [12, width * 0.26, width * 0.15, width * 0.10, width * 0.15, width * 0.26];
                
                let headerX = x + 10;
                
                // Fondo encabezados
                headers.forEach((header, index) => {
                    doc.rect(headerX, currentY, columnWidths[index], 12)
                       .fillColor('#343a40')
                       .fill();
                    headerX += columnWidths[index];
                });

                // Texto encabezados
                headerX = x + 10;
                doc.fillColor('white')
                   .fontSize(7);
                
                headers.forEach((header, index) => {
                    const alignment = index === 4 ? 'center' : 'left';
                    doc.text(header, headerX + 2, currentY + 3, { 
                        width: columnWidths[index] - 4, 
                        align: alignment 
                    });
                    headerX += columnWidths[index];
                });

                currentY += 12;

                // Filas de equipos
                data.equiposAsignados.forEach((equipo, index) => {
                    // Fondo alternado para filas
                    if (index % 2 === 0) {
                        doc.rect(x + 10, currentY, width - 20, 30)
                           .fillColor('#f8f9fa')
                           .fill();
                    }

                    let cellX = x + 10;
                    
                    const fechaAsignacion = equipo.fecha_asignacion ? 
                        new Date(equipo.fecha_asignacion).toLocaleDateString('es-ES') : 'N/A';
                    const estadoTexto = getEstadoTexto(equipo.estado);
                    const estadoColor = getEstadoColor(equipo.estado);

                    doc.fillColor('#333')
                       .fontSize(6.5);

                    // ID
                    doc.text(equipo.id.toString(), cellX + 2, currentY + 5, { 
                        width: columnWidths[0] - 4 
                    });
                    cellX += columnWidths[0];

                    // Equipo
                    const equipoTexto = `${equipo.stockEquipo.marca} ${equipo.stockEquipo.modelo}`;
                    doc.text(equipoTexto, cellX + 2, currentY + 3, { 
                        width: columnWidths[1] - 4 
                    });
                    
                    if (equipo.stockEquipo.descripcion) {
                        doc.fontSize(6)
                           .text(equipo.stockEquipo.descripcion, cellX + 2, currentY + 10, { 
                               width: columnWidths[1] - 4 
                           });
                    }
                    cellX += columnWidths[1];

                    // Tipo
                    doc.fontSize(6.5)
                       .text(equipo.stockEquipo.tipoEquipo.nombre, cellX + 2, currentY + 10, { 
                           width: columnWidths[2] - 4 
                       });
                    cellX += columnWidths[2];

                    // Fecha Asignación
                    doc.text(fechaAsignacion, cellX + 2, currentY + 10, { 
                        width: columnWidths[3] - 4 
                    });
                    cellX += columnWidths[3];

                    // Estado (con badge)
                    const estadoWidth = columnWidths[4] - 8;
                    doc.rect(cellX + 4, currentY + 5, estadoWidth, 8)
                       .fillColor(estadoColor.background)
                       .fill();
                    
                    doc.fillColor(estadoColor.text)
                       .fontSize(6)
                       .text(estadoTexto, cellX + 4, currentY + 7, { 
                           width: estadoWidth, 
                           align: 'center' 
                       });
                    cellX += columnWidths[4];

                    // Observaciones
                    if (equipo.observaciones) {
                        doc.fillColor('#333')
                           .fontSize(6)
                           .text(equipo.observaciones, cellX + 2, currentY + 5, { 
                               width: columnWidths[5] - 4,
                               align: 'left'
                           });
                    } else {
                        doc.fillColor('#666')
                           .fontSize(6)
                           .text('Sin observaciones', cellX + 2, currentY + 10, { 
                               width: columnWidths[5] - 4,
                               align: 'left'
                           });
                    }

                    currentY += 30;
                });

                // Bordes de la tabla
                doc.rect(x + 10, currentY - (data.equiposAsignados.length * 30), width - 20, (data.equiposAsignados.length * 30) + 12)
                   .strokeColor('#000')
                   .lineWidth(0.5)
                   .stroke();

            } else {
                // No hay equipos asignados
                doc.rect(x + 10, currentY, width - 20, 30)
                   .fillColor('#f8f9fa')
                   .fill();
                
                doc.fillColor('#666')
                   .fontSize(10)
                   .text('El usuario no tiene equipos asignados', x + 10, currentY + 10, { 
                       width: width - 20, 
                       align: 'center' 
                   });
                
                currentY += 40;
            }

            currentY += 20;

            // ===== SECCIÓN OBSERVACIONES GENERALES =====
            doc.rect(x + 10, currentY, width - 20, 50)
               .fillColor('#e9ecef')
               .fill();
            
            doc.rect(x + 10, currentY, 3, 50)
               .fillColor('#f12222')
               .fill();

            doc.fillColor('#333')
               .fontSize(10)
               .text('Observaciones Generales:', x + 18, currentY + 2);

            currentY += 15;

            doc.fillColor('#000')
               .fontSize(8)
               .text('• Cualquier novedad informar al Departamento de Tecnología', x + 18, currentY, { width: width - 30 });

            currentY += 10;

            doc.text('• Los equipos deben ser utilizados exclusivamente para labores de la empresa', x + 18, currentY, { width: width - 30 });

            currentY += 10;

            doc.text('• Reportar cualquier daño o mal funcionamiento inmediatamente', x + 18, currentY, { width: width - 30 });

            currentY += 25;

            // ===== FIRMAS =====
            const firmaWidth = (width - 35) / 2;
            
            // Firma Usuario
            doc.moveTo(x + 10, currentY + 20)
               .lineTo(x + 10 + firmaWidth, currentY + 20)
               .strokeColor('#000')
               .lineWidth(1)
               .stroke();

            doc.fillColor('#000')
               .fontSize(9)
               .text(`${usuario.nombre} ${usuario.apellido}`, x + 10, currentY + 23, { 
                   width: firmaWidth, 
                   align: 'center' 
               });

            doc.fontSize(8)
               .text('Usuario', x + 10, currentY + 33, { 
                   width: firmaWidth, 
                   align: 'center' 
               });

            // Firma Departamento de Tecnología
            doc.moveTo(x + 20 + firmaWidth, currentY + 20)
               .lineTo(x + 20 + firmaWidth + firmaWidth, currentY + 20)
               .strokeColor('#000')
               .lineWidth(1)
               .stroke();

            doc.fontSize(8)
               .text('Departamento de Tecnología', x + 20 + firmaWidth, currentY + 23, { 
                   width: firmaWidth, 
                   align: 'center' 
               });

            doc.text('FRITZ C.A', x + 20 + firmaWidth, currentY + 33, { 
                width: firmaWidth, 
                align: 'center' 
            });

            currentY += 60;

            // ===== FOOTER =====
            doc.moveTo(x + 10, currentY)
               .lineTo(x + width - 10, currentY)
               .strokeColor('#ddd')
               .lineWidth(1)
               .stroke();

            doc.fillColor('#666')
               .fontSize(8)
               .text('FRITZ C.A - Sistema de Gestión de Equipos', x + 10, currentY + 8, { 
                   width: width - 20, 
                   align: 'center' 
               });

            // Número de registro
            doc.text('Registro: ' + data.numeroRegistro, x + 10, currentY + 8, { 
                width: width - 20, 
                align: 'right' 
            });

            

            return currentY;
        };

        // Dimensiones para las dos columnas
        const pageWidth = 760;
        const pageHeight = 520;
        const colWidth = (pageWidth - 20) / 2;
        
        // Dibujar primera columna (original)
        dibujarColumna(20, 20, colWidth, pageHeight, false);
        
        // Dibujar segunda columna (copia)
        dibujarColumna(20 + colWidth + 20, 20, colWidth, pageHeight, true);

        // Manejar eventos del documento
        doc.on('error', (error) => {
            console.error('Error en la generación del PDF:', error);
            if (!res.headersSent) {
                res.status(500).json({ 
                    error: 'Error al generar el PDF: ' + error.message 
                });
            }
        });

        doc.on('end', () => {
            console.log('=== VER PDF POR USUARIO GENERADO EXITOSAMENTE ===');
            console.log(`Número de registro utilizado: ${numeroRegistro}`);
        });

        doc.end();

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