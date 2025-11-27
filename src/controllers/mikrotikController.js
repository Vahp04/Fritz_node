import { PrismaClient } from '@prisma/client';
import PuppeteerPDF from '../services/puppeteerPDF.js';
import { renderTemplate } from '../helpers/renderHelper.js';
import PDFDocument from 'pdfkit';


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

    const estadisticasGlobales = await prisma.mikrotik.groupBy({
      by: ['estado'],
      _count: {
        id: true
      },
      where: where 
    });

    const estadisticas = {
      total: totalRecords,
      activos: estadisticasGlobales.find(e => e.estado === 'activo')?._count.id || 0,
      inactivos: estadisticasGlobales.find(e => e.estado === 'inactivo')?._count.id || 0,
      mantenimiento: estadisticasGlobales.find(e => e.estado === 'mantenimiento')?._count.id || 0,
      desuso: estadisticasGlobales.find(e => e.estado === 'desuso')?._count.id || 0
    };

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
      },
      estadisticas: estadisticas 
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

         if (ip_mikrotik) {
      const ipExistente = await prisma.mikrotik.findFirst({
        where: { ip_mikrotik }
      });
      if (ipExistente) {
        return res.status(400).json({ error: 'La dirección IP ya está en uso por otro Mikrotik' });
      }
    }

    if (cereal_mikrotik) {
      const cerealExistente = await prisma.mikrotik.findFirst({
        where: { cereal_mikrotik }
      });
      if (cerealExistente) {
        return res.status(400).json({ error: 'El número de serie ya está en uso por otro Mikrotik' });
      }
    }

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
    if (error.code === 'P2002') {
      const campo = error.meta?.target?.[0];
      const mensajes = {
        ip_mikrotik: 'La dirección IP ya está en uso',
        cereal_mikrotik: 'El número de serie ya está en uso'
      };
      return res.status(400).json({ 
        error: mensajes[campo] || 'El valor ya existe en otro registro' 
      });
    }
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
        if (ip_mikrotik) {
      const ipExistente = await prisma.mikrotik.findFirst({
        where: {
          ip_mikrotik,
          id: { not: mikrotikId }
        }
      });
      if (ipExistente) {
        return res.status(400).json({ error: 'La dirección IP ya está en uso por otro Mikrotik' });
      }
    }

    if (cereal_mikrotik) {
      const cerealExistente = await prisma.mikrotik.findFirst({
        where: {
          cereal_mikrotik,
          id: { not: mikrotikId }
        }
      });
      if (cerealExistente) {
        return res.status(400).json({ error: 'El número de serie ya está en uso por otro Mikrotik' });
      }
    }
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
    if (error.code === 'P2002') {
      const campo = error.meta?.target?.[0];
      const mensajes = {
        ip_mikrotik: 'La dirección IP ya está en uso',
        cereal_mikrotik: 'El número de serie ya está en uso'
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

    // Crear documento PDF
    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'portrait',
      margins: {
        top: 20,
        bottom: 20,
        left: 15,
        right: 15
      }
    });

    // Configurar headers de respuesta
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="reporte-general-mikrotiks.pdf"');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Pipe del PDF a la respuesta
    doc.pipe(res);

    // Variables de configuración
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    let yPosition = doc.page.margins.top;

    // ===== HEADER =====
    doc.fontSize(12)
       .fillColor('#DC2626')
       .font('Helvetica-Bold')
       .text('FRITZ C.A', doc.page.margins.left, yPosition, { 
         align: 'center',
         width: pageWidth
       });
    
    yPosition += 18;
    
    doc.fontSize(16)
       .fillColor('black')
       .text('Reporte General de Mikrotiks', doc.page.margins.left, yPosition, { 
         align: 'center',
         width: pageWidth
       });
    
    yPosition += 20;
    
    doc.fontSize(10)
       .fillColor('#666666')
       .font('Helvetica')
       .text('Sistema de Gestión de Redes', doc.page.margins.left, yPosition, {
         align: 'center',
         width: pageWidth
       });
    
    yPosition += 25;

    // ===== METADATA =====
    const fecha = new Date().toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    const hora = new Date().toLocaleTimeString('es-ES');
    const sedesUnicas = [...new Set(mikrotiks.map(m => m.sede_id).filter(Boolean))];

    // Fondo del metadata
    doc.rect(doc.page.margins.left, yPosition, pageWidth, 25)
       .fill('#f8f9fa');
    
    doc.rect(doc.page.margins.left, yPosition, pageWidth, 25)
       .stroke('#DC2626');
    
    yPosition += 8;

    const colWidth = pageWidth / 3;
    
    doc.fontSize(8)
       .fillColor('#333333')
       .font('Helvetica-Bold')
       .text('FECHA DE GENERACIÓN', doc.page.margins.left, yPosition);
    
    doc.text('TOTAL DE SEDES', doc.page.margins.left + colWidth, yPosition);
    
    doc.text('HORA', doc.page.margins.left + colWidth * 2, yPosition);
    
    yPosition += 8;
    
    doc.font('Helvetica')
       .fillColor('#1a1a1a')
       .fontSize(9)
       .text(fecha, doc.page.margins.left, yPosition);
    
    doc.text(`${sedesUnicas.length} sedes`, doc.page.margins.left + colWidth, yPosition);
    
    doc.text(hora, doc.page.margins.left + colWidth * 2, yPosition);
    
    yPosition += 35;

    // ===== ESTADÍSTICAS =====
    const estadisticas = {
      activos: mikrotiks.filter(m => m.estado === 'activo').length,
      inactivos: mikrotiks.filter(m => m.estado === 'inactivo').length,
      mantenimiento: mikrotiks.filter(m => m.estado === 'mantenimiento').length,
      desuso: mikrotiks.filter(m => m.estado === 'desuso').length
    };

    const statWidth = (pageWidth - 20) / 5;
    const statHeight = 25;
    const statY = yPosition;

    const stats = [
      { label: 'TOTAL', value: mikrotiks.length, color: '#DC2626' },
      { label: 'ACTIVOS', value: estadisticas.activos, color: '#DC2626' },
      { label: 'INACTIVOS', value: estadisticas.inactivos, color: '#DC2626' },
      { label: 'MANTENIMIENTO', value: estadisticas.mantenimiento, color: '#DC2626' },
      { label: 'OBSOLETOS', value: estadisticas.desuso, color: '#DC2626' }
    ];

    stats.forEach((stat, index) => {
      const x = doc.page.margins.left + (statWidth * index);
      
      doc.rect(x, statY, statWidth - 2, statHeight)
         .fill('#e9ecef');
      
      doc.rect(x, statY, statWidth - 2, statHeight)
         .stroke('#cccccc');
      
      doc.fontSize(12)
         .fillColor(stat.color)
         .font('Helvetica-Bold')
         .text(stat.value.toString(), x, statY + 5, {
           width: statWidth - 2,
           align: 'center'
         });
      
      doc.fontSize(7)
         .fillColor('#333333')
         .font('Helvetica')
         .text(stat.label, x, statY + 17, {
           width: statWidth - 2,
           align: 'center'
         });
    });

    yPosition += 40;

    // ===== TABLA CON ALTURA DINÁMICA MEJORADA =====
    if (mikrotiks.length > 0) {
      // Configuración de columnas para mikrotiks
      const columnWidths = {
        equipo: 90,
        ip: 70,
        serial: 80,
        sede: 60,
        descripcion: 130, 
        ubicacion: 90,
        estado: 40
      };

      const totalTableWidth = Object.values(columnWidths).reduce((a, b) => a + b, 0);
      
      const headers = [
        { text: 'EQUIPO', width: columnWidths.equipo },
        { text: 'IP', width: columnWidths.ip },
        { text: 'SERIAL', width: columnWidths.serial },
        { text: 'SEDE', width: columnWidths.sede },
        { text: 'DESCRIPCIÓN', width: columnWidths.descripcion }, 
        { text: 'UBICACIÓN', width: columnWidths.ubicacion },
        { text: 'ESTADO', width: columnWidths.estado }
      ];

      let currentY = yPosition;

      // DIBUJAR ENCABEZADOS
      let currentX = doc.page.margins.left;
      
      headers.forEach(header => {
        doc.rect(currentX, currentY, header.width, 15)
           .fill('#DC2626');
        
        doc.fontSize(8)
           .fillColor('white')
           .font('Helvetica-Bold')
           .text(header.text, currentX + 3, currentY + 4, {
             width: header.width - 6,
             align: 'left'
           });
        
        currentX += header.width;
      });

      currentY += 15;

      const calcularLineasTexto = (texto, anchoMaximo, fontSize = 7) => {
        if (!texto) return 1;
        
        const palabras = texto.split(' ');
        let lineas = 1;
        let lineaActual = '';
        
        const tempSize = doc.fontSize();
        doc.fontSize(fontSize);
        
        for (const palabra of palabras) {
          const lineaPrueba = lineaActual ? `${lineaActual} ${palabra}` : palabra;
          const anchoLinea = doc.widthOfString(lineaPrueba);
          
          if (anchoLinea <= anchoMaximo) {
            lineaActual = lineaPrueba;
          } else {
            lineas++;
            lineaActual = palabra;
          }
        }
        
        doc.fontSize(tempSize);
        return lineas;
      };

      let currentSede = null;

      mikrotiks.forEach((mikrotik, index) => {
        const anchoEquipo = columnWidths.equipo - 6;
        const anchoDescripcion = columnWidths.descripcion - 6; 
        const anchoUbicacion = columnWidths.ubicacion - 6;
        
        const equipoText = mikrotik.stock_equipos ? 
          `${mikrotik.stock_equipos.marca || ''} ${mikrotik.stock_equipos.modelo || ''}`.trim() + 
          (mikrotik.stock_equipos.tipo_equipo ? `\n${mikrotik.stock_equipos.tipo_equipo.nombre}` : '') 
          : 'No asignado';
        
        const descripcionText = mikrotik.descripcion || 'Sin descripción'; 
        const ubicacionText = mikrotik.ubicacion || '-';
        
        
        const lineasEquipo = equipoText.split('\n').length;
        const lineasDescripcion = calcularLineasTexto(descripcionText, anchoDescripcion); 
        const lineasUbicacion = calcularLineasTexto(ubicacionText, anchoUbicacion);
        
       
        const maxLines = Math.max(lineasEquipo, lineasDescripcion, lineasUbicacion, 1); 
        
       
        const lineaBaseHeight = 10;
        const alturaPorLineaExtra = 8;
        const rowHeight = lineaBaseHeight + ((maxLines - 1) * alturaPorLineaExtra);

        if (currentY + rowHeight > doc.page.height - doc.page.margins.bottom - 20) {
          doc.addPage();
          currentY = doc.page.margins.top;
          
          // Redibujar encabezados en nueva página
          let headerX = doc.page.margins.left;
          headers.forEach(header => {
            doc.rect(headerX, currentY, header.width, 15)
               .fill('#DC2626');
            
            doc.fontSize(8)
               .fillColor('white')
               .font('Helvetica-Bold')
               .text(header.text, headerX + 3, currentY + 4, {
                 width: header.width - 6,
                 align: 'left'
               });
            
            headerX += header.width;
          });
          currentY += 15;
        }

        // Cambio de sede
        if (currentSede !== mikrotik.sede_id && mikrotik.sede) {
          currentSede = mikrotik.sede_id;
          doc.fontSize(7)
             .fillColor('#333333')
             .font('Helvetica-Bold')
             .text(`SEDE: ${mikrotik.sede.nombre}`, doc.page.margins.left, currentY + 2);
          
          currentY += 10;
        }

        // Fondo alternado para filas
        if (index % 2 === 0) {
          doc.rect(doc.page.margins.left, currentY, totalTableWidth, rowHeight)
             .fill('#f8f9fa');
        }

        // CONTENIDO DE LAS CELDAS - SIN CORTE DE TEXTO
        let cellX = doc.page.margins.left;

        // Configurar fuente base
        doc.fontSize(7)
           .fillColor('black')
           .font('Helvetica');

        // Equipo/Modelo (multilínea)
        let equipoFinalText = 'No asignado';
        if (mikrotik.stock_equipos) {
          const marca = mikrotik.stock_equipos.marca || '';
          const modelo = mikrotik.stock_equipos.modelo || '';
          const tipo = mikrotik.stock_equipos.tipo_equipo ? mikrotik.stock_equipos.tipo_equipo.nombre : '';
          equipoFinalText = `${marca} ${modelo}`.trim();
          if (tipo) {
            equipoFinalText += `\n${tipo}`;
          }
        }
        
        // Escribir texto con altura suficiente
        const alturaTexto = rowHeight - 4;
        doc.text(equipoFinalText, cellX + 3, currentY + 2, {
          width: anchoEquipo,
          height: alturaTexto,
          lineGap: 2,
          align: 'left'
        });
        cellX += columnWidths.equipo;

        // IP (una línea)
        const ipText = mikrotik.ip_mikrotik || '-';
        doc.text(ipText, cellX + 3, currentY + 2, {
          width: columnWidths.ip - 6,
          height: alturaTexto,
          align: 'left'
        });
        cellX += columnWidths.ip;

        // Serial (una línea)
        const serialText = mikrotik.cereal_mikrotik || '-';
        doc.text(serialText, cellX + 3, currentY + 2, {
          width: columnWidths.serial - 6,
          height: alturaTexto,
          align: 'left'
        });
        cellX += columnWidths.serial;

        // Sede (una línea)
        const sedeText = mikrotik.sede ? mikrotik.sede.nombre : 'Sin sede';
        doc.text(sedeText, cellX + 3, currentY + 2, {
          width: columnWidths.sede - 6,
          height: alturaTexto,
          align: 'left'
        });
        cellX += columnWidths.sede;

        // DESCRIPCIÓN (puede ser multilínea) - CAMBIADO DE USUARIO A DESCRIPCIÓN
        const descripcionFinalText = mikrotik.descripcion || 'Sin descripción'; // Cambiado de usuario_mikrotik a descripcion
        doc.text(descripcionFinalText, cellX + 3, currentY + 2, {
          width: anchoDescripcion,
          height: alturaTexto,
          lineGap: 2,
          align: 'left'
        });
        cellX += columnWidths.descripcion;

        // Ubicación (puede ser multilínea)
        const ubicacionFinalText = mikrotik.ubicacion || '-';
        doc.text(ubicacionFinalText, cellX + 3, currentY + 2, {
          width: anchoUbicacion,
          height: alturaTexto,
          lineGap: 2,
          align: 'left'
        });
        cellX += columnWidths.ubicacion;

        // Estado (una línea)
        const estadoText = mikrotik.estado ? 
          mikrotik.estado.charAt(0).toUpperCase() + mikrotik.estado.slice(1) : '-';
        
        let estadoColor = 'black';
        switch(mikrotik.estado) {
          case 'activo': estadoColor = '#065f46'; break;
          case 'inactivo': estadoColor = '#374151'; break;
          case 'mantenimiento': estadoColor = '#92400e'; break;
          case 'desuso': estadoColor = '#be185d'; break;
        }
        
        doc.fillColor(estadoColor)
           .text(estadoText, cellX + 3, currentY + 2, {
             width: columnWidths.estado - 6,
             height: alturaTexto,
             align: 'center'
           })
           .fillColor('black');

        // DIBUJAR BORDES DE LA TABLA
        doc.rect(doc.page.margins.left, currentY, totalTableWidth, rowHeight)
           .stroke('#dee2e6');

        // Bordes verticales entre columnas
        let borderX = doc.page.margins.left;
        headers.forEach(header => {
          doc.moveTo(borderX, currentY)
             .lineTo(borderX, currentY + rowHeight)
             .stroke('#dee2e6');
          borderX += header.width;
        });
        
        // Última línea vertical
        doc.moveTo(borderX, currentY)
           .lineTo(borderX, currentY + rowHeight)
           .stroke('#dee2e6');

        currentY += rowHeight;
      });

    } else {
      // Mensaje cuando no hay datos
      doc.fontSize(12)
         .fillColor('#666666')
         .text('No se encontraron mikrotiks', doc.page.margins.left, yPosition, {
           width: pageWidth,
           align: 'center'
         });
      
      yPosition += 20;
      
      doc.fontSize(10)
         .text('No hay mikrotiks registrados en el sistema para generar el reporte.', 
               doc.page.margins.left, yPosition, {
           width: pageWidth,
           align: 'center'
         });
    }

    // ===== FOOTER =====
    const footerY = doc.page.height - doc.page.margins.bottom - 15;
    
    doc.moveTo(doc.page.margins.left, footerY - 8)
       .lineTo(doc.page.margins.left + pageWidth, footerY - 8)
       .strokeColor('#dddddd')
       .lineWidth(1)
       .stroke();
    
    doc.fontSize(8)
       .fillColor('#666666')
       .text('FRITZ C.A - Sistema de Gestión de Redes | Reporte generado automáticamente', 
             doc.page.margins.left, footerY, {
               width: pageWidth,
               align: 'center'
             });

    // Finalizar PDF
    doc.end();

    console.log(`PDF general generado exitosamente - ${mikrotiks.length} mikrotiks`);

  } catch (error) {
    console.error('Error generando PDF general:', error);
    
    res.status(500).json({ 
      error: 'Error generando PDF', 
      detalles: error.message
    });
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