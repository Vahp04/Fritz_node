import { PrismaClient } from '@prisma/client';
import PuppeteerPDF from '../services/puppeteerPDF.js';
import PDFDocument from 'pdfkit';
import { renderTemplate } from '../helpers/renderHelper.js';

const prisma = new PrismaClient();

export const consumibleController = {

   async index(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
    
  const {search, sede_id, departamento_id} = req.query;
        let where = {};

      if (search) {
        where.OR = [
          { nombre: { contains: search, mode: 'insensitive' } },
          { detalles: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (sede_id) {
        where.sede_id = parseInt(sede_id);
      }

      if (departamento_id) {
        where.departamento_id = parseInt(departamento_id);
      }

      const totalRecords = await prisma.consumible.count({ where });

      const consumibles = await prisma.consumible.findMany({
        where,
        skip,
        take: limit,
        include: {
          consumible_equipos: {
            include: {
              stock_equipos: {
                include: {
                  tipo_equipo: true
                }
              }
            }
          },
          sede: true,
          departamento: true
        },
        orderBy: {
          id: 'asc'
        }
      });

      const totalPages = Math.ceil(totalRecords / limit);

      res.json({
        consumibles: consumibles,
        pagination: {
          current: page,
          total: totalPages,
          totalRecords: totalRecords
        },
        filters: {
          search: search,
          sede_id: sede_id,
          departamento_id: departamento_id
        }
      });
    } catch (error) {
      console.error('Error en index consumibles:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async show(req, res) {
    try {
      const { id } = req.params;
      const consumibleId = parseInt(id);

      const consumible = await prisma.consumible.findUnique({
        where: { id: consumibleId },
        include: {
          consumible_equipos: {
            include: {
              stock_equipos: {
                include: {
                  tipo_equipo: true
                }
              }
            }
          },
          sede: true,
          departamento: true
        }
      });

      if (!consumible) {
        return res.status(404).json({ error: 'Consumible no encontrado' });
      }

      res.json(consumible);
    } catch (error) {
      console.error('Error en show consumible:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async store(req, res) {
    try {
      const {
        nombre,
        sede_id,
        departamento_id,
        fecha_enviado,
        detalles,
        equipos
      } = req.body;

      console.log('Datos recibidos para crear consumible:', req.body);

      const sedeId = parseInt(sede_id);
      const departamentoId = parseInt(departamento_id);

      if (!equipos || !Array.isArray(equipos) || equipos.length === 0) {
        return res.status(400).json({ error: 'Debe seleccionar al menos un equipo' });
      }

      const sede = await prisma.sedes.findUnique({
        where: { id: sedeId }
      });

      if (!sede) {
        return res.status(404).json({ error: 'Sede no encontrada' });
      }

      const departamento = await prisma.departamentos.findUnique({
        where: { id: departamentoId }
      });

      if (!departamento) {
        return res.status(404).json({ error: 'Departamento no encontrado' });
      }

      const resultado = await prisma.$transaction(async (tx) => {
        for (const equipo of equipos) {
          const stockEquiposId = parseInt(equipo.stock_equipos_id);
          const cantidadValue = parseInt(equipo.cantidad);

          const stockEquipo = await tx.stock_equipos.findUnique({
            where: { id: stockEquiposId }
          });

          if (!stockEquipo) {
            throw new Error(`Equipo con ID ${stockEquiposId} no encontrado en inventario`);
          }

          if (stockEquipo.cantidad_disponible < cantidadValue) {
            throw new Error(`Stock insuficiente para ${stockEquipo.marca} ${stockEquipo.modelo}. Disponible: ${stockEquipo.cantidad_disponible}, Solicitado: ${cantidadValue}`);
          }
        }

        const consumible = await tx.consumible.create({
          data: {
            nombre: nombre,
            sede_id: sedeId,
            departamento_id: departamentoId,
            fecha_enviado: new Date(fecha_enviado),
            detalles: detalles
          }
        });

        for (const equipo of equipos) {
          const stockEquiposId = parseInt(equipo.stock_equipos_id);
          const cantidadValue = parseInt(equipo.cantidad);

          await tx.consumibleEquipo.create({
            data: {
              consumible_id: consumible.id,
              stock_equipos_id: stockEquiposId,
              cantidad: cantidadValue
            }
          });

          await tx.stock_equipos.update({
            where: { id: stockEquiposId },
            data: {
              cantidad_disponible: { decrement: cantidadValue }
            }
          });
        }

        const consumibleCompleto = await tx.consumible.findUnique({
          where: { id: consumible.id },
          include: {
            consumible_equipos: {
              include: {
                stock_equipos: {
                  include: {
                    tipo_equipo: true
                  }
                }
              }
            },
            sede: true,
            departamento: true
          }
        });

        return consumibleCompleto;
      });

      res.status(201).json({
        message: `Consumible creado exitosamente con ${equipos.length} equipos`,
        consumible: resultado
      });

    } catch (error) {
      console.error('Error en store consumible:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const {
        nombre,
        sede_id,
        departamento_id,
        fecha_enviado,
        detalles,
        equipos
      } = req.body;

      const consumibleId = parseInt(id);
      const sedeId = sede_id ? parseInt(sede_id) : undefined;
      const departamentoId = departamento_id ? parseInt(departamento_id) : undefined;

      const consumibleActual = await prisma.consumible.findUnique({
        where: { id: consumibleId },
        include: {
          consumible_equipos: {
            include: {
              stock_equipos: true
            }
          }
        }
      });

      if (!consumibleActual) {
        return res.status(404).json({ error: 'Consumible no encontrado' });
      }

      const resultado = await prisma.$transaction(async (tx) => {
        if (equipos && Array.isArray(equipos)) {
          const equiposActualesMap = new Map();
          consumibleActual.consumible_equipos.forEach(ce => {
            equiposActualesMap.set(ce.stock_equipos_id, ce);
          });

          const equiposNuevosMap = new Map();
          equipos.forEach(eq => {
            equiposNuevosMap.set(parseInt(eq.stock_equipos_id), {
              stock_equipos_id: parseInt(eq.stock_equipos_id),
              cantidad: parseInt(eq.cantidad)
            });
          });

          for (const [stockEquiposId, equipoActual] of equiposActualesMap) {
            if (!equiposNuevosMap.has(stockEquiposId)) {
              await tx.stock_equipos.update({
                where: { id: stockEquiposId },
                data: {
                  cantidad_disponible: { increment: equipoActual.cantidad }
                }
              });

              await tx.consumibleEquipo.deleteMany({
                where: {
                  consumible_id: consumibleId,
                  stock_equipos_id: stockEquiposId
                }
              });
            }
          }

          for (const [stockEquiposId, equipoNuevo] of equiposNuevosMap) {
            const equipoActual = equiposActualesMap.get(stockEquiposId);
            const cantidadNueva = equipoNuevo.cantidad;

            const stockEquipo = await tx.stock_equipos.findUnique({
              where: { id: stockEquiposId }
            });

            if (!stockEquipo) {
              throw new Error(`Equipo con ID ${stockEquiposId} no encontrado en inventario`);
            }

            if (equipoActual) {
              const cantidadAnterior = equipoActual.cantidad;
              
              if (cantidadNueva !== cantidadAnterior) {
                const diferencia = cantidadNueva - cantidadAnterior;
                
                if (diferencia > 0) {
                  if (stockEquipo.cantidad_disponible < diferencia) {
                    throw new Error(`Stock insuficiente para ${stockEquipo.marca} ${stockEquipo.modelo}. Disponible: ${stockEquipo.cantidad_disponible}, Necesario: ${diferencia}`);
                  }
                  
                  await tx.stock_equipos.update({
                    where: { id: stockEquiposId },
                    data: {
                      cantidad_disponible: { decrement: diferencia }
                    }
                  });
                } else {
                  const diferenciaAbs = Math.abs(diferencia);
                  await tx.stock_equipos.update({
                    where: { id: stockEquiposId },
                    data: {
                      cantidad_disponible: { increment: diferenciaAbs }
                    }
                  });
                }

                await tx.consumibleEquipo.updateMany({
                  where: {
                    consumible_id: consumibleId,
                    stock_equipos_id: stockEquiposId
                  },
                  data: {
                    cantidad: cantidadNueva
                  }
                });
              }
            } else {
              if (stockEquipo.cantidad_disponible < cantidadNueva) {
                throw new Error(`Stock insuficiente para ${stockEquipo.marca} ${stockEquipo.modelo}. Disponible: ${stockEquipo.cantidad_disponible}, Solicitado: ${cantidadNueva}`);
              }

              await tx.consumibleEquipo.create({
                data: {
                  consumible_id: consumibleId,
                  stock_equipos_id: stockEquiposId,
                  cantidad: cantidadNueva
                }
              });

              await tx.stock_equipos.update({
                where: { id: stockEquiposId },
                data: {
                  cantidad_disponible: { decrement: cantidadNueva }
                }
              });
            }
          }
        }

        const consumibleActualizado = await tx.consumible.update({
          where: { id: consumibleId },
          data: {
            nombre,
            sede_id: sedeId,
            departamento_id: departamentoId,
            fecha_enviado: fecha_enviado ? new Date(fecha_enviado) : undefined,
            detalles,
            updated_at: new Date()
          },
          include: {
            consumible_equipos: {
              include: {
                stock_equipos: {
                  include: {
                    tipo_equipo: true
                  }
                }
              }
            },
            sede: true,
            departamento: true
          }
        });

        return consumibleActualizado;
      });

      res.json({
        message: 'Consumible actualizado exitosamente',
        consumible: resultado
      });

    } catch (error) {
      console.error('Error en update consumible:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async destroy(req, res) {
    try {
      const { id } = req.params;

      const consumible = await prisma.consumible.findUnique({
        where: { id: parseInt(id) },
        include: {
          consumible_equipos: true
        }
      });

      if (!consumible) {
        return res.status(404).json({ error: 'Consumible no encontrado' });
      }

      await prisma.$transaction(async (tx) => {
        /* Devolver todo el stock de los equipos
        for (const equipo of consumible.consumible_equipos) {
          await tx.stock_equipos.update({
            where: { id: equipo.stock_equipos_id },
            data: {
              cantidad_disponible: { increment: equipo.cantidad }
            }
          });
        }*/

        await tx.consumible.delete({
          where: { id: parseInt(id) }
        });
      });

      res.json({ message: 'Consumible eliminado exitosamente' });

    } catch (error) {
      console.error('Error en destroy consumible:', error);
      res.status(500).json({ error: error.message });
    }
  },
  async porSede(req, res) {
    try {
      const { sede_id } = req.params;

      const consumibles = await prisma.consumible.findMany({
        where: { sede_id: parseInt(sede_id) },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true
        },
        orderBy: {
          id: 'asc'
        }
      });

      res.json(consumibles);
    } catch (error) {
      console.error('Error en porSede consumibles:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async porDepartamento(req, res) {
    try {
      const { departamento_id } = req.params;

      const consumibles = await prisma.consumible.findMany({
        where: { departamento_id: parseInt(departamento_id) },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true
        },
        orderBy: {
          id: 'asc'
        }
      });

      res.json(consumibles);
    } catch (error) {
      console.error('Error en porDepartamento consumibles:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async buscar(req, res) {
    try {
      const { q } = req.query;

      if (!q) {
        return res.status(400).json({ error: 'Término de búsqueda requerido' });
      }

      const consumibles = await prisma.consumible.findMany({
        where: {
          OR: [
            { nombre: { contains: q, mode: 'insensitive' } },
            { detalles: { contains: q, mode: 'insensitive' } }
          ]
        },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true
        },
        orderBy: {
          id: 'asc'
        }
      });

      res.json(consumibles);
    } catch (error) {
      console.error('Error en buscar consumibles:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async estadisticas(req, res) {
    try {
      const totalConsumibles = await prisma.consumible.count();
      
      const consumiblesPorSede = await prisma.consumible.groupBy({
        by: ['sede_id'],
        _count: {
          id: true
        },
        _sum: {
          cantidad: true
        }
      });

      const consumiblesPorDepartamento = await prisma.consumible.groupBy({
        by: ['departamento_id'],
        _count: {
          id: true
        },
        _sum: {
          cantidad: true
        }
      });

      const sedes = await prisma.sedes.findMany({
        select: { id: true, nombre: true }
      });

      const departamentos = await prisma.departamentos.findMany({
        select: { id: true, nombre: true }
      });

      const totalUnidades = await prisma.consumible.aggregate({
        _sum: {
          cantidad: true
        }
      });

      res.json({
        total_consumibles: totalConsumibles,
        total_unidades: totalUnidades._sum.cantidad || 0,
        por_sede: consumiblesPorSede.map(item => ({
          sede_id: item.sede_id,
          sede_nombre: sedes.find(s => s.id === item.sede_id)?.nombre || 'Desconocida',
          cantidad_consumibles: item._count.id,
          total_unidades: item._sum.cantidad
        })),
        por_departamento: consumiblesPorDepartamento.map(item => ({
          departamento_id: item.departamento_id,
          departamento_nombre: departamentos.find(d => d.id === item.departamento_id)?.nombre || 'Desconocido',
          cantidad_consumibles: item._count.id,
          total_unidades: item._sum.cantidad
        }))
      });

    } catch (error) {
      console.error('Error en estadisticas consumibles:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async consumiblesRecientes(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 10;

      const consumibles = await prisma.consumible.findMany({
        take: limit,
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true
        },
        orderBy: {
          created_at: 'desc'
        }
      });

      res.json(consumibles);
    } catch (error) {
      console.error('Error en consumiblesRecientes:', error);
      res.status(500).json({ error: error.message });
    }
  },

async generarPDFOrdenSalida(req, res) {
    try {
      const { consumible_id, sede_origen_id } = req.params;
      const consumibleId = parseInt(consumible_id);
      const sedeOrigenId = parseInt(sede_origen_id);

      console.log(`Generando PDF de Orden de Salida para consumible ID: ${consumibleId}, sede origen: ${sedeOrigenId}`);

      if (isNaN(consumibleId) || consumibleId <= 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'ID de consumible no válido' }));
      }

      if (isNaN(sedeOrigenId) || sedeOrigenId <= 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'ID de sede origen no válido' }));
      }

      const consumible = await prisma.consumible.findUnique({
        where: { id: consumibleId },
        include: {
          consumible_equipos: {
            include: {
              stock_equipos: {
                include: {
                  tipo_equipo: true
                }
              }
            }
          },
          sede: true, 
          departamento: true
        }
      });

      if (!consumible) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Consumible no encontrado' }));
      }

      const sedeOrigen = await prisma.sedes.findUnique({
        where: { id: sedeOrigenId }
      });

      if (!sedeOrigen) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Sede origen no encontrada' }));
      }

      const fecha = new Date().toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });

      const data = {
        titulo: 'Orden de Salida de Equipos',
        fecha: fecha,
        consumible: consumible,
        sedeOrigen: sedeOrigen,
        sedeDestino: consumible.sede, 
        equipos: consumible.consumible_equipos,
        totalUnidades: consumible.consumible_equipos.reduce((sum, ce) => sum + ce.cantidad, 0)
      };

      console.log('Generando PDF con PDFKit...');

      // Crear documento PDF
      const doc = new PDFDocument({ 
        margin: 20,
        size: 'LETTER',
        layout: 'landscape' 
      });

      const filename = `orden-salida-${consumible.nombre.replace(/\s+/g, '-')}.pdf`;
      
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });

      // Pipe el PDF a la respuesta
      doc.pipe(res);

      // Dimensiones
      const margin = 20;
      let yPosition = margin;
      const pageWidth = doc.page.width - (margin * 2);
      const columnWidth = (pageWidth - 15) / 2; // 15px de separación entre columnas

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

      // Información de la orden - Columna 1
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
         .text('Información de la Orden', colX + 10, colY + 8);

      colY += 30;

      // Contenedor principal de información
      const infoHeight = 80;
      doc.rect(colX, colY, columnWidth, infoHeight)
         .fillColor('#f8f9fa')
         .fill();
      
      doc.rect(colX, colY, columnWidth, infoHeight)
         .strokeColor('#000000')
         .lineWidth(1)
         .stroke();

      let infoY = colY + 10;
      const infoItemHeight = 14;

      // Datos de la orden - Columna 1
      const orderInfo = [
          { label: 'Consumible:', value: data.consumible.nombre },
          { label: 'Sede Origen:', value: data.sedeOrigen.nombre },
          { label: 'Sede Destino:', value: data.sedeDestino?.nombre || 'No especificada' },
          { label: 'Departamento:', value: data.consumible.departamento?.nombre || 'No asignado' },
          { label: 'Total Unidades:', value: data.totalUnidades.toString() }
      ];

      orderInfo.forEach((info, index) => {
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
          if (index < orderInfo.length - 1) {
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

      // Descripción del traslado - Columna 1
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
         .text('Descripción del Traslado', colX + 10, colY + 8);

      colY += 30;

      doc.fontSize(9)
         .font('Helvetica')
         .fillColor('#333333')
         .text(`Por medio de la presente se hace constar la salida de equipos desde ${data.sedeOrigen.nombre} hacia ${data.sedeDestino?.nombre || 'la sede destino'}.`, 
               colX + 10, colY, { 
                 width: columnWidth - 20,
                 align: 'left'
               });

      colY += 25;

      // Detalle de equipos - Columna 1
      if (data.equipos && data.equipos.length > 0) {
          doc.fontSize(11)
             .font('Helvetica-Bold')
             .fillColor('#333333')
             .text('Detalle de Equipos a Trasladar', colX, colY);

          colY += 15;

          // Encabezados de tabla
          const headers = ['Equipo', 'Tipo', 'Cantidad'];
          const columnWidths = [
              columnWidth * 0.50,
              columnWidth * 0.30,
              columnWidth * 0.20
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
                 .fontSize(8);

              // Equipo
              const equipoTexto = `${equipo.stock_equipos.marca || 'N/A'} ${equipo.stock_equipos.modelo || ''}`;
              doc.text(equipoTexto, cellX + 2, colY + 4, { 
                  width: columnWidths[0] - 4 
              });
              cellX += columnWidths[0];

              // Tipo
              doc.text(equipo.stock_equipos.tipo_equipo.nombre || 'N/A', cellX + 2, colY + 4, { 
                  width: columnWidths[1] - 4 
              });
              cellX += columnWidths[1];

              // Cantidad
              doc.text(`${equipo.cantidad} unidades`, cellX + 2, colY + 4, { 
                  width: columnWidths[2] - 4 
              });

              colY += 15;
          });

          // Bordes de la tabla
          doc.rect(colX, colY - (data.equipos.length * 15), columnWidth, (data.equipos.length * 15) + 12)
             .strokeColor('#000')
             .lineWidth(0.5)
             .stroke();

          colY += 10;
      }

      // Observaciones - Columna 1
      doc.rect(colX, colY, columnWidth, 60)
         .fillColor('#e9ecef')
         .fill();
      
      doc.rect(colX, colY, 3, 60)
         .fillColor('#DC2626')
         .fill();

      doc.fillColor('#333333')
         .fontSize(10)
         .font('Helvetica-Bold')
         .text('Observaciones:', colX + 10, colY + 5);
          doc.text('Cualquier Novedad informar por la siguiente dirección de correo:', colX + 10, colY + 10);
      colY += 15;

      doc.fontSize(8)
         .font('Helvetica')
         .fillColor('#666666')
         

      colY += 12;

      doc.text('• JEFETIC@FRITZVE.COM O ANALISTATIC@FRITVE.COM', colX + 10, colY, { width: columnWidth - 15 });

      colY += 12;

      doc.text('• Para cualquier otra información llamar al 0424-5811864', colX + 10, colY, { width: columnWidth - 15 });

      colY += 30;

      // Firmas - Columna 1
      const firmaHeight = 65;
      const firmaWidth = (columnWidth - 20) / 2;

      // Firma T/C
      doc.rect(colX + 5, colY, firmaWidth, firmaHeight)
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
         .text('Firma T/C', colX + 5, colY + 45, {
           width: firmaWidth,
           align: 'center'
         });
      
      doc.fontSize(8)
         .font('Helvetica')
         .fillColor('#666666')
         .text('Responsable', colX + 5, colY + 55, {
           width: firmaWidth,
           align: 'center'
         });

      // Firma Impresor PCP
      doc.rect(colX + 10 + firmaWidth, colY, firmaWidth, firmaHeight)
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
         .text('Impresor PCP', colX + 10 + firmaWidth, colY + 45, {
           width: firmaWidth,
           align: 'center'
         });
      
      doc.fontSize(8)
         .font('Helvetica')
         .fillColor('#666666')
         .text('Salida', colX + 10 + firmaWidth, colY + 55, {
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

      // Información de la orden - Columna 2
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
         .text('Información de la Orden', colX + 10, colY + 8);

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

      // Datos de la orden - Columna 2 (mismos datos)
      orderInfo.forEach((info, index) => {
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
          if (index < orderInfo.length - 1) {
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

      // Descripción del traslado - Columna 2
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
         .text('Descripción del Traslado', colX + 10, colY + 8);

      colY += 30;

      doc.fontSize(9)
         .font('Helvetica')
         .fillColor('#333333')
         .text(`Por medio de la presente se hace constar la salida de equipos desde ${data.sedeOrigen.nombre} hacia ${data.sedeDestino?.nombre || 'la sede destino'}.`, 
               colX + 10, colY, { 
                 width: columnWidth - 20,
                 align: 'left'
               });

      colY += 25;

      // Detalle de equipos - Columna 2
      if (data.equipos && data.equipos.length > 0) {
          doc.fontSize(11)
             .font('Helvetica-Bold')
             .fillColor('#333333')
             .text('Detalle de Equipos a Trasladar', colX, colY);

          colY += 15;

          // Encabezados de tabla
          const headers = ['Equipo', 'Tipo', 'Cantidad'];
          const columnWidths = [
              columnWidth * 0.50,
              columnWidth * 0.30,
              columnWidth * 0.20
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
                 .fontSize(8);

              // Equipo
              const equipoTexto = `${equipo.stock_equipos.marca || 'N/A'} ${equipo.stock_equipos.modelo || ''}`;
              doc.text(equipoTexto, cellX + 2, colY + 4, { 
                  width: columnWidths[0] - 4 
              });
              cellX += columnWidths[0];

              // Tipo
              doc.text(equipo.stock_equipos.tipo_equipo.nombre || 'N/A', cellX + 2, colY + 4, { 
                  width: columnWidths[1] - 4 
              });
              cellX += columnWidths[1];

              // Cantidad
              doc.text(`${equipo.cantidad} unidades`, cellX + 2, colY + 4, { 
                  width: columnWidths[2] - 4 
              });

              colY += 15;
          });

          // Bordes de la tabla
          doc.rect(colX, colY - (data.equipos.length * 15), columnWidth, (data.equipos.length * 15) + 12)
             .strokeColor('#000')
             .lineWidth(0.5)
             .stroke();

          colY += 10;
      }

      // Observaciones - Columna 2
      doc.rect(colX, colY, columnWidth, 60)
         .fillColor('#e9ecef')
         .fill();
      
      doc.rect(colX, colY, 3, 60)
         .fillColor('#DC2626')
         .fill();

      doc.fillColor('#333333')
         .fontSize(10)
         .font('Helvetica-Bold')
         .text('Observaciones: Cualquier Novedad informar por la siguiente dirección de correo:', colX + 10, colY + 5);

      colY += 15;

      doc.fontSize(8)
         .font('Helvetica')
         .fillColor('#666666')

      colY += 12;

      doc.text('• JEFETIC@FRITZVE.COM O ANALISTATIC@FRITVE.COM', colX + 10, colY, { width: columnWidth - 15 });

      colY += 12;

      doc.text('• Para cualquier otra información llamar al 0424-5811864', colX + 10, colY, { width: columnWidth - 15 });

      colY += 30;

      // Firmas - Columna 2
      // Firma T/C
      doc.rect(colX + 5, colY, firmaWidth, firmaHeight)
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
         .text('Firma T/C', colX + 5, colY + 45, {
           width: firmaWidth,
           align: 'center'
         });
      
      doc.fontSize(8)
         .font('Helvetica')
         .fillColor('#666666')
         .text('Responsable', colX + 5, colY + 55, {
           width: firmaWidth,
           align: 'center'
         });

      // Firma Impresor PCP
      doc.rect(colX + 10 + firmaWidth, colY, firmaWidth, firmaHeight)
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
         .text('Impresor PCP', colX + 10 + firmaWidth, colY + 45, {
           width: firmaWidth,
           align: 'center'
         });
      
      doc.fontSize(8)
         .font('Helvetica')
         .fillColor('#666666')
         .text('Salida', colX + 10 + firmaWidth, colY + 55, {
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

      doc.end();

      console.log('PDF generado exitosamente con PDFKit');

    } catch (error) {
      console.error('Error generando PDF de orden de salida:', error);
      
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Error generando PDF', 
        detalles: error.message 
      }));
    }
  }

};