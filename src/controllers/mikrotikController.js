import { PrismaClient } from '@prisma/client';
import PuppeteerPDF from '../services/puppeteerPDF.js';
import { renderTemplate } from '../helpers/renderHelper.js';

const prisma = new PrismaClient();

export const mikrotikController = {
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
          { ip_mikrotik: { contains: search, mode: 'insensitive' } },
          { cereal_mikrotik: { contains: search, mode: 'insensitive' } },
          { ubicacion: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (sede_id) {
        where.sede_id = parseInt(sede_id);
      }

      if (estado) {
        where.estado = estado;
      }

      const totalRecords = await prisma.mikrotik.count({ where });

      const mikrotiks = await prisma.mikrotik.findMany({
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
        mikrotiks: mikrotiks,
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

      console.log('Datos recibidos para crear mikrotik:', req.body);

      const stockEquiposId = parseInt(stock_equipos_id);
      const sedeId = parseInt(sede_id);

      const mikrotikStock = await prisma.stock_equipos.findMany({
        where: { id: stockEquiposId }, 
        include: { tipo_equipo: true }
      });

      if (!mikrotikStock) {
        return res.status(404).json({ error: 'Equipo no encontrado en inventario' });
      }

      if (mikrotikStock.cantidad_disponible <= 0) {
        return res.status(400).json({ error: 'No hay stock disponible para este equipo' });
      }



      const resultado = await prisma.$transaction(async (tx) => {
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

      console.log('Datos recibidos para actualizar:', req.body);

      const mikrotikId = parseInt(id);
      const sedeId = sede_id ? parseInt(sede_id) : undefined;

      const mikrotikActual = await prisma.mikrotik.findUnique({
        where: { id: mikrotikId },
        include: {
          stock_equipos: true
        }
      });

      if (!mikrotikActual) {
        return res.status(404).json({ error: 'Mikrotik no encontrado' });
      }

      console.log(`Mikrotik actual - Estado: ${mikrotikActual.estado}, Stock ID: ${mikrotikActual.stock_equipos_id}`);

      const resultado = await prisma.$transaction(async (tx) => {
        const estadoAnterior = mikrotikActual.estado;
        const estadoNuevo = estado;
        const stockEquipoId = mikrotikActual.stock_equipos_id;

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
            console.log('Devolviendo equipo activo al inventario');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_disponible: { increment: 1 },
                cantidad_asignada: { decrement: 1 }
              }
            });
          }

          else if ((estadoAnterior === 'inactivo' || estadoAnterior === 'mantenimiento') && estadoNuevo === 'activo') {
            console.log('Asignando equipo desde inventario a activo');
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
            console.log('Marcando equipo activo como desuso - reduciendo inventario');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_total: { decrement: 1 },
                cantidad_asignada: { decrement: 1 }
              }
            });
          }

          else if ((estadoAnterior === 'inactivo' || estadoAnterior === 'mantenimiento') && estadoNuevo === 'desuso') {
            console.log('Marcando equipo inactivo/mantenimiento como desuso - reduciendo inventario');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_total: { decrement: 1 },
                cantidad_disponible: { decrement: 1 }
              }
            });
          }

          else if (estadoAnterior === 'desuso' && estadoNuevo === 'activo') {
            console.log('Reactivar equipo desde desuso');
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
            console.log('Mover equipo de desuso a inventario disponible');
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

        const mikrotikActualizado = await tx.mikrotik.update({
          where: { id: mikrotikId },
          data: {
            descripcion,
            sede_id: sedeId,
            ubicacion,
            ip_mikrotik,
            cereal_mikrotik,
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

        return mikrotikActualizado;
      });

      res.json({
        message: 'Mikrotik actualizado exitosamente',
        mikrotik: resultado
      });

    } catch (error) {
      console.error('Error en update:', error);
      res.status(500).json({ error: error.message });
    }
  },


 async destroy(req, res) {
  try {
    const { id } = req.params;

    const mikrotik = await prisma.mikrotik.findUnique({
      where: { id: parseInt(id) },
      include: {
        stock_equipos: true
      }
    });

    if (!mikrotik) {
      return res.status(404).json({ error: 'Mikrotik no encontrado' });
    }

    await prisma.$transaction(async (tx) => {
      const stockEquipoId = mikrotik.stock_equipos_id;
      const estadoActual = mikrotik.estado;

      console.log(`Eliminando mikrotik con estado: ${estadoActual}`);

      if (estadoActual === 'activo') {
        console.log(`Devolviendo mikrotik activo al inventario`);
        
        await tx.stock_equipos.update({
          where: { id: stockEquipoId },
          data: {
            cantidad_disponible: { increment: 1 },
            cantidad_asignada: { decrement: 1 }
          }
        });
      } 
      else if (estadoActual === 'inactivo' || estadoActual === 'mantenimiento') {
        console.log(`Mikrotik ya estaba disponible, no se modifica inventario`);
      }
      
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
      where: { id: parseInt(id) },
      include: {
        stock_equipos: true
      }
    });

    if (!mikrotik) {
      return res.status(404).json({ error: 'Mikrotik no encontrado' });
    }

    const mikrotikActualizado = await prisma.$transaction(async (tx) => {
      const estadoAnterior = mikrotik.estado;
      const estadoNuevo = estado;
      const stockEquipoId = mikrotik.stock_equipos_id;

      console.log(`Cambio de estado: ${estadoAnterior} -> ${estadoNuevo}`);

      if (estadoAnterior !== estadoNuevo) {
        const stockActual = await tx.stock_equipos.findUnique({
          where: { id: stockEquipoId }
        });

        if (!stockActual) {
          throw new Error('Stock de equipo no encontrado');
        }

        if (estadoAnterior === 'activo' && (estadoNuevo === 'inactivo' || estadoNuevo === 'mantenimiento')) {
          console.log('Devolviendo equipo activo al inventario');
          await tx.stock_equipos.update({
            where: { id: stockEquipoId },
            data: {
              cantidad_disponible: { increment: 1 },
              cantidad_asignada: { decrement: 1 }
            }
          });
        }
        else if ((estadoAnterior === 'inactivo' || estadoAnterior === 'mantenimiento') && estadoNuevo === 'activo') {
          console.log('Asignando equipo desde inventario a activo');
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
          console.log('Marcando equipo activo como desuso');
          await tx.stock_equipos.update({
            where: { id: stockEquipoId },
            data: {
              cantidad_total: { decrement: 1 },
              cantidad_asignada: { decrement: 1 }
            }
          });
        }
        else if ((estadoAnterior === 'inactivo' || estadoAnterior === 'mantenimiento') && estadoNuevo === 'desuso') {
          console.log('Marcando equipo inactivo/mantenimiento como desuso');
          await tx.stock_equipos.update({
            where: { id: stockEquipoId },
            data: {
              cantidad_total: { decrement: 1 },
              cantidad_disponible: { decrement: 1 }
            }
          });
        }
        else if (estadoAnterior === 'desuso' && estadoNuevo === 'activo') {
          console.log('Reactivar equipo desde desuso');
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
          console.log('Mover equipo de desuso a inventario disponible');
          await tx.stock_equipos.update({
            where: { id: stockEquipoId },
            data: {
              cantidad_total: { increment: 1 },
              cantidad_disponible: { increment: 1 }
            }
          });
        }
      }

      const mikrotikActualizado = await tx.mikrotik.update({
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

      return mikrotikActualizado;
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
  },

  async generarPDFGeneral(req, res) {
    try {
      console.log('Generando PDF general de mikrotiks...');

      const mikrotiks = await prisma.mikrotik.findMany({
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

      console.log(`${mikrotiks.length} mikrotiks encontrados`);

      const data = {
        titulo: 'Reporte General de Mikrotiks',
        fecha: new Date().toLocaleDateString('es-ES', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        total: mikrotiks.length,
        mikrotiks: mikrotiks,
        estadisticas: {
          activos: mikrotiks.filter(m => m.estado === 'activo').length,
          inactivos: mikrotiks.filter(m => m.estado === 'inactivo').length,
          mantenimiento: mikrotiks.filter(m => m.estado === 'mantenimiento').length,
          desuso: mikrotiks.filter(m => m.estado === 'desuso').length
        }
      };

      const html = await renderTemplate(req.app, 'pdfs/reporte-general-mikrotiks', data);
      
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
        'Content-Disposition': 'inline; filename="reporte-general-mikrotiks.pdf"',
        'Content-Length': pdfBuffer.length,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      
      console.log(`PDF general generado exitosamente - ${mikrotiks.length} mikrotiks`);

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

  async generarPDFPorSede(req, res) {
    try {
      const { sede_id } = req.params;
      const sedeId = parseInt(sede_id);

      console.log(`Generando PDF de mikrotiks para sede ID: ${sedeId}`);

      if (isNaN(sedeId) || sedeId <= 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'ID de sede no válido' }));
      }

      const sede = await prisma.sedes.findUnique({
        where: { id: sedeId }
      });

      if (!sede) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Sede no encontrada' }));
      }

      const mikrotiks = await prisma.mikrotik.findMany({
        where: { sede_id: sedeId },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true
        },
        orderBy: [
          { ubicacion: 'asc' },
          { id: 'asc' }
        ]
      });

      if (mikrotiks.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ 
          error: 'No se encontraron mikrotiks para esta sede' 
        }));
      }

      console.log(`${mikrotiks.length} mikrotiks encontrados en ${sede.nombre}`);

      const data = {
        titulo: `Reporte de Mikrotiks - ${sede.nombre}`,
        subtitulo: `Sede: ${sede.nombre}`,
        fecha: new Date().toLocaleDateString('es-ES', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        total: mikrotiks.length,
        mikrotiks: mikrotiks,
        sede: sede,
        estadisticas: {
          activos: mikrotiks.filter(m => m.estado === 'activo').length,
          inactivos: mikrotiks.filter(m => m.estado === 'inactivo').length,
          mantenimiento: mikrotiks.filter(m => m.estado === 'mantenimiento').length,
          desuso: mikrotiks.filter(m => m.estado === 'desuso').length
        }
      };

      console.log('Renderizando template para sede...');
      
      const html = await renderTemplate(req.app, 'pdfs/reporte-mikrotiks-sede', data);

      console.log(' Generando PDF para sede...');
      
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


      const filename = `reporte-mikrotiks-${sede.nombre.replace(/\s+/g, '-')}.pdf`;
      
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': pdfBuffer.length,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      
      res.end(pdfBuffer);

    } catch (error) {
      console.error('Error generando PDF por sede:', error);
      

      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Error generando PDF', 
        detalles: error.message 
      }));
    }
  }
};