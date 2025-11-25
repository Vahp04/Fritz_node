import { PrismaClient } from '@prisma/client';
import PuppeteerPDF from '../services/puppeteerPDF.js';
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

      const data = {
        titulo: 'Orden de Salida',
        fecha: new Date().toLocaleDateString('es-ES', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }),
        consumible: consumible,
        sedeOrigen: sedeOrigen,
        sedeDestino: consumible.sede, 
        equipos: consumible.consumible_equipos,
        totalUnidades: consumible.consumible_equipos.reduce((sum, ce) => sum + ce.cantidad, 0)
      };

      

      console.log(' Renderizando template de orden de salida...');
    
      const html = await renderTemplate(req.app, 'pdfs/orden-salida-consumible', data);
      
      console.log('Template renderizado exitosamente');
      console.log('Longitud del HTML:', html.length);

      console.log(' Generando PDF...');
      
      const pdfOptions = {
        format: 'Letter',
        landscape: true,
        printBackground: true,
        margin: {
          top: '10mm',
          right: '10mm',
          bottom: '10mm',
          left: '10mm'
        }
      };

      const pdfBuffer = await PuppeteerPDF.generatePDF(html, pdfOptions);
      
      console.log('PDF generado exitosamente');
      console.log('Tamaño del buffer PDF:', pdfBuffer.length);

      const filename = `orden-salida-${consumible.nombre.replace(/\s+/g, '-')}.pdf`;
      
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': pdfBuffer.length,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });

      console.log(`Enviando PDF para abrir en navegador`);

      res.end(pdfBuffer);

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