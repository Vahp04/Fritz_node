import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import PuppeteerPDF from '../services/puppeteerPDF.js';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import { renderTemplate } from '../helpers/renderHelper.js';

export const stockEquiposController = {
  async index(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const { nombre, tipo, stock } = req.query;
        
        console.log('Filtros recibidos en stock:', { nombre, tipo, stock });

        let whereClause = {};

        if (nombre) {
            whereClause.OR = [
                { marca: { contains: nombre, mode: 'insensitive' } },
                { modelo: { contains: nombre, mode: 'insensitive' } },
                { descripcion: { contains: nombre, mode: 'insensitive' } }
            ];
        }

        if (tipo) {
            whereClause.tipo_equipo_id = parseInt(tipo);
        }

        if (stock) {
            if (stock === 'bajo') {
                whereClause.AND = [
                    ...(whereClause.AND || []),
                    { cantidad_disponible: { lte: 3 } },
                    { cantidad_disponible: { gt: 0 } }
                ];
            } else if (stock === 'critico') {
                whereClause.cantidad_disponible = 0;
            }
        }

        console.log('Where clause para stock:', JSON.stringify(whereClause, null, 2));

        const total = await prisma.stock_equipos.count({
            where: whereClause
        });

        console.log(`Total de equipos con filtros: ${total}`);

        let stockEquipos = [];
        if (total > 0) {
            stockEquipos = await prisma.stock_equipos.findMany({
                where: whereClause,
                skip,
                take: limit,
                include: {
                    tipo_equipo: true
                },
                orderBy: { id: 'asc' }
            });
        }

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
        console.error('ERROR en index stock:', error);
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
      console.error('ERROR en store stock:', error);
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
      console.error('ERROR en show stock:', error);
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
      console.error('ERROR en update stock:', error);
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
      console.error('ERROR en destroy stock:', error);
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
                OR: [
                    {
                        AND: [
                            { cantidad_disponible: { lte: 3 } },
                            { cantidad_disponible: { gt: 0 } }
                        ]
                    },
                    {
                        cantidad_disponible: 0
                    }
                ]
            }
        });

        console.log('Stock bajo count (corregido):', stockBajoCount);

        const resumen = {
            total_equipos: resultado._sum.cantidad_total || 0,
            total_disponible: resultado._sum.cantidad_disponible || 0,
            total_asignado: resultado._sum.cantidad_asignada || 0,
            stock_bajo_count: stockBajoCount, 
            valor_total: resultado._sum.valor_adquisicion || 0,
            total_items: resultado._count.id || 0
        };

        console.log('Resumen final (corregido):', resumen);

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
                        requiere_ip: true
                    }
                }
            }
        });

        console.log('Primer equipo sample:', stockEquipos[0] ? {
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
            lte: 5 
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

        // Crear documento PDF
        const doc = new PDFDocument({ 
            margin: 30,
            size: 'LETTER',
            layout: 'landscape'
        });

        if (res.headersSent) return;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="reporte-stock.pdf"');
        res.setHeader('Cache-Control', 'no-cache');

        // Pipe el PDF a la respuesta
        doc.pipe(res);

        // Función helper para formatear moneda
        const formatCurrency = (amount) => {
            return new Intl.NumberFormat('es-ES', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(amount || 0);
        };

        // Función helper para porcentajes
        const formatPercent = (value) => {
            return (value * 100).toFixed(1) + '%';
        };

        // ===== HEADER =====
        // Logo placeholder
        doc.fillColor('#DC2626')
           .rect(30, 30, 60, 40)
           .fill()
           .fillColor('white')
           .fontSize(10)
           .text('FRITZ C.A', 35, 45, { width: 50, align: 'center' });

        // Título
        doc.fillColor('#DC2626')
           .fontSize(20)
           .font('Helvetica-Bold')
           .text('Reporte de Stock de Equipos', 100, 35, {align:'center'});
        
        doc.fillColor('#666')
           .fontSize(12)
           .font('Helvetica')
           .text('Sistema de Gestión de Inventario', 100, 60, {align:'center'});

        doc.moveTo(30, 80)
           .lineTo(770, 80)
           .strokeColor('#DC2626')
           .lineWidth(2)
           .stroke();

        let yPosition = 100;

        // ===== INFORMACIÓN GENERAL =====
        doc.fillColor('#333')
           .fontSize(10)
           .font('Helvetica-Bold')
           .text('Fecha de generación:', 30, yPosition)
           .font('Helvetica')
           .text(data.fechaGeneracion, 200, yPosition, { align: 'right' });
        
        yPosition += 15;
        
        doc.font('Helvetica-Bold')
           .text('Total de equipos en inventario:', 30, yPosition)
           .font('Helvetica')
           .text(data.stockEquipos.length + ' tipos diferentes', 200, yPosition, { align: 'right' });

        yPosition += 25;

        // ===== ESTADÍSTICAS =====
        const stats = [
            { label: 'Total de Equipos', value: data.totalEquipos.toLocaleString() },
            { label: 'Disponibles', value: data.totalDisponible.toLocaleString() },
            { label: 'Asignados', value: data.totalAsignado.toLocaleString() },
            { label: 'Stock Bajo', value: data.stockBajoCount.toLocaleString() }
        ];

        const statWidth = 180;
        stats.forEach((stat, index) => {
            const x = 30 + (index * statWidth);
            
            doc.rect(x, yPosition, statWidth - 10, 40)
               .fillColor('#e9ecef')
               .fill();
            
            doc.fillColor('#DC2626')
               .fontSize(16)
               .font('Helvetica-Bold')
               .text(stat.value, x + 5, yPosition + 5, { width: statWidth - 20, align: 'center' });
            
            doc.fillColor('#666')
               .fontSize(9)
               .font('Helvetica')
               .text(stat.label, x + 5, yPosition + 25, { width: statWidth - 20, align: 'center' });
        });

        yPosition += 60;

        // ===== DISTRIBUCIÓN POR TIPO =====
        doc.rect(30, yPosition, 740, 60)
           .fillColor('#e9ecef')
           .fill();
        
        doc.fillColor('#333')
           .fontSize(11)
           .font('Helvetica-Bold')
           .text('Distribución por Tipo de Equipo', 35, yPosition + 8);

        let tipoY = yPosition + 25;
        let tipoX = 35;
        Object.entries(data.equiposPorTipo).forEach(([tipo, cantidad]) => {
            if (tipoX > 600) {
                tipoX = 35;
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
               .text(tipo + ': ' + cantidad + ' equipos', tipoX + 8, tipoY + 2);
            
            tipoX += 190;
        });

        yPosition += 80;

        // ===== TABLA DE EQUIPOS =====
        if (data.stockEquipos.length > 0) {
            // Encabezados de tabla
            const headers = ['Tipo', 'Marca', 'Modelo', 'Total', 'Disp.', 'Asig.', 'Mín.', 'Estado', 'Valor Unit.'];
            const columnWidths = [80, 70, 80, 40, 40, 40, 40, 50, 70];
  

            let headerX = 100;
            doc.fontSize(8)
            .font('Helvetica-Bold')
            .fillColor('#ffffff');
            
            headers.forEach((header, index) => {
                doc.rect(headerX, yPosition, columnWidths[index], 20)
                   .fillColor('#DC2626')
                   .fill();
                
                doc.text(header, headerX + 5, yPosition + 7, { 
                    width: columnWidths[index] - 10, 
                    align: index >= 3 ? 'center' : 'left' 
                });
                
                headerX += columnWidths[index];
            });

            yPosition += 20;

            // Filas de datos
            data.stockEquipos.forEach((equipo, rowIndex) => {
                if (yPosition > 500) {
                    // Nueva página si nos quedamos sin espacio
                    doc.addPage();
                    yPosition = 50;
                }

                const esStockBajo = equipo.cantidad_disponible <= equipo.minimo_stock;
                const valorUnitario = equipo.valor_adquisicion || 0;
                
                if (esStockBajo) {
                    doc.rect(30, yPosition, 740, 15)
                       .fillColor('#fff3cd')
                       .fill();
                } else if (rowIndex % 2 === 0) {
                    doc.rect(30, yPosition, 740, 15)
                       .fillColor('#f8f9fa')
                       .fill();
                }

                let cellX = 100;
                const rowData = [
                    equipo.tipo_equipo?.nombre || 'N/A',
                    equipo.marca,
                    equipo.modelo,
                    equipo.cantidad_total?.toString() || '0',
                    equipo.cantidad_disponible?.toString() || '0',
                    equipo.cantidad_asignada?.toString() || '0',
                    equipo.minimo_stock?.toString() || '0',
                    getEstadoTexto(equipo),
                    '$' + formatCurrency(valorUnitario)
                ];

                doc.fillColor('#333')
                   .fontSize(8)
                   .font('Helvetica');

                rowData.forEach((cell, index) => {
                    const alignment = index >= 3 && index !== 8 ? 'center' : 
                                    index === 8 ? 'right' : 'left';
                    
                    doc.text(cell, cellX + 5, yPosition + 4, { 
                        width: columnWidths[index] - 10, 
                        align: alignment 
                    });
                    
                    cellX += columnWidths[index];
                });

                yPosition += 15;
            });

            yPosition += 20;

            // ===== RESUMEN FINANCIERO =====
            doc.rect(30, yPosition, 740, 80)
               .fillColor('#e9ecef')
               .fill();
            
            doc.fillColor('#333')
               .fontSize(11)
               .font('Helvetica-Bold')
               .text('Resumen Financiero del Inventario', 35, yPosition + 8);

            const tasaAsignacion = data.totalEquipos > 0 ? 
                (data.totalAsignado / data.totalEquipos) : 0;
            const valorPromedio = data.totalEquipos > 0 ? 
                (data.valorTotal / data.totalEquipos) : 0;

            const summaryData = [
                { label: 'Valor total del inventario:', value: '$' + formatCurrency(data.valorTotal), highlight: true },
                { label: 'Total de equipos en inventario:', value: data.totalEquipos.toLocaleString() + ' unidades' },
                { label: 'Equipos con stock bajo:', value: data.stockBajoCount.toString() },
                { label: 'Tasa de asignación:', value: formatPercent(tasaAsignacion) },
                { label: 'Valor promedio por equipo:', value: '$' + formatCurrency(valorPromedio) }
            ];

            let summaryY = yPosition + 25;
            summaryData.forEach(item => {
                doc.font('Helvetica-Bold')
                   .text(item.label, 35, summaryY);
                
                if (item.highlight) {
                    doc.fillColor('#DC2626')
                       .fontSize(12);
                } else {
                    doc.fillColor('#333')
                       .fontSize(10);
                }
                
                doc.text(item.value, 300, summaryY, { align: 'right' });
                
                if (item.highlight) {
                    doc.fillColor('#333')
                       .fontSize(10);
                }
                
                summaryY += 12;
            });
        } else {
            doc.fillColor('#666')
               .fontSize(14)
               .text('No hay equipos en stock', 30, yPosition, { align: 'center' });
        }

        // ===== FOOTER =====
        const footerY = 550;
        doc.moveTo(30, footerY)
           .lineTo(770, footerY)
           .strokeColor('#ddd')
           .lineWidth(1)
           .stroke();
        
        doc.fillColor('#666')
           .fontSize(9)
           .text('Sistema de Gestión - FRITZ C.A', 30, footerY + 8, { align: 'left' })
           .text('Generado el ' + data.fechaGeneracion, 30, footerY + 8, { align: 'right' });

        // Función helper para estado
        function getEstadoTexto(equipo) {
            const disponible = equipo.cantidad_disponible || 0;
            const minimo = equipo.minimo_stock || 0;
            
            if (disponible === 0) return 'Agotado';
            if (disponible <= minimo) return 'Bajo';
            return 'OK';
        }

        doc.end();

        console.log('=== VER PDF STOCK GENERADO EXITOSAMENTE ===');
        console.log('Valor total del inventario calculado:', data.valorTotal);

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
        console.log('Buscando equipos consumibles...');

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

        console.log(`${todosEquipos.length} equipos totales encontrados`);
 
        const equiposFiltrados = todosEquipos.filter(equipo => {
            if (!equipo.tipo_equipo || !equipo.tipo_equipo.nombre) {
                return false;
            }
            
            const tipoNombre = equipo.tipo_equipo.nombre.toLowerCase();
            return tipoNombre.includes('consumible') || 
                   tipoNombre.includes('toner') ||
                   tipoNombre.includes('cartucho') ||
                   tipoNombre.includes('baterías') ||
                   tipoNombre.includes('baterias') ||
                   tipoNombre.includes('ups') ||
                   tipoNombre.includes('tinta');
        });
        
        res.json(equiposFiltrados);
        
    } catch (error) {
        console.error('ERROR en equiposConsumibles:', error);
        res.status(500).json({ 
            error: 'Error al cargar equipos consumibles',
            message: error.message
        });
    }
},

async equiposParaAsignacion(req, res) {
    try {
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

        console.log(`${todosEquipos.length} equipos totales encontrados`);

        const equiposFiltrados = todosEquipos.filter(equipo => {
            if (!equipo.tipo_equipo) {
                console.log(`Equipo ${equipo.id} sin tipo_equipo, incluyendo por defecto`);
                return true; 
            }
            
            const tipoNombre = equipo.tipo_equipo.nombre.toLowerCase();
            const excluir = tipoNombre.includes('mikrotik') || 
                           tipoNombre.includes('impresora') ||
                           tipoNombre.includes('toner') ||
                           tipoNombre.includes('tinta') ||
                           tipoNombre.includes('cartucho') ||
                           tipoNombre.includes('telefono') ||
                           tipoNombre.includes('celular') ||
                           tipoNombre.includes('movil') ||
                           tipoNombre.includes('servidor') ||
                           tipoNombre.includes('hotspot') ||
                           tipoNombre.includes('toner') ||
                           tipoNombre.includes('servidores') ||
                           tipoNombre.includes('dvr') ||
                           tipoNombre.includes('DVR') ||
                           tipoNombre.includes('camara') ||
                           tipoNombre.includes('switch') ||
                           tipoNombre.includes('teléfono') ||
                           tipoNombre.includes('móvil') ||
                           tipoNombre.includes('batería')||
                           tipoNombre.includes('consumible');
            
            if (excluir) {
                console.log(`Excluyendo equipo: ${equipo.marca} ${equipo.modelo} (Tipo: ${tipoNombre})`);
                return false;
            }
            
            console.log(`Incluyendo equipo: ${equipo.marca} ${equipo.modelo} (Tipo: ${tipoNombre})`);
            return true;
        });

        console.log(`${equiposFiltrados.length} equipos filtrados para asignación`);
        
        res.json(equiposFiltrados);
        
    } catch (error) {
        console.error('ERROR en equiposParaAsignacion:', error);
        res.status(500).json({ 
            error: 'Error al cargar equipos',
            message: error.message
        });
    }
},

async equiposImpresoras(req, res) {
    try {
        console.log('Buscando equipos de tipo impresora...');
        
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

        console.log(`${todosEquipos.length} equipos totales encontrados`);
        
        const equiposImpresoras = todosEquipos.filter(equipo => {
            if (!equipo.tipo_equipo || !equipo.tipo_equipo.nombre) {
                console.log(`Equipo ${equipo.id} sin tipo_equipo, excluyendo`);
                return false;
            }
            
            const tipoNombre = equipo.tipo_equipo.nombre.toLowerCase();
            const esImpresora = tipoNombre.includes('impresora') || 
                               tipoNombre.includes('printer') ||
                               tipoNombre.includes('print');
            
            console.log(`${equipo.marca} ${equipo.modelo}: "${tipoNombre}" -> ${esImpresora ? 'IMPRESORA' : 'NO'}`);
            return esImpresora;
        });

        console.log(`${equiposImpresoras.length} equipos son impresoras`);
        
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

        console.log(`${todosEquipos.length} equipos totales encontrados`);

        const equiposMikrotiks = todosEquipos.filter(equipo => {
            if (!equipo.tipo_equipo || !equipo.tipo_equipo.nombre) {
                console.log(`Equipo ${equipo.id} sin tipo_equipo, excluyendo`);
                return false;
            }
            
            const tipoNombre = equipo.tipo_equipo.nombre.toLowerCase();
            const esMikrotik = tipoNombre.includes('mikrotik') || 
                              tipoNombre.includes('hotspot') ||
                              tipoNombre.includes('switch');
            
            return esMikrotik;
        });

        
        res.json(equiposMikrotiks);
        
    } catch (error) {
        console.error('ERROR en equiposMikrotiks:', error);
        res.status(500).json({ 
            error: 'Error al cargar equipos mikrotiks',
            message: error.message
        });
    }
},

async todosLosToners(req, res) {
  try {
    console.log('Buscando TODOS los toners del inventario...');
    
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

    console.log(`${todosEquipos.length} equipos totales encontrados`);

    const toners = todosEquipos.filter(equipo => {
      if (!equipo.tipo_equipo || !equipo.tipo_equipo.nombre) {
        return false;
      }
      
      const tipoNombre = equipo.tipo_equipo.nombre.toLowerCase();
      return tipoNombre.includes('toner') ||
             tipoNombre.includes('tinta') ||
             tipoNombre.includes('cartucho');
    });

    console.log(`${toners.length} toners encontrados (sin paginación)`);
    
    res.json(toners);
    
  } catch (error) {
    console.error('ERROR en todosLosToners:', error);
    res.status(500).json({ 
      error: 'Error al cargar todos los toners',
      message: error.message
    });
  }
},


async servidores(req, res) {
    try {
        console.log('Buscando servidores en el inventario...');
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

        console.log(`${todosEquipos.length} equipos totales encontrados`);

        const servidores = todosEquipos.filter(equipo => {
            if (!equipo.tipo_equipo || !equipo.tipo_equipo.nombre) {
                return false;
            }
            
            const tipoNombre = equipo.tipo_equipo.nombre.toLowerCase();
            return tipoNombre.includes('servidor') || 
                   tipoNombre.includes('servidores');
        });

        console.log(`${servidores.length} servidores filtrados`);
        
        res.json(servidores);
        
    } catch (error) {
        console.error('ERROR en servidores:', error);
        res.status(500).json({ 
            error: 'Error al cargar servidores del inventario',
            message: error.message
        });
    }
},

async getDvrs(req, res) {
  try {
    console.log('Buscando equipos DVR y cámaras...');
    
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

    console.log(`${todosEquipos.length} equipos totales encontrados`);

    const dvrs = todosEquipos.filter(equipo => {
      if (!equipo.tipo_equipo || !equipo.tipo_equipo.nombre) {
        return false;
      }
      
      const tipoNombre = equipo.tipo_equipo.nombre.toLowerCase();
      const equipoNombre = `${equipo.marca} ${equipo.modelo}`.toLowerCase();
      
      const esDvrOCamara = 
        tipoNombre.includes('dvr') || 
       
        tipoNombre.includes('cámara') ||
        tipoNombre.includes('camara') ||
       
        equipoNombre.includes('dvr');
      
      const disponible = equipo.cantidad_disponible > 0;
      
      return esDvrOCamara && disponible;
    });

    console.log(`${dvrs.length} equipos DVR/cámaras disponibles encontrados`);
    
    res.json(dvrs);
    
  } catch (error) {
    console.error('Error en getDvrs:', error);
    res.status(500).json({ 
      error: 'Error al cargar equipos DVR',
      message: error.message
    });
  }
},

async equiposDvr(req, res) {
  try {
    console.log('Buscando equipos DVR y cámaras SIN PAGINACIÓN...');
    
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

    console.log(`${todosEquipos.length} equipos totales encontrados`);

    const dvrs = todosEquipos.filter(equipo => {
      if (!equipo.tipo_equipo || !equipo.tipo_equipo.nombre) {
        return false;
      }
      
      const tipoNombre = equipo.tipo_equipo.nombre.toLowerCase();
      const equipoNombre = `${equipo.marca} ${equipo.modelo}`.toLowerCase();
      
      const esDvrOCamara = 
        tipoNombre.includes('dvr') || 
       
        tipoNombre.includes('cámara') ||
        tipoNombre.includes('camara');
        
        
      
      const disponible = equipo.cantidad_disponible > 0;
      
      if (esDvrOCamara) {
      }
      
      return esDvrOCamara && disponible;
    });

    console.log(`${dvrs.length} equipos DVR/cámaras disponibles encontrados`);
    
    res.json(dvrs);
    
  } catch (error) {
    console.error('Error en equiposDvr:', error);
    res.status(500).json({ 
      error: 'Error al cargar equipos DVR',
      message: error.message
    });
  }
},

async equiposParaTelefonosCompleto(req, res) {
  try {
    console.log('=== EQUIPOS PARA TELEFONOS COMPLETO (SIN PAGINACIÓN) ===');
    
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

    console.log(`${todosEquipos.length} equipos totales encontrados`);

    const equiposTelefonicos = todosEquipos.filter(equipo => {
      if (!equipo.tipo_equipo || !equipo.tipo_equipo.nombre) {
        return false;
      }
      
      const tipoNombre = equipo.tipo_equipo.nombre.toLowerCase();
      
      const esTelefono = 
        tipoNombre.includes('teléfono') ||
        tipoNombre.includes('telefono') ||
        tipoNombre.includes('celular') ||
        tipoNombre.includes('móvil') ||
        tipoNombre.includes('movil');

      return esTelefono && equipo.cantidad_disponible > 0;
    });

    console.log(`${equiposTelefonicos.length} equipos son teléfonos con stock disponible`);
    
    res.json(equiposTelefonicos);
    
  } catch (error) {
    console.error('ERROR en equiposParaTelefonosCompleto:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      message: error.message
    });
  }
},
};