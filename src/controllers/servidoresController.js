import { PrismaClient } from '@prisma/client';
import PuppeteerPDF from '../services/puppeteerPDF.js';
import PDFDocument from 'pdfkit';
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

       if (ip_servidores) {
      const ipExistente = await prisma.servidores.findFirst({
        where: { ip_servidores }
      });
      if (ipExistente) {
        return res.status(400).json({ error: 'La dirección IP ya está en uso por otro servidor' });
      }
    }

    if (cereal_servidores) {
      const cerealExistente = await prisma.servidores.findFirst({
        where: { cereal_servidores }
      });
      if (cerealExistente) {
        return res.status(400).json({ error: 'El número de serie ya está en uso por otro servidor' });
      }
    }

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
    if (error.code === 'P2002') {
      const campo = error.meta?.target?.[0];
      const mensajes = {
        ip_servidores: 'La dirección IP ya está en uso',
        cereal_servidores: 'El número de serie ya está en uso'
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
        ip_servidores,
        cereal_servidores,
        estado 
      } = req.body;

      console.log('Datos recibidos para actualizar:', req.body);

      const servidorId = parseInt(id);

      if (ip_servidores) {
      const ipExistente = await prisma.servidores.findFirst({
        where: {
          ip_servidores,
          id: { not: servidorId }
        }
      });
      
      if (ipExistente) {
        return res.status(400).json({ error: 'La dirección IP ya está en uso por otro servidor' });
      }
    }

    if (cereal_servidores) {
      const cerealExistente = await prisma.servidores.findFirst({
        where: {
          cereal_servidores,
          id: { not: servidorId }
        }
      });
      if (cerealExistente) {
        return res.status(400).json({ error: 'El número de serie ya está en uso por otro servidor' });
      }
    }
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
    if (error.code === 'P2002') {
      const campo = error.meta?.target?.[0];
      const mensajes = {
        ip_servidores: 'La dirección IP ya está en uso',
        cereal_servidores: 'El número de serie ya está en uso'
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

// Versión de prueba mínima
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

    // Crear documento PDF en formato VERTICAL
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
    res.setHeader('Content-Disposition', 'inline; filename="reporte-general-servidores.pdf"');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Pipe del PDF a la respuesta
    doc.pipe(res);

    // Variables de configuración
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    let yPosition = doc.page.margins.top;

    // ===== HEADER =====
    // Primero dibujar el texto
    doc.fontSize(12)
       .fillColor('#DC2626')
       .font('Helvetica-Bold')
       .text('FRITZ C.A', doc.page.margins.left, yPosition, { 
         align: 'center',
         width: pageWidth
       });
    
    yPosition += 18;
    
    // Título principal
    doc.fontSize(16)
       .fillColor('black') // CORREGIDO: era '#0000'
       .text('Reporte General de Servidores', doc.page.margins.left, yPosition, { 
         align: 'center',
         width: pageWidth
       });
    
    yPosition += 20;
    
    // Subtítulo
    doc.fontSize(10)
       .fillColor('#666666') // CORREGIDO: especificar color completo
       .font('Helvetica')
       .text('Sistema de Gestión de Servidores', doc.page.margins.left, yPosition, {
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
    const sedesUnicas = [...new Set(servidores.map(s => s.sede_id).filter(Boolean))];

    // Fondo del metadata - DIBUJAR POR SEPARADO
    doc.rect(doc.page.margins.left, yPosition, pageWidth, 25)
       .fill('#f8f9fa');
    
    // Borde
    doc.rect(doc.page.margins.left, yPosition, pageWidth, 25)
       .stroke('#DC2626');
    
    yPosition += 8;

    // Metadata en 3 columnas
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
      activos: servidores.filter(s => s.estado === 'activo').length,
      inactivos: servidores.filter(s => s.estado === 'inactivo').length,
      mantenimiento: servidores.filter(s => s.estado === 'mantenimiento').length,
      desuso: servidores.filter(s => s.estado === 'desuso').length
    };

    const statWidth = (pageWidth - 20) / 5;
    const statHeight = 25;
    const statY = yPosition;

    const stats = [
      { label: 'TOTAL', value: servidores.length, color: '#DC2626' },
      { label: 'ACTIVOS', value: estadisticas.activos, color: '#DC2626' },
      { label: 'INACTIVOS', value: estadisticas.inactivos, color: '#DC2626' },
      { label: 'MANTENIMIENTO', value: estadisticas.mantenimiento, color: '#DC2626' },
      { label: 'OBSOLETOS', value: estadisticas.desuso, color: '#DC2626' }
    ];

    stats.forEach((stat, index) => {
      const x = doc.page.margins.left + (statWidth * index);
      
      // Fondo de la tarjeta
      doc.rect(x, statY, statWidth - 2, statHeight)
         .fill('#e9ecef');
      
      // Borde
      doc.rect(x, statY, statWidth - 2, statHeight)
         .stroke('#cccccc');
      
      // Número
      doc.fontSize(12)
         .fillColor(stat.color)
         .font('Helvetica-Bold')
         .text(stat.value.toString(), x, statY + 5, {
           width: statWidth - 2,
           align: 'center'
         });
      
      // Etiqueta
      doc.fontSize(7)
         .fillColor('#333333')
         .font('Helvetica')
         .text(stat.label, x, statY + 17, {
           width: statWidth - 2,
           align: 'center'
         });
    });

    yPosition += 40;

    // ===== TABLA =====
    if (servidores.length > 0) {
      // Configuración de columnas
      const columnWidths = {
        equipo: 70,
        ip: 55,
        serial: 65,
        sede: 55,
        detalles: 75,
        ubicacion: 55,
        estado: 40
      };

      const totalTableWidth = Object.values(columnWidths).reduce((a, b) => a + b, 0);
      
      const headers = [
        { text: 'EQUIPO', width: columnWidths.equipo },
        { text: 'IP', width: columnWidths.ip },
        { text: 'SERIAL', width: columnWidths.serial },
        { text: 'SEDE', width: columnWidths.sede },
        { text: 'DETALLES', width: columnWidths.detalles },
        { text: 'UBICACIÓN', width: columnWidths.ubicacion },
        { text: 'ESTADO', width: columnWidths.estado }
      ];

      let currentY = yPosition;

      // DIBUJAR ENCABEZADOS DE TABLA - FORMA CORRECTA
      let currentX = doc.page.margins.left;
      
      headers.forEach(header => {
        // Fondo del encabezado
        doc.rect(currentX, currentY, header.width, 15)
           .fill('#DC2626');
        
        // Texto del encabezado (BLANCO sobre fondo rojo)
        doc.fontSize(7)
           .fillColor('white')
           .font('Helvetica-Bold')
           .text(header.text, currentX + 3, currentY + 4, {
             width: header.width - 6,
             align: 'left'
           });
        
        currentX += header.width;
      });

      currentY += 15;

      // CONTENIDO DE LA TABLA
      doc.fontSize(6)
         .fillColor('black')
         .font('Helvetica');

      let currentSede = null;

      servidores.forEach((servidor, index) => {
        // Verificar si necesitamos nueva página
        if (currentY > doc.page.height - doc.page.margins.bottom - 20) {
          doc.addPage();
          currentY = doc.page.margins.top;
          
          // Redibujar encabezados en nueva página
          let headerX = doc.page.margins.left;
          headers.forEach(header => {
            doc.rect(headerX, currentY, header.width, 15)
               .fill('#DC2626');
            
            doc.fontSize(7)
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
        if (currentSede !== servidor.sede_id && servidor.sede) {
          currentSede = servidor.sede_id;
          doc.fontSize(7)
             .fillColor('#333333')
             .font('Helvetica-Bold')
             .text(`SEDE: ${servidor.sede.nombre}`, doc.page.margins.left, currentY + 2);
          
          currentY += 10;
        }

        // Fondo alternado para filas
        if (index % 2 === 0) {
          doc.rect(doc.page.margins.left, currentY, totalTableWidth, 10)
             .fill('#f8f9fa');
        }

        // CONTENIDO DE LAS CELDAS
        let cellX = doc.page.margins.left;

        // Equipo/Modelo
        let equipoText = 'No asignado';
        if (servidor.stock_equipos) {
          const marca = servidor.stock_equipos.marca || '';
          const modelo = servidor.stock_equipos.modelo || '';
          const tipo = servidor.stock_equipos.tipo_equipo ? servidor.stock_equipos.tipo_equipo.nombre : '';
          equipoText = `${marca} ${modelo}`.trim();
          if (tipo) {
            equipoText += `\n${tipo}`;
          }
        }
        doc.text(equipoText, cellX + 3, currentY + 2, {
          width: columnWidths.equipo - 6,
          lineGap: 1
        });
        cellX += columnWidths.equipo;

        // IP
        const ipText = servidor.ip_servidores || '-';
        doc.text(ipText, cellX + 3, currentY + 2, {
          width: columnWidths.ip - 6
        });
        cellX += columnWidths.ip;

        // Serial
        const serialText = servidor.cereal_servidores || '-';
        doc.text(serialText, cellX + 3, currentY + 2, {
          width: columnWidths.serial - 6
        });
        cellX += columnWidths.serial;

        // Sede
        const sedeText = servidor.sede ? servidor.sede.nombre : 'Sin sede';
        doc.text(sedeText, cellX + 3, currentY + 2, {
          width: columnWidths.sede - 6
        });
        cellX += columnWidths.sede;

        // Detalles
        let detallesText = servidor.descripcion || 'Sin detalles';
        if (detallesText.length > 25) {
          detallesText = detallesText.substring(0, 25) + '...';
        }
        doc.text(detallesText, cellX + 3, currentY + 2, {
          width: columnWidths.detalles - 6
        });
        cellX += columnWidths.detalles;

        // Ubicación
        const ubicacionText = servidor.ubicacion || '-';
        doc.text(ubicacionText, cellX + 3, currentY + 2, {
          width: columnWidths.ubicacion - 6
        });
        cellX += columnWidths.ubicacion;

        // Estado
        const estadoText = servidor.estado ? 
          servidor.estado.charAt(0).toUpperCase() + servidor.estado.slice(1) : '-';
        
        // Color según estado
        let estadoColor = 'black';
        switch(servidor.estado) {
          case 'activo': estadoColor = '#065f46'; break;
          case 'inactivo': estadoColor = '#374151'; break;
          case 'mantenimiento': estadoColor = '#92400e'; break;
          case 'desuso': estadoColor = '#be185d'; break;
        }
        
        doc.fillColor(estadoColor)
           .text(estadoText, cellX + 3, currentY + 2, {
             width: columnWidths.estado - 6
           })
           .fillColor('black'); // Reset color

        currentY += 10;
      });

    } else {
      // Mensaje cuando no hay datos
      doc.fontSize(12)
         .fillColor('#666666')
         .text('No se encontraron servidores', doc.page.margins.left, yPosition, {
           width: pageWidth,
           align: 'center'
         });
      
      yPosition += 20;
      
      doc.fontSize(10)
         .text('No hay servidores registrados en el sistema para generar el reporte.', 
               doc.page.margins.left, yPosition, {
           width: pageWidth,
           align: 'center'
         });
    }

    // ===== FOOTER =====
    const footerY = doc.page.height - doc.page.margins.bottom - 15;
    
    // Línea separadora
    doc.moveTo(doc.page.margins.left, footerY - 8)
       .lineTo(doc.page.margins.left + pageWidth, footerY - 8)
       .strokeColor('#dddddd')
       .lineWidth(1)
       .stroke();
    
    // Texto del footer
    doc.fontSize(8)
       .fillColor('#666666')
       .text('FRITZ C.A - Sistema de Gestión de Servidores | Reporte generado automáticamente', 
             doc.page.margins.left, footerY, {
               width: pageWidth,
               align: 'center'
             });

    // Finalizar PDF
    doc.end();

    console.log(`PDF general generado exitosamente - ${servidores.length} servidores`);

  } catch (error) {
    console.error('Error generando PDF general:', error);
    
    res.status(500).json({ 
      error: 'Error generando PDF', 
      detalles: error.message
    });
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