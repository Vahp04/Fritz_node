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
      const logoPath = './public/img/logo-fritz-web.png'; // Ajusta la ruta según tu estructura
      const logoWidth = 55; // Ancho de la imagen
      const logoHeight = 40;

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
        try {
        doc.image(logoPath, colX + 10, colY + 5, {
          width: logoWidth,
          height: logoHeight,
          align: 'left'
        });
      } catch (error) {
        console.warn('No se pudo cargar la imagen del logo:', error.message);
        // Continúa sin la imagen si hay error
      }

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
                doc.font('Helvetica')
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

        const fecha = new Date().toLocaleDateString('es-ES', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // CORREGIR: Usar el nombre correcto de la propiedad
        const data = {
            titulo: `Reporte de Equipos Asignados `,
            fecha: fecha,
            total: totalEquipos,
            equipos: equiposProcesados,
            usuario: usuario,
            numeroRegistro: numeroRegistro,
            estadisticas: {
                totales: totalEquipos,
                activos: equiposActivos,
                devueltos: equiposDevueltos, // CORREGIDO: era 'devuelto' en lugar de 'devueltos'
                obsoletos: equiposObsoletos
            }
        };

        console.log('Generando PDF con PDFDocument...');
        
        // Crear documento PDF
        const doc = new PDFDocument({ 
            margin: 20,
            size: 'LETTER',
            layout: 'portrait'
        });

        // Configurar headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="reporte-equipos-${usuario.nombre}-${usuario.apellido}.pdf"`);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        // Pipe el PDF a la respuesta
        doc.pipe(res);

        // Dimensiones
        const margin = 20;
        let yPosition = margin;
        const pageWidth = doc.page.width - (margin * 2);
        const columnWidth = (pageWidth - 15) / 2; // 15px de separación entre columnas

        const logoPath = './public/img/logo-fritz-web.png'; // Ajusta la ruta según tu estructura
        const logoWidth = 55; // Ancho de la imagen
        const logoHeight = 40;

        // **PRIMERA COLUMNA** (izquierda)
        let colX = margin;
        let colY = yPosition;

        // Encabezado columna 1
        doc.rect(colX, colY, columnWidth, 50)
           .fillColor('#f8f9fa')
           .fill();
        
        doc.rect(colX, colY, columnWidth, 50)
           .strokeColor('#000000')
           .lineWidth(1)
           .stroke();

        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor('#DC2626')
           .text('FRITZ C.A', colX, colY + 5, { 
             width: columnWidth, 
             align: 'center' 
           });
        
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#666666')
           .text(data.titulo, colX, colY + 20, { 
             width: columnWidth, 
             align: 'center' 
           });

        colY += 40;

        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#000000')
           .text(`Generado el: ${data.fecha}`, colX, colY, { 
             width: columnWidth, 
             align: 'center' 
           });

        colY += 25;

        // Línea separadora
        doc.moveTo(colX, colY)
           .lineTo(colX + columnWidth, colY)
           .lineWidth(1)
           .strokeColor('#000000')
           .stroke();
        
        colY += 20;

        // Información del usuario - Columna 1
        doc.rect(colX, colY, columnWidth, 25)
           .fillColor('#f8f9fa')
           .fill();
        
        doc.rect(colX, colY, columnWidth, 25)
           .strokeColor('#000000')
           .lineWidth(1)
           .stroke();

        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#333333')
           .text('Información del Usuario', colX + 10, colY + 8);

        colY += 30;

        // Contenedor principal de información
        const infoHeight = 120;
        doc.rect(colX, colY, columnWidth, infoHeight)
           .fillColor('#f8f9fa')
           .fill();
        
        doc.rect(colX, colY, columnWidth, infoHeight)
           .strokeColor('#000000')
           .lineWidth(1)
           .stroke();

        let infoY = colY + 10;
        const infoItemHeight = 14;

        // Datos del usuario - Columna 1
        const userInfo = [
            { label: 'ID de Usuario:', value: usuario.id.toString() },
            { label: 'Nombre Completo:', value: `${usuario.nombre} ${usuario.apellido}` },
            { label: 'Cargo:', value: usuario.cargo || 'No especificado' },
            { label: 'Correo Electrónico:', value: usuario.correo || 'No especificado' },
            { label: 'Sede:', value: usuario.sede?.nombre || 'No asignada' },
            { label: 'Departamento:', value: usuario.departamento?.nombre || 'No asignado' },
            { label: 'Total Equipos:', value: data.total.toString() },
            { label: 'Última Asignación:', value: data.equipos && data.equipos.length > 0 ? 
                new Date(data.equipos[0].fecha_asignacion).toLocaleDateString('es-ES') : 'No disponible' }
        ];

        userInfo.forEach((info, index) => {
            const currentY = infoY + (index * infoItemHeight);
            
            doc.fontSize(8)
               .font('Helvetica-Bold')
               .fillColor('#333333')
               .text(info.label, colX + 10, currentY);
            
            doc.fontSize(8)
               .font('Helvetica')
               .fillColor('#666666')
               .text(info.value, colX + 90, currentY, {
                 width: columnWidth - 80,
                 align: 'left'
               });

            // Línea punteada entre items
            if (index < userInfo.length - 1) {
                doc.moveTo(colX + 10, currentY + 10)
                   .lineTo(colX + columnWidth - 10, currentY + 10)
                   .lineWidth(0.5)
                   .strokeColor('#cccccc')
                   .dash(2, { space: 2 })
                   .stroke()
                   .undash();
            }
        });

        colY += infoHeight + 15;

        // Resumen de equipos - Columna 1
        doc.rect(colX, colY, columnWidth, 25)
           .fillColor('#e9ecef')
           .fill();
        
        doc.rect(colX, colY, columnWidth, 25)
           .strokeColor('#000000')
           .lineWidth(1)
           .stroke();

        doc.fontSize(11)
           .font('Helvetica-Bold')
           .fillColor('#333333')
           .text('Resumen de Equipos Asignados', colX + 10, colY + 8);

        colY += 30;

        // Estadísticas de equipos - Columna 1
        const statsHeight = 50;
        const statWidth = (columnWidth - 20) / 3;
        
        // Total Equipos
        doc.rect(colX + 5, colY, statWidth, statsHeight)
           .fillColor('#ffffff')
           .strokeColor('#dddddd')
           .lineWidth(1)
           .fillAndStroke();
        
        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor('#DC2626')
           .text(data.estadisticas.totales.toString(), colX + 5, colY + 10, {
             width: statWidth,
             align: 'center'
           });
        
        doc.fontSize(9)
           .font('Helvetica')
           .fillColor('#666666')
           .text('Total Equipos', colX + 5, colY + 30, {
             width: statWidth,
             align: 'center'
           });

        // Equipos Activos
        doc.rect(colX + 10 + statWidth, colY, statWidth, statsHeight)
           .fillColor('#ffffff')
           .strokeColor('#dddddd')
           .lineWidth(1)
           .fillAndStroke();
        
        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor('#DC2626')
           .text(data.estadisticas.activos.toString(), colX + 10 + statWidth, colY + 10, {
             width: statWidth,
             align: 'center'
           });
        
        doc.fontSize(9)
           .font('Helvetica')
           .fillColor('#666666')
           .text('Equipos Activos', colX + 10 + statWidth, colY + 30, {
             width: statWidth,
             align: 'center'
           });

        // Equipos Devueltos - CORREGIDO: usar 'devueltos' en lugar de 'devuelto'
        doc.rect(colX + 15 + (statWidth * 2), colY, statWidth, statsHeight)
           .fillColor('#ffffff')
           .strokeColor('#dddddd')
           .lineWidth(1)
           .fillAndStroke();
        
        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor('#DC2626')
           .text(data.estadisticas.devueltos.toString(), colX + 15 + (statWidth * 2), colY + 10, {
             width: statWidth,
             align: 'center'
           });
        
        doc.fontSize(9)
           .font('Helvetica')
           .fillColor('#666666')
           .text('Equipos Devueltos', colX + 15 + (statWidth * 2), colY + 30, {
             width: statWidth,
             align: 'center'
           });

        colY += statsHeight + 20;

        // Detalle de equipos asignados - Columna 1
        if (data.equipos && data.equipos.length > 0) {
            doc.fontSize(11)
               .font('Helvetica-Bold')
               .fillColor('#333333')
               .text('Detalle de Equipos Asignados', colX, colY);

            colY += 15;

            // Encabezados de tabla
            const headers = ['Tipo', 'Marca/Modelo', 'IP', 'Serial', 'Estado', 'Fecha Asig.'];
            const columnWidths = [
                columnWidth * 0.18,
                columnWidth * 0.25,
                columnWidth * 0.15,
                columnWidth * 0.15,
                columnWidth * 0.15,
                columnWidth * 0.12
            ];
            
            let headerX = colX;
            
            // Fondo encabezados
            headers.forEach((header, index) => {
                doc.rect(headerX, colY, columnWidths[index], 12)
                   .fillColor('#343a40')
                   .fill();
                headerX += columnWidths[index];
            });

            // Texto encabezados
            headerX = colX;
            doc.fillColor('white')
               .fontSize(7);
            
            headers.forEach((header, index) => {
                doc.text(header, headerX + 2, colY + 3, { 
                    width: columnWidths[index] - 4, 
                    align: 'left' 
                });
                headerX += columnWidths[index];
            });

            colY += 12;

            // Filas de equipos
            data.equipos.forEach((equipo, index) => {
                // Fondo alternado para filas
                if (index % 2 === 0) {
                    doc.rect(colX, colY, columnWidth, 15)
                       .fillColor('#f8f9fa')
                       .fill();
                }

                let cellX = colX;

                doc.fillColor('#333')
                   .fontSize(6);

                // Determinar estado y color
                const estado = equipo.estado || 'Sin estado';
                const estadoColor = estado === 'activo' ? '#155724' : 
                                  estado === 'devuelto' ? '#856404' : '#666666';

                // Tipo
                doc.text(equipo.stockEquipo.tipoEquipo.nombre || 'N/A', cellX + 2, colY + 4, { 
                    width: columnWidths[0] - 4 
                });
                cellX += columnWidths[0];

                // Marca/Modelo
                const equipoTexto = `${equipo.stockEquipo.marca || 'N/A'} ${equipo.stockEquipo.modelo || ''}`;
                doc.text(equipoTexto, cellX + 2, colY + 4, { 
                    width: columnWidths[1] - 4 
                });
                cellX += columnWidths[1];

                // IP
                doc.text(equipo.ip_equipo || 'N/A', cellX + 2, colY + 4, { 
                    width: columnWidths[2] - 4 
                });
                cellX += columnWidths[2];

                // Serial
                doc.text(equipo.cereal_equipo || 'N/A', cellX + 2, colY + 4, { 
                    width: columnWidths[3] - 4 
                });
                cellX += columnWidths[3];

                // Estado
                doc.fillColor(estadoColor)
                   .text(estado.charAt(0).toUpperCase() + estado.slice(1), cellX + 2, colY + 4, { 
                       width: columnWidths[4] - 4 
                   });
                cellX += columnWidths[4];

                // Fecha Asignación
                doc.fillColor('#333')
                   .text(equipo.fecha_asignacion ? 
                       new Date(equipo.fecha_asignacion).toLocaleDateString('es-ES') : '-', 
                       cellX + 2, colY + 4, { 
                           width: columnWidths[5] - 4 
                       });

                colY += 15;
            });

            // Bordes de la tabla
            doc.rect(colX, colY - (data.equipos.length * 15), columnWidth, (data.equipos.length * 15) + 12)
               .strokeColor('#000')
               .lineWidth(0.5)
               .stroke();

            colY += 10;
        } else {
            // Mensaje cuando no hay equipos
            doc.rect(colX, colY, columnWidth, 30)
               .fillColor('#f8f9fa')
               .fill();
            
            doc.fillColor('#666')
               .fontSize(10)
               .text('El usuario no tiene equipos asignados', colX, colY + 10, { 
                   width: columnWidth, 
                   align: 'center' 
               });
            
            colY += 50;
        }

        // Firmas - Columna 1
        const firmaHeight = 65;
        const firmaWidth = (columnWidth - 20) / 2;

        // Firma Usuario
        doc.rect(colX + 5, colY + 5, firmaWidth, firmaHeight)
           .strokeColor('#cccccc')
           .lineWidth(1)
           .stroke();
        
        // Línea de firma
        doc.moveTo(colX + 15, colY + 40)
           .lineTo(colX + firmaWidth - 5, colY + 40)
           .lineWidth(1)
           .strokeColor('#333333')
           .stroke();
        
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#333333')
           .text(`${usuario.nombre} ${usuario.apellido}`, colX + 5, colY + 45, {
             width: firmaWidth,
             align: 'center'
           });
        
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#666666')
           .text('Usuario', colX + 5, colY + 55, {
             width: firmaWidth,
             align: 'center'
           });

        // Firma Tecnología
        doc.rect(colX + 10 + firmaWidth, colY + 5, firmaWidth, firmaHeight)
           .strokeColor('#cccccc')
           .lineWidth(1)
           .stroke();
        
        // Línea de firma
        doc.moveTo(colX + 20 + firmaWidth, colY + 40)
           .lineTo(colX + (firmaWidth * 2) + 5, colY + 40)
           .lineWidth(1)
           .strokeColor('#333333')
           .stroke();
        
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#333333')
           .text('Departamento de Tecnología', colX + 10 + firmaWidth, colY + 45, {
             width: firmaWidth,
             align: 'center'
           });
        
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#666666')
           .text('FRITZ C.A', colX + 10 + firmaWidth, colY + 55, {
             width: firmaWidth,
             align: 'center'
           });

        colY += firmaHeight + 15;

        // Footer - Columna 1
        doc.moveTo(colX, colY)
           .lineTo(colX + columnWidth, colY)
           .lineWidth(1)
           .strokeColor('#dddddd')
           .stroke();
        
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#666666')
           .text('FRITZ C.A - Sistema de Gestión de Equipos', colX, colY + 10, {
             width: columnWidth,
             align: 'center'
           });

        // Número de documento
        doc.text('Registro: ' + data.numeroRegistro, colX + columnWidth - 10, colY + 10, {
          width: columnWidth,
          align: 'right'
        });

        // **SEGUNDA COLUMNA** (derecha) - CONTENIDO IDÉNTICO
        colX = margin + columnWidth + 15;
        colY = yPosition;

        // Encabezado columna 2
        doc.rect(colX, colY, columnWidth, 50)
           .fillColor('#f8f9fa')
           .fill();
        
        doc.rect(colX, colY, columnWidth, 50)
           .strokeColor('#000000')
           .lineWidth(1)
           .stroke();

        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor('#DC2626')
           .text('FRITZ C.A', colX, colY + 5, { 
             width: columnWidth, 
             align: 'center' 
           });
        
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#666666')
           .text(data.titulo, colX, colY + 20, { 
             width: columnWidth, 
             align: 'center' 
           });

        colY += 40;

        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#000000')
           .text(`Generado el: ${data.fecha}`, colX, colY, { 
             width: columnWidth, 
             align: 'center' 
           });

        colY += 25;

        // Línea separadora
        doc.moveTo(colX, colY)
           .lineTo(colX + columnWidth, colY)
           .lineWidth(1)
           .strokeColor('#000000')
           .stroke();
        
        colY += 20;

        // Información del usuario - Columna 2
        doc.rect(colX, colY, columnWidth, 25)
           .fillColor('#f8f9fa')
           .fill();
        
        doc.rect(colX, colY, columnWidth, 25)
           .strokeColor('#000000')
           .lineWidth(1)
           .stroke();

        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#333333')
           .text('Información del Usuario', colX + 10, colY + 8);

        colY += 30;

        // Contenedor principal de información - Columna 2
        doc.rect(colX, colY, columnWidth, infoHeight)
           .fillColor('#f8f9fa')
           .fill();
        
        doc.rect(colX, colY, columnWidth, infoHeight)
           .strokeColor('#000000')
           .lineWidth(1)
           .stroke();

        infoY = colY + 10;

        // Datos del usuario - Columna 2 (mismos datos)
        userInfo.forEach((info, index) => {
            const currentY = infoY + (index * infoItemHeight);
            
            doc.fontSize(8)
               .font('Helvetica-Bold')
               .fillColor('#333333')
               .text(info.label, colX + 10, currentY);
            
            doc.fontSize(8)
               .font('Helvetica')
               .fillColor('#666666')
               .text(info.value, colX + 90, currentY, {
                 width: columnWidth - 80,
                 align: 'left'
               });

            // Línea punteada entre items
            if (index < userInfo.length - 1) {
                doc.moveTo(colX + 10, currentY + 10)
                   .lineTo(colX + columnWidth - 10, currentY + 10)
                   .lineWidth(0.5)
                   .strokeColor('#cccccc')
                   .dash(2, { space: 2 })
                   .stroke()
                   .undash();
            }
        });

        colY += infoHeight + 15;

        // Resumen de equipos - Columna 2
        doc.rect(colX, colY, columnWidth, 25)
           .fillColor('#e9ecef')
           .fill();
        
        doc.rect(colX, colY, columnWidth, 25)
           .strokeColor('#000000')
           .lineWidth(1)
           .stroke();

        doc.fontSize(11)
           .font('Helvetica-Bold')
           .fillColor('#333333')
           .text('Resumen de Equipos Asignados', colX + 10, colY + 8);

        colY += 30;

        // Estadísticas de equipos - Columna 2 (idénticas)
        // Total Equipos
        doc.rect(colX + 5, colY, statWidth, statsHeight)
           .fillColor('#ffffff')
           .strokeColor('#dddddd')
           .lineWidth(1)
           .fillAndStroke();
        
        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor('#DC2626')
           .text(data.estadisticas.totales.toString(), colX + 5, colY + 10, {
             width: statWidth,
             align: 'center'
           });
        
        doc.fontSize(9)
           .font('Helvetica')
           .fillColor('#666666')
           .text('Total Equipos', colX + 5, colY + 30, {
             width: statWidth,
             align: 'center'
           });

        // Equipos Activos
        doc.rect(colX + 10 + statWidth, colY, statWidth, statsHeight)
           .fillColor('#ffffff')
           .strokeColor('#dddddd')
           .lineWidth(1)
           .fillAndStroke();
        
        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor('#DC2626')
           .text(data.estadisticas.activos.toString(), colX + 10 + statWidth, colY + 10, {
             width: statWidth,
             align: 'center'
           });
        
        doc.fontSize(9)
           .font('Helvetica')
           .fillColor('#666666')
           .text('Equipos Activos', colX + 10 + statWidth, colY + 30, {
             width: statWidth,
             align: 'center'
           });

        // Equipos Devueltos - CORREGIDO: usar 'devueltos' en lugar de 'devuelto'
        doc.rect(colX + 15 + (statWidth * 2), colY, statWidth, statsHeight)
           .fillColor('#ffffff')
           .strokeColor('#dddddd')
           .lineWidth(1)
           .fillAndStroke();
        
        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor('#DC2626')
           .text(data.estadisticas.devueltos.toString(), colX + 15 + (statWidth * 2), colY + 10, {
             width: statWidth,
             align: 'center'
           });
        
        doc.fontSize(9)
           .font('Helvetica')
           .fillColor('#666666')
           .text('Equipos Devueltos', colX + 15 + (statWidth * 2), colY + 30, {
             width: statWidth,
             align: 'center'
           });

        colY += statsHeight + 20;

        // Detalle de equipos asignados - Columna 2
        if (data.equipos && data.equipos.length > 0) {
            doc.fontSize(11)
               .font('Helvetica-Bold')
               .fillColor('#333333')
               .text('Detalle de Equipos Asignados', colX, colY);

            colY += 15;

            // Encabezados de tabla
            const headers = ['Tipo', 'Marca/Modelo', 'IP', 'Serial', 'Estado', 'Fecha Asig.'];
            const columnWidths = [
                columnWidth * 0.18,
                columnWidth * 0.25,
                columnWidth * 0.15,
                columnWidth * 0.15,
                columnWidth * 0.15,
                columnWidth * 0.12
            ];
            
            let headerX = colX;
            
            // Fondo encabezados
            headers.forEach((header, index) => {
                doc.rect(headerX, colY, columnWidths[index], 12)
                   .fillColor('#343a40')
                   .fill();
                headerX += columnWidths[index];
            });

            // Texto encabezados
            headerX = colX;
            doc.fillColor('white')
               .fontSize(7);
            
            headers.forEach((header, index) => {
                doc.text(header, headerX + 2, colY + 3, { 
                    width: columnWidths[index] - 4, 
                    align: 'left' 
                });
                headerX += columnWidths[index];
            });

            colY += 12;

            // Filas de equipos
            data.equipos.forEach((equipo, index) => {
                // Fondo alternado para filas
                if (index % 2 === 0) {
                    doc.rect(colX, colY, columnWidth, 15)
                       .fillColor('#f8f9fa')
                       .fill();
                }

                let cellX = colX;

                doc.fillColor('#333')
                   .fontSize(6);

                // Determinar estado y color
                const estado = equipo.estado || 'Sin estado';
                const estadoColor = estado === 'activo' ? '#155724' : 
                                  estado === 'devuelto' ? '#856404' : '#666666';

                // Tipo
                doc.text(equipo.stockEquipo.tipoEquipo.nombre || 'N/A', cellX + 2, colY + 4, { 
                    width: columnWidths[0] - 4 
                });
                cellX += columnWidths[0];

                // Marca/Modelo
                const equipoTexto = `${equipo.stockEquipo.marca || 'N/A'} ${equipo.stockEquipo.modelo || ''}`;
                doc.text(equipoTexto, cellX + 2, colY + 4, { 
                    width: columnWidths[1] - 4 
                });
                cellX += columnWidths[1];

                // IP
                doc.text(equipo.ip_equipo || 'N/A', cellX + 2, colY + 4, { 
                    width: columnWidths[2] - 4 
                });
                cellX += columnWidths[2];

                // Serial
                doc.text(equipo.cereal_equipo || 'N/A', cellX + 2, colY + 4, { 
                    width: columnWidths[3] - 4 
                });
                cellX += columnWidths[3];

                // Estado
                doc.fillColor(estadoColor)
                   .text(estado.charAt(0).toUpperCase() + estado.slice(1), cellX + 2, colY + 4, { 
                       width: columnWidths[4] - 4 
                   });
                cellX += columnWidths[4];

                // Fecha Asignación
                doc.fillColor('#333')
                   .text(equipo.fecha_asignacion ? 
                       new Date(equipo.fecha_asignacion).toLocaleDateString('es-ES') : '-', 
                       cellX + 2, colY + 4, { 
                           width: columnWidths[5] - 4 
                       });

                colY += 15;
            });

            // Bordes de la tabla
            doc.rect(colX, colY - (data.equipos.length * 15), columnWidth, (data.equipos.length * 15) + 12)
               .strokeColor('#000')
               .lineWidth(0.5)
               .stroke();

            colY += 10;
        } else {
            // Mensaje cuando no hay equipos
            doc.rect(colX, colY, columnWidth, 30)
               .fillColor('#f8f9fa')
               .fill();
            
            doc.fillColor('#666')
               .fontSize(10)
               .text('El usuario no tiene equipos asignados', colX, colY + 10, { 
                   width: columnWidth, 
                   align: 'center' 
               });
            
            colY += 50;
        }

        // Firmas - Columna 2
        // Firma Usuario
        doc.rect(colX + 5, colY + 5, firmaWidth, firmaHeight)
           .strokeColor('#cccccc')
           .lineWidth(1)
           .stroke();
        
        // Línea de firma
        doc.moveTo(colX + 15, colY + 40)
           .lineTo(colX + firmaWidth - 5, colY + 40)
           .lineWidth(1)
           .strokeColor('#333333')
           .stroke();
        
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#333333')
           .text(`${usuario.nombre} ${usuario.apellido}`, colX + 5, colY + 45, {
             width: firmaWidth,
             align: 'center'
           });
        
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#666666')
           .text('Usuario', colX + 5, colY + 55, {
             width: firmaWidth,
             align: 'center'
           });

        // Firma Tecnología
        doc.rect(colX + 10 + firmaWidth, colY + 5, firmaWidth, firmaHeight)
           .strokeColor('#cccccc')
           .lineWidth(1)
           .stroke();
        
        // Línea de firma
        doc.moveTo(colX + 20 + firmaWidth, colY + 40)
           .lineTo(colX + (firmaWidth * 2) + 5, colY + 40)
           .lineWidth(1)
           .strokeColor('#333333')
           .stroke();
        
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#333333')
           .text('Departamento de Tecnología', colX + 10 + firmaWidth, colY + 45, {
             width: firmaWidth,
             align: 'center'
           });
        
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#666666')
           .text('FRITZ C.A', colX + 10 + firmaWidth, colY + 55, {
             width: firmaWidth,
             align: 'center'
           });

        colY += firmaHeight + 15;

        // Footer - Columna 2
        doc.moveTo(colX, colY)
           .lineTo(colX + columnWidth, colY)
           .lineWidth(1)
           .strokeColor('#dddddd')
           .stroke();
        
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#666666')
           .text('FRITZ C.A - Sistema de Gestión de Equipos', colX, colY + 10, {
             width: columnWidth,
             align: 'center'
           });

        // Número de documento
        doc.text(data.numeroRegistro, colX + columnWidth - 10, colY + 10, {
          width: columnWidth,
          align: 'right'
        });

        // Finalizar documento
        doc.end();

        console.log('=== VER PDF POR USUARIO GENERADO EXITOSAMENTE ===');
        console.log(`Número de registro utilizado: ${numeroRegistro}`);

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