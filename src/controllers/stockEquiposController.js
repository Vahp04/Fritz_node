import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import PuppeteerPDF from '../services/puppeteerPDF.js';
import { renderTemplate } from '../helpers/renderHelper.js';

export const stockEquiposController = {
  async index(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = 10;
      const skip = (page - 1) * limit;

      const stockEquipos = await prisma.stock_equipos.findMany({
        skip,
        take: limit,
        include: {
          tipo_equipo: true
        },
        orderBy: { id: 'asc' }
      });

      const total = await prisma.stock_equipos.count();
      
      const stockBajoCount = stockEquipos.filter(equipo => 
        equipo.cantidad_disponible < (equipo.minimo_stock || 0)
      ).length;

      const tipo_equipo = await prisma.tipo_equipo.findMany();

      res.json({
        stockEquipos,
        tipo_equipo,
        stockBajoCount,
        pagination: {
          current: page,
          total: Math.ceil(total / limit),
          totalRecords: total
        }
      });
    } catch (error) {
      console.error('💥 ERROR en index stock:', error);
      res.status(500).json({ 
        error: 'Error al cargar equipos',
        message: error.message
      });
    }
  },

  async store(req, res) {
    try {
      console.log('=== CONTROLADOR STOCK STORE EJECUTÁNDOSE ===');
      console.log('Datos recibidos:', req.body);
      const {
        tipo_equipo_id,
        marca,
        modelo,
        descripcion,
        cantidad_total,
        cantidad_disponible,
        cantidad_asignada,
        minimo_stock,
        fecha_adquisicion,
        valor_adquisicion
      } = req.body;

      console.log('Cantidades - Total:', cantidad_total, 'Disponible:', cantidad_disponible, 'Asignada:', cantidad_asignada);

      if (cantidad_disponible < 0 || cantidad_asignada < 0 || cantidad_total < 0) {
        return res.status(400).json({ 
          error: 'Las cantidades no pueden ser negativas' 
        });
      }

      const stockEquipo = await prisma.stock_equipos.create({
        data: {
          tipo_equipo_id: parseInt(tipo_equipo_id),
          marca,
          modelo,
          descripcion,
          cantidad_total: parseInt(cantidad_total),
          cantidad_disponible: parseInt(cantidad_disponible),
          cantidad_asignada: parseInt(cantidad_asignada),
          minimo_stock: minimo_stock ? parseInt(minimo_stock) : null,
          fecha_adquisicion: fecha_adquisicion ? new Date(fecha_adquisicion) : null,
          valor_adquisicion: valor_adquisicion ? parseFloat(valor_adquisicion) : null
        },
        include: {
          tipo_equipo: true
        }
      });

      res.status(201).json({
        message: 'Equipo en stock creado exitosamente.',
        stockEquipo
      });
    } catch (error) {
      console.error('💥 ERROR en store stock:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async show(req, res) {
    try {
      const { id } = req.params;
      const stockEquipo = await prisma.stock_equipos.findUnique({
        where: { id: parseInt(id) },
        include: {
          tipo_equipo: true
        }
      });

      if (!stockEquipo) {
        return res.status(404).json({ error: 'Equipo en stock no encontrado' });
      }

      res.json(stockEquipo);
    } catch (error) {
      console.error('💥 ERROR en show stock:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const {
        tipo_equipo_id,
        marca,
        modelo,
        descripcion,
        cantidad_total,
        cantidad_disponible,
        cantidad_asignada,
        minimo_stock,
        fecha_adquisicion,
        valor_adquisicion
      } = req.body;

      if (cantidad_disponible < 0 || cantidad_asignada < 0 || cantidad_total < 0) {
        return res.status(400).json({ 
          error: 'Las cantidades no pueden ser negativas' 
        });
      }

      const stockEquipo = await prisma.stock_equipos.update({
        where: { id: parseInt(id) },
        data: {
          tipo_equipo_id: parseInt(tipo_equipo_id),
          marca,
          modelo,
          descripcion,
          cantidad_total: parseInt(cantidad_total),
          cantidad_disponible: parseInt(cantidad_disponible),
          cantidad_asignada: parseInt(cantidad_asignada),
          minimo_stock: minimo_stock ? parseInt(minimo_stock) : null,
          fecha_adquisicion: fecha_adquisicion ? new Date(fecha_adquisicion) : null,
          valor_adquisicion: valor_adquisicion ? parseFloat(valor_adquisicion) : null
        },
        include: {
          tipo_equipo: true
        }
      });

      res.json({
        message: 'Equipo en stock actualizado exitosamente.',
        stockEquipo
      });
    } catch (error) {
      console.error('💥 ERROR en update stock:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async destroy(req, res) {
    try {
      const { id } = req.params;

      const asignaciones = await prisma.equipo_asignado.count({
        where: { stock_equipos_id: parseInt(id) }
      });

      if (asignaciones > 0) {
        return res.status(400).json({ 
          error: 'No se puede eliminar el equipo porque tiene asignaciones asociadas.' 
        });
      }

      await prisma.stock_equipos.delete({
        where: { id: parseInt(id) }
      });

      res.json({ message: 'Equipo en stock eliminado exitosamente.' });
    } catch (error) {
      console.error('💥 ERROR en destroy stock:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async resumenStock(req, res) {
    try {
        console.log('Ejecutando resumenStock...');
        
        const resultado = await prisma.stock_equipos.aggregate({
            _sum: {
                cantidad_total: true,
                cantidad_disponible: true,
                cantidad_asignada: true,
                valor_adquisicion: true
            },
            _count: {
                id: true
            }
        });

        console.log('Resultado aggregate:', resultado);

        const stockBajoCount = await prisma.stock_equipos.count({
            where: {
                cantidad_disponible: {
                    lte: 5 // Valor fijo temporalmente para evitar problemas con minimo_stock
                }
            }
        });

        console.log('Stock bajo count:', stockBajoCount);

        const resumen = {
            total_equipos: resultado._sum.cantidad_total || 0,
            total_disponible: resultado._sum.cantidad_disponible || 0,
            total_asignado: resultado._sum.cantidad_asignada || 0,
            stock_bajo_count: stockBajoCount,
            valor_total: resultado._sum.valor_adquisicion || 0,
            total_items: resultado._count.id || 0
        };

        console.log('Resumen final:', resumen);

        res.json(resumen);
    } catch (error) {
        console.error('Error en resumenStock:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor',
            message: error.message
        });
    }
  },

async apiIndex(req, res) {
    try {
        const stockEquipos = await prisma.stock_equipos.findMany({
            include: {
                tipo_equipo: {
                    select: {
                        id: true,
                        nombre: true,
                        requiere_ip: true  // Asegúrate de incluir este campo
                    }
                }
            }
        });

        console.log('🔍 Primer equipo sample:', stockEquipos[0] ? {
            id: stockEquipos[0].id,
            marca: stockEquipos[0].marca,
            tipo_equipo: stockEquipos[0].tipo_equipo
        } : 'No hay equipos');

        res.json(stockEquipos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
},

  async apiShow(req, res) {
    try {
      const { id } = req.params;
      const stockEquipo = await prisma.stock_equipos.findUnique({
        where: { id: parseInt(id) },
        include: {
          tipo_equipo: true
        }
      });

      if (!stockEquipo) {
        return res.status(404).json({ error: 'Equipo en stock no encontrado' });
      }

      res.json(stockEquipo);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async stockBajo(req, res) {
    try {
      const stockBajo = await prisma.stock_equipos.findMany({
        where: {
          cantidad_disponible: {
            lte: 5 // Valor fijo temporalmente
          }
        },
        include: {
          tipo_equipo: true
        }
      });

      res.json(stockBajo);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async actualizarCantidades(req, res) {
    try {
      const { id } = req.params;
      const { cantidad_disponible, cantidad_asignada } = req.body;

      if (cantidad_disponible < 0 || cantidad_asignada < 0) {
        return res.status(400).json({ 
          error: 'Las cantidades no pueden ser negativas' 
        });
      }

      const total = cantidad_disponible + cantidad_asignada;

      const stockEquipo = await prisma.stock_equipos.update({
        where: { id: parseInt(id) },
        data: {
          cantidad_disponible: parseInt(cantidad_disponible),
          cantidad_asignada: parseInt(cantidad_asignada),
          cantidad_total: total
        },
        include: {
          tipo_equipo: true
        }
      });

      res.json({
        success: true,
        message: 'Cantidades actualizadas correctamente',
        data: stockEquipo
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async porTipo(req, res) {
    try {
      const { tipoId } = req.params;
      const equipos = await prisma.stock_equipos.findMany({
        where: { tipo_equipo_id: parseInt(tipoId) },
        include: {
          tipo_equipo: true
        }
      });

      res.json(equipos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async search(req, res) {
    try {
      const { query } = req.query;
      
      if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
      }

      const stock = await prisma.stock_equipos.findMany({
        where: {
          OR: [
            { marca: { contains: query, mode: 'insensitive' } },
            { modelo: { contains: query, mode: 'insensitive' } },
            { descripcion: { contains: query, mode: 'insensitive' } }
          ]
        },
        include: {
          tipo_equipo: true
        }
      });

      const stockConCount = await Promise.all(
        stock.map(async (equipo) => {
          const equipos_totales_count = await prisma.equipo_asignado.count({
            where: { stock_equipos_id: equipo.id }
          });

          const equipos_activos_count = await prisma.equipo_asignado.count({
            where: { 
              stock_equipos_id: equipo.id,
              estado: 'activo'
            }
          });

          const equipos_devueltos_count = await prisma.equipo_asignado.count({
            where: { 
              stock_equipos_id: equipo.id,
              estado: 'devuelto'
            }
          });

          return {
            ...equipo,
            equipos_totales_count,
            equipos_activos_count,
            equipos_devueltos_count
          };
        })
      );

      res.json(stockConCount);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async generarPdfStock(req, res) {
    console.log('=== GENERAR PDF STOCK INICIADO ===');
    
    try {
        const stockEquipos = await prisma.stock_equipos.findMany({
            include: {
                tipo_equipo: {
                    select: { nombre: true }
                }
            },
            orderBy: [
                { tipo_equipo_id: 'asc' },
                { marca: 'asc' }
            ]
        });

        const totalEquipos = stockEquipos.reduce((sum, equipo) => sum + (equipo.cantidad_total || 0), 0);
        const totalDisponible = stockEquipos.reduce((sum, equipo) => sum + (equipo.cantidad_disponible || 0), 0);
        const totalAsignado = stockEquipos.reduce((sum, equipo) => sum + (equipo.cantidad_asignada || 0), 0);
        
        const valorTotal = stockEquipos.reduce((sum, equipo) => {
            const valorUnitario = equipo.valor_adquisicion || 0;
            const cantidadTotal = equipo.cantidad_total || 0;
            return sum + (valorUnitario * cantidadTotal);
        }, 0);
        
        const stockBajo = stockEquipos.filter(equipo => 
            (equipo.cantidad_disponible || 0) <= (equipo.minimo_stock || 0)
        );
        const stockBajoCount = stockBajo.length;

        const equiposPorTipo = {};
        stockEquipos.forEach(equipo => {
            const tipoNombre = equipo.tipo_equipo?.nombre || 'Sin tipo';
            if (!equiposPorTipo[tipoNombre]) {
                equiposPorTipo[tipoNombre] = 0;
            }
            equiposPorTipo[tipoNombre] += equipo.cantidad_total || 0;
        });

        const stockEquiposConValorTotal = stockEquipos.map(equipo => ({
            ...equipo,
            valor_total: (equipo.valor_adquisicion || 0) * (equipo.cantidad_total || 0)
        }));

        const data = {
            stockEquipos: stockEquiposConValorTotal, 
            fechaGeneracion: new Date().toLocaleString('es-ES'),
            totalEquipos: totalEquipos,
            totalDisponible: totalDisponible,
            totalAsignado: totalAsignado,
            valorTotal: valorTotal,
            stockBajoCount: stockBajoCount,
            equiposPorTipo: equiposPorTipo
        };

        const htmlContent = await renderTemplate(req.app, 'pdfs/stock', data);
        const pdfBuffer = await PuppeteerPDF.generatePDF(htmlContent, {
            format: 'Letter',
            landscape: true
        });

        console.log('=== PDF STOCK GENERADO EXITOSAMENTE ===');

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="reporte-stock.pdf"');
        res.setHeader('Content-Length', pdfBuffer.length);
        res.setHeader('Cache-Control', 'no-cache');

        res.end(pdfBuffer);

    } catch (error) {
        console.error('ERROR generando PDF de stock:', error);
        res.status(500).json({ 
            error: 'Error al generar el PDF: ' + error.message
        });
    }
  },

  async verPdfStock(req, res) {
    console.log('=== VER PDF STOCK INICIADO ===');
    
    try {
        const stockEquipos = await prisma.stock_equipos.findMany({
            include: {
                tipo_equipo: {
                    select: { nombre: true }
                }
            },
            orderBy: [
                { tipo_equipo_id: 'asc' },
                { marca: 'asc' }
            ]
        });

        const totalEquipos = stockEquipos.reduce((sum, equipo) => sum + (equipo.cantidad_total || 0), 0);
        const totalDisponible = stockEquipos.reduce((sum, equipo) => sum + (equipo.cantidad_disponible || 0), 0);
        const totalAsignado = stockEquipos.reduce((sum, equipo) => sum + (equipo.cantidad_asignada || 0), 0);
        
        const valorTotal = stockEquipos.reduce((sum, equipo) => {
            const valorUnitario = equipo.valor_adquisicion || 0;
            const cantidadTotal = equipo.cantidad_total || 0;
            return sum + (valorUnitario * cantidadTotal);
        }, 0);
        
        const stockBajo = stockEquipos.filter(equipo => 
            (equipo.cantidad_disponible || 0) <= (equipo.minimo_stock || 0)
        );
        const stockBajoCount = stockBajo.length;

        const equiposPorTipo = {};
        stockEquipos.forEach(equipo => {
            const tipoNombre = equipo.tipo_equipo?.nombre || 'Sin tipo';
            if (!equiposPorTipo[tipoNombre]) {
                equiposPorTipo[tipoNombre] = 0;
            }
            equiposPorTipo[tipoNombre] += equipo.cantidad_total || 0;
        });

        const stockEquiposConValorTotal = stockEquipos.map(equipo => ({
            ...equipo,
            valor_total: (equipo.valor_adquisicion || 0) * (equipo.cantidad_total || 0)
        }));

        const data = {
            stockEquipos: stockEquiposConValorTotal,
            fechaGeneracion: new Date().toLocaleString('es-ES'),
            totalEquipos: totalEquipos,
            totalDisponible: totalDisponible,
            totalAsignado: totalAsignado,
            valorTotal: valorTotal,
            stockBajoCount: stockBajoCount,
            equiposPorTipo: equiposPorTipo
        };

        const htmlContent = await renderTemplate(req.app, 'pdfs/stock', data);
        const pdfBuffer = await PuppeteerPDF.generatePDF(htmlContent, {
            format: 'Letter',
            landscape: true
        });

        console.log('=== VER PDF STOCK GENERADO EXITOSAMENTE ===');
        console.log('💰 Valor total del inventario calculado:', valorTotal);

        if (res.headersSent) return;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="reporte-stock.pdf"');
        res.setHeader('Content-Length', pdfBuffer.length);
        res.setHeader('Cache-Control', 'no-cache');

        res.end(pdfBuffer);

    } catch (error) {
        console.error('ERROR viendo PDF de stock:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Error al cargar el PDF: ' + error.message 
            });
        }
    }
  },

async equiposConsumibles(req, res) {
    try {
        console.log('🔍 Buscando equipos consumibles...');
        
        // Usa findMany, NO findUnique
        const todosEquipos = await prisma.stock_equipos.findMany({
            include: {
                tipo_equipo: {
                    select: {
                        id: true,
                        nombre: true
                    }
                }
            },
            orderBy: {
                marca: 'asc'
            }
        });

        console.log(`✅ ${todosEquipos.length} equipos totales encontrados`);
        
        // Filtrar por tipo consumible
        const equiposFiltrados = todosEquipos.filter(equipo => {
            if (!equipo.tipo_equipo || !equipo.tipo_equipo.nombre) {
                return false;
            }
            
            const tipoNombre = equipo.tipo_equipo.nombre.toLowerCase();
            return tipoNombre.includes('consumible') || 
                   tipoNombre.includes('toner') ||
                   tipoNombre.includes('cartucho') ||
                   tipoNombre.includes('tinta');
        });

        console.log(`🎯 ${equiposFiltrados.length} equipos son consumibles`);
        
        res.json(equiposFiltrados);
        
    } catch (error) {
        console.error('💥 ERROR en equiposConsumibles:', error);
        res.status(500).json({ 
            error: 'Error al cargar equipos consumibles',
            message: error.message
        });
    }
},

async equiposParaAsignacion(req, res) {
    try {
        console.log('🔍 Cargando equipos para asignación...');
        
        // Primero, obtener todos los equipos sin filtros complejos
        const todosEquipos = await prisma.stock_equipos.findMany({
            include: {
                tipo_equipo: {
                    select: {
                        id: true,
                        nombre: true,
                        requiere_ip: true,
                        requiere_cereal: true
                    }
                }
            },
            orderBy: { marca: 'asc' }
        });

        console.log(`📦 ${todosEquipos.length} equipos totales encontrados`);

        // Filtrar en JavaScript para evitar errores de Prisma
        const equiposFiltrados = todosEquipos.filter(equipo => {
            if (!equipo.tipo_equipo) {
                console.log(`⚠️ Equipo ${equipo.id} sin tipo_equipo, incluyendo por defecto`);
                return true; // Incluir equipos sin tipo
            }
            
            const tipoNombre = equipo.tipo_equipo.nombre.toLowerCase();
            const excluir = tipoNombre.includes('mikrotik') || 
                           tipoNombre.includes('impresora') ||
                           tipoNombre.includes('toner') ||
                           tipoNombre.includes('consumible');
            
            if (excluir) {
                console.log(`🚫 Excluyendo equipo: ${equipo.marca} ${equipo.modelo} (Tipo: ${tipoNombre})`);
                return false;
            }
            
            console.log(`✅ Incluyendo equipo: ${equipo.marca} ${equipo.modelo} (Tipo: ${tipoNombre})`);
            return true;
        });

        console.log(`🎯 ${equiposFiltrados.length} equipos filtrados para asignación`);
        
        res.json(equiposFiltrados);
        
    } catch (error) {
        console.error('💥 ERROR en equiposParaAsignacion:', error);
        res.status(500).json({ 
            error: 'Error al cargar equipos',
            message: error.message
        });
    }
},

async equiposImpresoras(req, res) {
    try {
        console.log('🔍 Buscando equipos de tipo impresora...');
        
        const todosEquipos = await prisma.stock_equipos.findMany({
            include: {
                tipo_equipo: {
                    select: {
                        id: true,
                        nombre: true,
                        requiere_ip: true,
                        requiere_cereal: true
                    }
                }
            },
            orderBy: {
                marca: 'asc'
            }
        });

        console.log(`✅ ${todosEquipos.length} equipos totales encontrados`);
        
        // Filtrar equipos de tipo impresora
        const equiposImpresoras = todosEquipos.filter(equipo => {
            if (!equipo.tipo_equipo || !equipo.tipo_equipo.nombre) {
                console.log(`⚠️ Equipo ${equipo.id} sin tipo_equipo, excluyendo`);
                return false;
            }
            
            const tipoNombre = equipo.tipo_equipo.nombre.toLowerCase();
            const esImpresora = tipoNombre.includes('impresora') || 
                               tipoNombre.includes('printer') ||
                               tipoNombre.includes('print');
            
            console.log(`🔍 ${equipo.marca} ${equipo.modelo}: "${tipoNombre}" -> ${esImpresora ? '✅ IMPRESORA' : '❌ NO'}`);
            return esImpresora;
        });

        console.log(`🎯 ${equiposImpresoras.length} equipos son impresoras`);
        
        res.json(equiposImpresoras);
        
    } catch (error) {
        console.error('ERROR en equiposImpresoras:', error);
        res.status(500).json({ 
            error: 'Error al cargar equipos impresoras',
            message: error.message
        });
    }
},

async equiposMikrotiks(req, res) {
    try {
        console.log('🔍 Buscando equipos de tipo mikrotik...');
        
        const todosEquipos = await prisma.stock_equipos.findMany({
            include: {
                tipo_equipo: {
                    select: {
                        id: true,
                        nombre: true,
                        requiere_ip: true,
                        requiere_cereal: true
                    }
                }
            },
            orderBy: {
                marca: 'asc'
            }
        });

        console.log(`✅ ${todosEquipos.length} equipos totales encontrados`);
        
        // Filtrar equipos de tipo mikrotik
        const equiposMikrotiks = todosEquipos.filter(equipo => {
            if (!equipo.tipo_equipo || !equipo.tipo_equipo.nombre) {
                console.log(`⚠️ Equipo ${equipo.id} sin tipo_equipo, excluyendo`);
                return false;
            }
            
            const tipoNombre = equipo.tipo_equipo.nombre.toLowerCase();
            const esMikrotik = tipoNombre.includes('mikrotik') || 
                              tipoNombre.includes('router') ||
                              tipoNombre.includes('switch');
            
            console.log(`🔍 ${equipo.marca} ${equipo.modelo}: "${tipoNombre}" -> ${esMikrotik ? '✅ MIKROTIK' : '❌ NO'}`);
            return esMikrotik;
        });

        console.log(`🎯 ${equiposMikrotiks.length} equipos son mikrotiks`);
        
        res.json(equiposMikrotiks);
        
    } catch (error) {
        console.error('ERROR en equiposMikrotiks:', error);
        res.status(500).json({ 
            error: 'Error al cargar equipos mikrotiks',
            message: error.message
        });
    }
}
};