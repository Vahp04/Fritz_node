import { PrismaClient } from '@prisma/client';
import PuppeteerPDF from '../services/puppeteerPDF.js';
import { renderTemplate } from '../helpers/renderHelper.js';

const prisma = new PrismaClient();

export const servidoresController = {
  async index(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const search = req.query.search || '';
      const sede_id = req.query.sede_id || '';
      const estado = req.query.estado || '';

      let where = {};

      if (search) {
        where.OR = [
          { descripcion: { contains: search, mode: 'insensitive' } },
          { ip_servidores: { contains: search, mode: 'insensitive' } },
          { cereal_servidores: { contains: search, mode: 'insensitive' } },
          { ubicacion: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (sede_id) {
        where.sede_id = parseInt(sede_id);
      }

      if (estado) {
        where.estado = estado;
      }

      const totalRecords = await prisma.servidores.count({ where });

      const servidores = await prisma.servidores.findMany({
        where,
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
        servidores: servidores,
        pagination: {
          current: page,
          total: totalPages,
          totalRecords: totalRecords
        },
        filters: {
          search: search,
          sede_id: sede_id,
          estado: estado
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
      const servidorId = parseInt(id); 

      const servidor = await prisma.servidores.findUnique({
        where: { id: servidorId }, 
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true
        }
      });

      if (!servidor) {
        return res.status(404).json({ error: 'Servidor no encontrado' });
      }

      res.json(servidor);
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
      ip_servidores,
      cereal_servidores,
      estado 
    } = req.body;

    console.log('Datos recibidos para crear servidor:', req.body);

    const stockEquiposId = parseInt(stock_equipos_id);
    const sedeId = parseInt(sede_id);

    const servidorStock = await prisma.stock_equipos.findUnique({
      where: { id: stockEquiposId },
      include: {
        tipo_equipo: true
      }
    });

    if (!servidorStock) {
      return res.status(404).json({ error: 'Equipo no encontrado en inventario' });
    }

    const tipoNombre = servidorStock.tipo_equipo?.nombre?.toLowerCase() || '';
    if (!tipoNombre.includes('servidor')) {
      return res.status(400).json({ 
        error: 'El equipo seleccionado no es un servidor. Por favor seleccione un equipo del tipo servidor.' 
      });
    }

    if (servidorStock.cantidad_disponible <= 0) {
      return res.status(400).json({ error: 'No hay stock disponible para este equipo' });
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const servidor = await tx.servidores.create({
        data: {
          stock_equipos_id: stockEquiposId, 
          descripcion,
          sede_id: sedeId, 
          ubicacion,
          ip_servidores,
          cereal_servidores,
          estado: estado || 'activo'
        }
      });

      await tx.stock_equipos.update({
        where: { id: stockEquiposId }, 
        data: {
          cantidad_disponible: { decrement: 1 },
          cantidad_asignada: { increment: 1 }
        }
      });

      return servidor;
    });

    res.status(201).json({
      message: 'Servidor activado exitosamente',
      servidor: resultado
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
        ip_servidores,
        cereal_servidores,
        estado 
      } = req.body;

      console.log('Datos recibidos para actualizar:', req.body);

      const servidorId = parseInt(id);
      const sedeId = sede_id ? parseInt(sede_id) : undefined;

      const servidorActual = await prisma.servidores.findUnique({
        where: { id: servidorId },
        include: {
          stock_equipos: true
        }
      });

      if (!servidorActual) {
        return res.status(404).json({ error: 'Servidor no encontrado' });
      }

      console.log(`Servidor actual - Estado: ${servidorActual.estado}, Stock ID: ${servidorActual.stock_equipos_id}`);

      const resultado = await prisma.$transaction(async (tx) => {
        const estadoAnterior = servidorActual.estado;
        const estadoNuevo = estado;
        const stockEquipoId = servidorActual.stock_equipos_id;

        console.log(`Cambio de estado: ${estadoAnterior} -> ${estadoNuevo}`);

        if (estadoAnterior !== estadoNuevo) {
          console.log('Procesando cambio de estado...');

          const stockActual = await tx.stock_equipos.findUnique({
            where: { id: stockEquipoId }
          });

          if (!stockActual) {
            throw new Error('Stock de equipo no encontrado');
          }

          if (estadoAnterior === 'activo' && (estadoNuevo === 'inactivo' || estadoNuevo === 'mantenimiento')) {
            console.log('Devolviendo servidor activo al inventario');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_disponible: { increment: 1 },
                cantidad_asignada: { decrement: 1 }
              }
            });
          }
          else if ((estadoAnterior === 'inactivo' || estadoAnterior === 'mantenimiento') && estadoNuevo === 'activo') {
            console.log('Asignando servidor desde inventario a activo');
            if (stockActual.cantidad_disponible <= 0) {
              throw new Error('No hay stock disponible para activar este equipo');
            }
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_disponible: { decrement: 1 },
                cantidad_asignada: { increment: 1 }
              }
            });
          }
          else if (estadoAnterior === 'activo' && estadoNuevo === 'desuso') {
            console.log('Marcando servidor activo como desuso - reduciendo inventario');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_total: { decrement: 1 },
                cantidad_asignada: { decrement: 1 }
              }
            });
          }
          else if ((estadoAnterior === 'inactivo' || estadoAnterior === 'mantenimiento') && estadoNuevo === 'desuso') {
            console.log('Marcando servidor inactivo/mantenimiento como desuso - reduciendo inventario');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_total: { decrement: 1 },
                cantidad_disponible: { decrement: 1 }
              }
            });
          }
          else if (estadoAnterior === 'desuso' && estadoNuevo === 'activo') {
            console.log('Reactivar servidor desde desuso');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_total: { increment: 1 },
                cantidad_disponible: { decrement: 1 },
                cantidad_asignada: { increment: 1 }
              }
            });
          }
          else if (estadoAnterior === 'desuso' && (estadoNuevo === 'inactivo' || estadoNuevo === 'mantenimiento')) {
            console.log('Mover servidor de desuso a inventario disponible');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_total: { increment: 1 },
                cantidad_disponible: { increment: 1 }
              }
            });
          }

          console.log('Cambio de estado procesado exitosamente');
        } else {
          console.log('No hay cambio de estado, omitiendo actualización de stock');
        }

        const servidorActualizado = await tx.servidores.update({
          where: { id: servidorId },
          data: {
            descripcion,
            sede_id: sedeId,
            ubicacion,
            ip_servidores,
            cereal_servidores,
            estado: estadoNuevo,
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

        return servidorActualizado;
      });

      res.json({
        message: 'Servidor actualizado exitosamente',
        servidor: resultado
      });

    } catch (error) {
      console.error('Error en update:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async destroy(req, res) {
    try {
      const { id } = req.params;

      const servidor = await prisma.servidores.findUnique({
        where: { id: parseInt(id) },
        include: {
          stock_equipos: true
        }
      });

      if (!servidor) {
        return res.status(404).json({ error: 'Servidor no encontrado' });
      }

      await prisma.$transaction(async (tx) => {
        const stockEquipoId = servidor.stock_equipos_id;
        const estadoActual = servidor.estado;

        console.log(`Eliminando servidor con estado: ${estadoActual}`);

        if (estadoActual === 'activo') {
          console.log(`Devolviendo servidor activo al inventario`);
          
          await tx.stock_equipos.update({
            where: { id: stockEquipoId },
            data: {
              cantidad_disponible: { increment: 1 },
              cantidad_asignada: { decrement: 1 }
            }
          });
        } 
        else if (estadoActual === 'inactivo' || estadoActual === 'mantenimiento') {
          console.log(`Servidor ya estaba disponible, no se modifica inventario`);
        }
        
        await tx.servidores.delete({
          where: { id: parseInt(id) }
        });
      });

      res.json({ message: 'Servidor eliminado exitosamente' });

    } catch (error) {
      console.error('Error en destroy:', error);
      res.status(500).json({ error: error.message });
    }
  },

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

      const servidor = await prisma.servidores.findUnique({
        where: { id: parseInt(id) },
        include: {
          stock_equipos: true
        }
      });

      if (!servidor) {
        return res.status(404).json({ error: 'Servidor no encontrado' });
      }

      const servidorActualizado = await prisma.$transaction(async (tx) => {
        const estadoAnterior = servidor.estado;
        const estadoNuevo = estado;
        const stockEquipoId = servidor.stock_equipos_id;

        console.log(`Cambio de estado: ${estadoAnterior} -> ${estadoNuevo}`);

        if (estadoAnterior !== estadoNuevo) {
          const stockActual = await tx.stock_equipos.findUnique({
            where: { id: stockEquipoId }
          });

          if (!stockActual) {
            throw new Error('Stock de equipo no encontrado');
          }

          if (estadoAnterior === 'activo' && (estadoNuevo === 'inactivo' || estadoNuevo === 'mantenimiento')) {
            console.log('Devolviendo servidor activo al inventario');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_disponible: { increment: 1 },
                cantidad_asignada: { decrement: 1 }
              }
            });
          }
          else if ((estadoAnterior === 'inactivo' || estadoAnterior === 'mantenimiento') && estadoNuevo === 'activo') {
            console.log('Asignando servidor desde inventario a activo');
            if (stockActual.cantidad_disponible <= 0) {
              throw new Error('No hay stock disponible para activar este equipo');
            }
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_disponible: { decrement: 1 },
                cantidad_asignada: { increment: 1 }
              }
            });
          }
          else if (estadoAnterior === 'activo' && estadoNuevo === 'desuso') {
            console.log('Marcando servidor activo como desuso');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_total: { decrement: 1 },
                cantidad_asignada: { decrement: 1 }
              }
            });
          }
          else if ((estadoAnterior === 'inactivo' || estadoAnterior === 'mantenimiento') && estadoNuevo === 'desuso') {
            console.log('Marcando servidor inactivo/mantenimiento como desuso');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_total: { decrement: 1 },
                cantidad_disponible: { decrement: 1 }
              }
            });
          }
          else if (estadoAnterior === 'desuso' && estadoNuevo === 'activo') {
            console.log('Reactivar servidor desde desuso');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_total: { increment: 1 },
                cantidad_disponible: { decrement: 1 },
                cantidad_asignada: { increment: 1 }
              }
            });
          }
          else if (estadoAnterior === 'desuso' && (estadoNuevo === 'inactivo' || estadoNuevo === 'mantenimiento')) {
            console.log('Mover servidor de desuso a inventario disponible');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_total: { increment: 1 },
                cantidad_disponible: { increment: 1 }
              }
            });
          }
        }

        const servidorActualizado = await tx.servidores.update({
          where: { id: parseInt(id) },
          data: { 
            estado: estadoNuevo,
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

        return servidorActualizado;
      });

      res.json({
        message: `Estado del servidor cambiado a ${estado}`,
        servidor: servidorActualizado
      });

    } catch (error) {
      console.error('Error en cambiarEstado:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async porSede(req, res) {
    try {
      const { sede_id } = req.params;

      const servidores = await prisma.servidores.findMany({
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

      res.json(servidores);
    } catch (error) {
      console.error('Error en porSede:', error);
      res.status(500).json({ error: error.message });
    }
  },

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

      const servidores = await prisma.servidores.findMany({
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

      res.json(servidores);
    } catch (error) {
      console.error('Error en porEstado:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async estadisticas(req, res) {
    try {
      const totalServidores = await prisma.servidores.count();
      
      const servidoresPorEstado = await prisma.servidores.groupBy({
        by: ['estado'],
        _count: {
          id: true
        }
      });

      const servidoresPorSede = await prisma.servidores.groupBy({
        by: ['sede_id'],
        _count: {
          id: true
        }
      });

      const sedes = await prisma.sedes.findMany({
        where: {
          id: {
            in: servidoresPorSede.map(item => item.sede_id)
          }
        }
      });

      const estadisticasPorSede = servidoresPorSede.map(item => {
        const sede = sedes.find(s => s.id === item.sede_id);
        return {
          sede_id: item.sede_id,
          sede_nombre: sede ? sede.nombre : 'Desconocida',
          cantidad: item._count.id
        };
      });

      res.json({
        total_servidores: totalServidores,
        por_estado: servidoresPorEstado.map(item => ({
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

  async buscar(req, res) {
    try {
      const { q } = req.query;

      if (!q) {
        return res.status(400).json({ error: 'Término de búsqueda requerido' });
      }

      const servidores = await prisma.servidores.findMany({
        where: {
          OR: [
            { ip_servidores: { contains: q, mode: 'insensitive' } },
            { descripcion: { contains: q, mode: 'insensitive' } },
            { cereal_servidores: { contains: q, mode: 'insensitive' } },
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

      res.json(servidores);
    } catch (error) {
      console.error('Error en buscar:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async generarPDFGeneral(req, res) {
    try {
      console.log('Generando PDF general de servidores...');

      const servidores = await prisma.servidores.findMany({
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true
        },
        orderBy: [
          { sede_id: 'asc' },
          { id: 'asc' }
        ]
      });

      console.log(`${servidores.length} servidores encontrados`);

      const data = {
        titulo: 'Reporte General de Servidores',
        fecha: new Date().toLocaleDateString('es-ES', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        total: servidores.length,
        servidores: servidores,
        estadisticas: {
          activos: servidores.filter(s => s.estado === 'activo').length,
          inactivos: servidores.filter(s => s.estado === 'inactivo').length,
          mantenimiento: servidores.filter(s => s.estado === 'mantenimiento').length,
          desuso: servidores.filter(s => s.estado === 'desuso').length
        }
      };

      const html = await renderTemplate(req.app, 'pdfs/reporte-general-servidores', data);
      
      console.log('Generando PDF...');

      const pdfOptions = {
        format: 'Letter',
        landscape: true,
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      };

      const pdfBuffer = await PuppeteerPDF.generatePDF(html, pdfOptions);
      console.log('PDF generado exitosamente');
      console.log('Tamaño del buffer PDF:', pdfBuffer.length);

      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="reporte-general-servidores.pdf"',
        'Content-Length': pdfBuffer.length,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      
      console.log(`PDF general generado exitosamente - ${servidores.length} servidores`);

      res.end(pdfBuffer);

    } catch (error) {
      console.error('Error generando PDF general:', error);
      
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Error generando PDF', 
        detalles: error.message
      }));
    }
  },

  async equiposServidores(req, res) {
    try {
      console.log('Buscando equipos servidores desde servidoresController...');
      
      const equipos = await prisma.stock_equipos.findMany({
        where: {
          OR: [
            {
              tipo_equipo: {
                nombre: {
                  contains: 'servidor',
                  mode: 'insensitive'
                }
              }
            },
            {
              tipo_equipo: {
                nombre: {
                  contains: 'server',
                  mode: 'insensitive'
                }
              }
            }
          ],
          cantidad_disponible: {
            gt: 0
          }
        },
        include: {
          tipo_equipo: true
        },
        orderBy: {
          marca: 'asc'
        }
      });
      
      console.log(`${equipos.length} servidores encontrados`);
      res.json(equipos);
      
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ error: error.message });
    }
  },


};