import { PrismaClient } from '@prisma/client';
import PuppeteerPDF from '../services/puppeteerPDF.js'; 
import { renderTemplate } from '../helpers/renderHelper.js';

const prisma = new PrismaClient();

export const impresoraController = {

  async index(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const search = req.query.search || '';
      const sede_id = req.query.sede_id || '';
      const departamento_id = req.query.departamento_id || '';
      const estado = req.query.estado || '';

      let where = {};

      if (search) {
        where.OR = [
          { nombre: { contains: search, mode: 'insensitive' } },
          { descripcion: { contains: search, mode: 'insensitive' } },
          { ip_impresora: { contains: search, mode: 'insensitive' } },
          { cereal_impresora: { contains: search, mode: 'insensitive' } },
          { ubicacion: { contains: search, mode: 'insensitive' } },
          { toner: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (sede_id) {
        where.sede_id = parseInt(sede_id);
      }

      if (departamento_id) {
        where.departamento_id = parseInt(departamento_id);
      }

      if (estado) {
        where.estado_impresora = estado;
      }

      const totalRecords = await prisma.impresora.count({ where });

      const impresoras = await prisma.impresora.findMany({
        where,
        skip,
        take: limit,
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true,
          toner_actual: {
            include: {
              tipo_equipo: true
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      });

      const totalPages = Math.ceil(totalRecords / limit);

      res.json({
        impresoras: impresoras,
        pagination: {
          current: page,
          total: totalPages,
          totalRecords: totalRecords
        },
        filters: {
          search: search,
          sede_id: sede_id,
          departamento_id: departamento_id,
          estado: estado
        }
      });
    } catch (error) {
      console.error('Error en index impresoras:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async show(req, res) {
    try {
      const { id } = req.params;
      const impresoraId = parseInt(id);

      const impresora = await prisma.impresora.findUnique({
        where: { id: impresoraId },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true,
          toner_actual: {
            include: {
              tipo_equipo: true
            }
          }
        }
      });

      if (!impresora) {
        return res.status(404).json({ error: 'Impresora no encontrada' });
      }

      res.json(impresora);
    } catch (error) {
      console.error('Error en show impresora:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async store(req, res) {
    try {
      const {
        stock_equipos_id,
        nombre,
        descripcion,
        ip_impresora,
        cereal_impresora,
        sede_id,
        departamento_id,
        ubicacion,
        estado_impresora,
        toner 
      } = req.body;

      console.log('Datos recibidos para crear impresora:', req.body);

      const stockEquiposId = parseInt(stock_equipos_id);
      const sedeId = parseInt(sede_id);
      const departamentoId = parseInt(departamento_id);

      const impresoraStock = await prisma.stock_equipos.findUnique({
        where: { id: stockEquiposId },
        include: { tipo_equipo: true }
      });

      if (!impresoraStock) {
        return res.status(404).json({ error: 'Equipo no encontrado en inventario' });
      }

      if (impresoraStock.cantidad_disponible <= 0) {
        return res.status(400).json({ error: 'No hay stock disponible para este equipo' });
      }
          if (toner) {
      const tonerExistente = await prisma.stock_equipos.findFirst({
        where: {
          OR: [
            { modelo: { contains: toner, mode: 'insensitive' } },
            { 
              AND: [
                { marca: { contains: toner.split(' ')[0], mode: 'insensitive' } },
                { modelo: { contains: toner.split(' ').slice(1).join(' '), mode: 'insensitive' } }
              ]
            }
          ]
        }
      });

      if (!tonerExistente) {
        return res.status(400).json({ 
          error: 'El modelo de toner seleccionado no existe en el inventario' 
        });
      }
    }
      const resultado = await prisma.$transaction(async (tx) => {
        const impresora = await tx.impresora.create({
          data: {
            stock_equipos_id: stockEquiposId,
            nombre,
            descripcion,
            ip_impresora,
            cereal_impresora,
            sede_id: sedeId,
            departamento_id: departamentoId,
            ubicacion,
            toner, 
            estado_impresora: estado_impresora || 'activa',
            contador_impresiones: 0,
            contador_instalacion_toner: 0
          },
          include: {
            stock_equipos: {
              include: {
                tipo_equipo: true
              }
            },
            sede: true,
            departamento: true
          }
        });

        await tx.stock_equipos.update({
          where: { id: stockEquiposId },
          data: {
            cantidad_disponible: { decrement: 1 },
            cantidad_asignada: { increment: 1 }
          }
        });

        return impresora;
      });

      res.status(201).json({
        message: 'Impresora activada exitosamente',
        impresora: resultado
      });

    } catch (error) {
      console.error('Error en store impresora:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const {
        nombre,
        descripcion,
        ip_impresora,
        cereal_impresora,
        sede_id,
        departamento_id,
        ubicacion,
        estado_impresora,
        contador_impresiones,
        toner, 
        contador_instalacion_toner 
      } = req.body;

      const impresoraId = parseInt(id);
      const sedeId = sede_id ? parseInt(sede_id) : undefined;
      const departamentoId = departamento_id ? parseInt(departamento_id) : undefined;

      const impresoraActual = await prisma.impresora.findUnique({
        where: { id: impresoraId },
        include: {
          stock_equipos: true,
          toner_actual: true 
        }
      });

      if (!impresoraActual) {
        return res.status(404).json({ error: 'Impresora no encontrada' });
      }

      if (toner) {
        const tonerExistente = await prisma.stock_equipos.findFirst({
          where: {
            OR: [
              { modelo: { contains: toner, mode: 'insensitive' } },
              { 
                AND: [
                  { marca: { contains: toner.split(' ')[0], mode: 'insensitive' } },
                  { modelo: { contains: toner.split(' ').slice(1).join(' '), mode: 'insensitive' } }
                ]
              }
            ]
          }
        });

        if (!tonerExistente) {
          return res.status(400).json({ 
            error: 'El modelo de toner seleccionado no existe en el inventario' 
          });
        }
      }

      const resultado = await prisma.$transaction(async (tx) => {
        const contadorAnterior = impresoraActual.contador_instalacion_toner || 0;
        const contadorNuevo = parseInt(contador_instalacion_toner) || 0;
        
        console.log(`Cambio contador toner: ${contadorAnterior} -> ${contadorNuevo}`);

        if (contadorNuevo > contadorAnterior) {
          const diferencia = contadorNuevo - contadorAnterior;
          
          const tonerCompatible = await tx.stock_equipos.findFirst({
            where: {
              tipo_equipo: {
                nombre: {
                  contains: 'toner',
                  mode: 'insensitive'
                }
              },
              cantidad_disponible: {
                gt: 0
              }
            }
          });

          if (tonerCompatible) {
            console.log(`Restando ${diferencia} toner(s) del inventario`);
            
            await tx.stock_equipos.update({
              where: { id: tonerCompatible.id },
              data: {
                cantidad_disponible: { decrement: diferencia },
                cantidad_asignada: { increment: diferencia }
              }
            });

            if (!impresoraActual.toner_actual_id) {
              await tx.impresora.update({
                where: { id: impresoraId },
                data: {
                  toner_actual_id: tonerCompatible.id,
                  fecha_instalacion_toner: new Date()
                }
              });
            }
          } else {
            console.log('No hay toners disponibles en inventario');
          }
        }
        else if (contadorNuevo < contadorAnterior && impresoraActual.toner_actual_id) {
          const diferencia = contadorAnterior - contadorNuevo;
          
          console.log(`Devolviendo ${diferencia} toner(s) al inventario`);
          
          await tx.stock_equipos.update({
            where: { id: impresoraActual.toner_actual_id },
            data: {
              cantidad_disponible: { increment: diferencia },
              cantidad_asignada: { decrement: diferencia }
            }
          });
        }

        const estadoAnterior = impresoraActual.estado_impresora;
        const estadoNuevo = estado_impresora;
        const stockEquipoId = impresoraActual.stock_equipos_id;

        console.log(`Cambio de estado impresora: ${estadoAnterior} -> ${estadoNuevo}`);

        if (estadoAnterior !== estadoNuevo) {
          const stockActual = await tx.stock_equipos.findUnique({
            where: { id: stockEquipoId }
          });

          if (!stockActual) {
            throw new Error('Stock de equipo no encontrado');
          }

          if (estadoAnterior === 'activa' && (estadoNuevo === 'inactiva' || estadoNuevo === 'mantenimiento')) {
            console.log('Devolviendo impresora activa al inventario');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_disponible: { increment: 1 },
                cantidad_asignada: { decrement: 1 }
              }
            });
          }

          else if ((estadoAnterior === 'inactiva' || estadoAnterior === 'mantenimiento') && estadoNuevo === 'activa') {
            console.log('Asignando impresora desde inventario a activa');
            if (stockActual.cantidad_disponible <= 0) {
              throw new Error('No hay stock disponible para activar esta impresora');
            }
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_disponible: { decrement: 1 },
                cantidad_asignada: { increment: 1 }
              }
            });
          }

          else if (estadoAnterior === 'activa' && estadoNuevo === 'obsoleta') {
            console.log('Marcando impresora activa como obsoleta - reduciendo inventario');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_total: { decrement: 1 },
                cantidad_asignada: { decrement: 1 }
              }
            });
          }

          else if ((estadoAnterior === 'inactiva' || estadoAnterior === 'mantenimiento') && estadoNuevo === 'obsoleta') {
            console.log('Marcando impresora inactiva/mantenimiento como obsoleta - reduciendo inventario');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_total: { decrement: 1 },
                cantidad_disponible: { decrement: 1 }
              }
            });
          }

          else if (estadoAnterior === 'obsoleta' && estadoNuevo === 'activa') {
            console.log('Reactivar impresora desde obsoleta');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_total: { increment: 1 },
                cantidad_disponible: { decrement: 1 },
                cantidad_asignada: { increment: 1 }
              }
            });
          }

          else if (estadoAnterior === 'obsoleta' && (estadoNuevo === 'inactiva' || estadoNuevo === 'mantenimiento')) {
            console.log('Mover impresora de obsoleta a inventario disponible');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_total: { increment: 1 },
                cantidad_disponible: { increment: 1 }
              }
            });
          }

          else if (estadoNuevo === 'sin_toner' || estadoAnterior === 'sin_toner') {
            console.log('Cambio a/desde estado sin_toner - no afecta inventario de impresora');
          }

          console.log('Cambio de estado procesado exitosamente');
        } else {
          console.log('No hay cambio de estado, omitiendo actualización de stock');
        }

        const impresoraActualizada = await tx.impresora.update({
          where: { id: impresoraId },
          data: {
            nombre,
            descripcion,
            ip_impresora,
            cereal_impresora,
            sede_id: sedeId,
            departamento_id: departamentoId,
            ubicacion,
            toner, 
            contador_instalacion_toner: contadorNuevo, 
            estado_impresora: estadoNuevo,
            contador_impresiones: contador_impresiones ? parseInt(contador_impresiones) : undefined,
            updated_at: new Date()
          },
          include: {
            stock_equipos: {
              include: {
                tipo_equipo: true
              }
            },
            sede: true,
            departamento: true,
            toner_actual: {
              include: {
                tipo_equipo: true
              }
            }
          }
        });

        return impresoraActualizada;
      });

      res.json({
        message: 'Impresora actualizada exitosamente',
        impresora: resultado
      });

    } catch (error) {
      console.error('Error en update impresora:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async destroy(req, res) {
    try {
      const { id } = req.params;

      const impresora = await prisma.impresora.findUnique({
        where: { id: parseInt(id) },
        include: {
          stock_equipos: true
        }
      });

      if (!impresora) {
        return res.status(404).json({ error: 'Impresora no encontrada' });
      }

      await prisma.$transaction(async (tx) => {
        const stockEquipoId = impresora.stock_equipos_id;
        const estadoActual = impresora.estado_impresora;

        console.log(`Eliminando impresora con estado: ${estadoActual}`);

        if (estadoActual === 'activa') {
          console.log(`Devolviendo impresora activa al inventario`);
          
          await tx.stock_equipos.update({
            where: { id: stockEquipoId },
            data: {
              cantidad_disponible: { increment: 1 },
              cantidad_asignada: { decrement: 1 }
            }
          });
        } 
        else if (estadoActual === 'inactiva' || estadoActual === 'mantenimiento') {
          console.log(`Impresora ya estaba disponible, no se modifica inventario`);
        }
        
        await tx.impresora.delete({
          where: { id: parseInt(id) }
        });
      });

      res.json({ message: 'Impresora eliminada exitosamente' });

    } catch (error) {
      console.error('Error en destroy impresora:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async cambiarEstado(req, res) {
    try {
      const { id } = req.params;
      const { estado_impresora } = req.body;

      const estadosPermitidos = ['activa', 'inactiva', 'mantenimiento', 'sin_toner', 'obsoleta'];
      
      if (!estadosPermitidos.includes(estado_impresora)) {
        return res.status(400).json({ 
          error: 'Estado no válido', 
          estados_permitidos: estadosPermitidos 
        });
      }

      const impresora = await prisma.impresora.findUnique({
        where: { id: parseInt(id) },
        include: {
          stock_equipos: true
        }
      });

      if (!impresora) {
        return res.status(404).json({ error: 'Impresora no encontrada' });
      }

      const impresoraActualizada = await prisma.$transaction(async (tx) => {
        const estadoAnterior = impresora.estado_impresora;
        const estadoNuevo = estado_impresora;
        const stockEquipoId = impresora.stock_equipos_id;

        console.log(`Cambio de estado impresora: ${estadoAnterior} -> ${estadoNuevo}`);

        if (estadoAnterior !== estadoNuevo) {
          const stockActual = await tx.stock_equipos.findUnique({
            where: { id: stockEquipoId }
          });

          if (!stockActual) {
            throw new Error('Stock de equipo no encontrado');
          }

          if (estadoAnterior === 'activa' && (estadoNuevo === 'inactiva' || estadoNuevo === 'mantenimiento')) {
            console.log('Devolviendo impresora activa al inventario');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_disponible: { increment: 1 },
                cantidad_asignada: { decrement: 1 }
              }
            });
          }
          else if ((estadoAnterior === 'inactiva' || estadoAnterior === 'mantenimiento') && estadoNuevo === 'activa') {
            console.log('Asignando impresora desde inventario a activa');
            if (stockActual.cantidad_disponible <= 0) {
              throw new Error('No hay stock disponible para activar esta impresora');
            }
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_disponible: { decrement: 1 },
                cantidad_asignada: { increment: 1 }
              }
            });
          }
          else if (estadoAnterior === 'activa' && estadoNuevo === 'obsoleta') {
            console.log('Marcando impresora activa como obsoleta');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_total: { decrement: 1 },
                cantidad_asignada: { decrement: 1 }
              }
            });
          }
          else if ((estadoAnterior === 'inactiva' || estadoAnterior === 'mantenimiento') && estadoNuevo === 'obsoleta') {
            console.log('Marcando impresora inactiva/mantenimiento como obsoleta');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_total: { decrement: 1 },
                cantidad_disponible: { decrement: 1 }
              }
            });
          }
          else if (estadoAnterior === 'obsoleta' && estadoNuevo === 'activa') {
            console.log('Reactivar impresora desde obsoleta');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_total: { increment: 1 },
                cantidad_disponible: { decrement: 1 },
                cantidad_asignada: { increment: 1 }
              }
            });
          }
          else if (estadoAnterior === 'obsoleta' && (estadoNuevo === 'inactiva' || estadoNuevo === 'mantenimiento')) {
            console.log('Mover impresora de obsoleta a inventario disponible');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_total: { increment: 1 },
                cantidad_disponible: { increment: 1 }
              }
            });
          }
          else if (estadoNuevo === 'sin_toner' || estadoAnterior === 'sin_toner') {
            console.log('Cambio a/desde estado sin_toner - no afecta inventario');
          }
        }

        const impresoraActualizada = await tx.impresora.update({
          where: { id: parseInt(id) },
          data: { 
            estado_impresora: estadoNuevo,
            updated_at: new Date()
          },
          include: {
            stock_equipos: {
              include: {
                tipo_equipo: true
              }
            },
            sede: true,
            departamento: true,
            toner_actual: {
              include: {
                tipo_equipo: true
              }
            }
          }
        });

        return impresoraActualizada;
      });

      res.json({
        message: `Estado de la impresora cambiado a ${estado_impresora}`,
        impresora: impresoraActualizada
      });

    } catch (error) {
      console.error('Error en cambiarEstado impresora:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async instalarToner(req, res) {
    try {
      const { id } = req.params;
      const { toner_actual_id, toner } = req.body; 

      const impresoraId = parseInt(id);
      const tonerId = parseInt(toner_actual_id);

      const tonerStock = await prisma.stock_equipos.findUnique({
        where: { id: tonerId },
        include: { tipo_equipo: true }
      });

      if (!tonerStock) {
        return res.status(404).json({ error: 'Toner no encontrado en inventario' });
      }

      if (tonerStock.cantidad_disponible <= 0) {
        return res.status(400).json({ error: 'No hay stock disponible para este toner' });
      }

      const impresoraActual = await prisma.impresora.findUnique({
        where: { id: impresoraId }
      });

      const resultado = await prisma.$transaction(async (tx) => {
        const impresora = await tx.impresora.update({
          where: { id: impresoraId },
          data: {
            toner_actual_id: tonerId,
            toner, 
            fecha_instalacion_toner: new Date(),
            contador_instalacion_toner: {
              increment: 1
            }
          },
          include: {
            stock_equipos: {
              include: {
                tipo_equipo: true
              }
            },
            sede: true,
            departamento: true,
            toner_actual: {
              include: {
                tipo_equipo: true
              }
            }
          }
        });

        await tx.stock_equipos.update({
          where: { id: tonerId },
          data: {
            cantidad_disponible: { decrement: 1 },
            cantidad_asignada: { increment: 1 }
          }
        });

        return impresora;
      });

      res.json({
        message: 'Toner instalado exitosamente',
        impresora: resultado
      });

    } catch (error) {
      console.error('Error en instalarToner:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async actualizarContador(req, res) {
    try {
      const { id } = req.params;
      const { contador_impresiones } = req.body;

      const impresora = await prisma.impresora.update({
        where: { id: parseInt(id) },
        data: {
          contador_impresiones: parseInt(contador_impresiones),
          updated_at: new Date()
        },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true,
          toner_actual: {
            include: {
              tipo_equipo: true
            }
          }
        }
      });

      res.json({
        message: 'Contador de impresiones actualizado',
        impresora
      });

    } catch (error) {
      console.error('Error en actualizarContador:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async porSede(req, res) {
    try {
      const { sede_id } = req.params;

      const impresoras = await prisma.impresora.findMany({
        where: { sede_id: parseInt(sede_id) },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true,
          toner_actual: {
            include: {
              tipo_equipo: true
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      });

      res.json(impresoras);
    } catch (error) {
      console.error('Error en porSede impresoras:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async porEstado(req, res) {
    try {
      const { estado } = req.params;

      const estadosPermitidos = ['activa', 'inactiva', 'mantenimiento', 'sin_toner', 'obsoleta'];
      
      if (!estadosPermitidos.includes(estado)) {
        return res.status(400).json({ 
          error: 'Estado no válido', 
          estados_permitidos: estadosPermitidos 
        });
      }

      const impresoras = await prisma.impresora.findMany({
        where: { estado_impresora: estado },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true,
          toner_actual: {
            include: {
              tipo_equipo: true
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      });

      res.json(impresoras);
    } catch (error) {
      console.error('Error en porEstado impresoras:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async estadisticas(req, res) {
    try {
      const totalImpresoras = await prisma.impresora.count();
      
      const impresorasPorEstado = await prisma.impresora.groupBy({
        by: ['estado_impresora'],
        _count: {
          id: true
        }
      });

      const impresorasPorSede = await prisma.impresora.groupBy({
        by: ['sede_id'],
        _count: {
          id: true
        }
      });

      const sedes = await prisma.sedes.findMany({
        where: {
          id: {
            in: impresorasPorSede.map(item => item.sede_id)
          }
        }
      });

      const estadisticasPorSede = impresorasPorSede.map(item => {
        const sede = sedes.find(s => s.id === item.sede_id);
        return {
          sede_id: item.sede_id,
          sede_nombre: sede ? sede.nombre : 'Desconocida',
          cantidad: item._count.id
        };
      });

      const totalImpresiones = await prisma.impresora.aggregate({
        _sum: {
          contador_impresiones: true
        }
      });

      res.json({
        total_impresoras: totalImpresoras,
        total_impresiones: totalImpresiones._sum.contador_impresiones || 0,
        por_estado: impresorasPorEstado.map(item => ({
          estado: item.estado_impresora,
          cantidad: item._count.id
        })),
        por_sede: estadisticasPorSede
      });

    } catch (error) {
      console.error('Error en estadisticas impresoras:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async buscar(req, res) {
    try {
      const { q } = req.query;

      if (!q) {
        return res.status(400).json({ error: 'Término de búsqueda requerido' });
      }

      const impresoras = await prisma.impresora.findMany({
        where: {
          OR: [
            { nombre: { contains: q, mode: 'insensitive' } },
            { descripcion: { contains: q, mode: 'insensitive' } },
            { ip_impresora: { contains: q, mode: 'insensitive' } },
            { cereal_impresora: { contains: q, mode: 'insensitive' } },
            { ubicacion: { contains: q, mode: 'insensitive' } },
            { toner: { contains: q, mode: 'insensitive' } } 
          ]
        },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true,
          toner_actual: {
            include: {
              tipo_equipo: true
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      });

      res.json(impresoras);
    } catch (error) {
      console.error('Error en buscar impresoras:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async actualizarToner(req, res) {
    try {
      const { id } = req.params;
      const { toner } = req.body;

      const impresora = await prisma.impresora.update({
        where: { id: parseInt(id) },
        data: {
          toner,
          updated_at: new Date()
        },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true,
          toner_actual: {
            include: {
              tipo_equipo: true
            }
          }
        }
      });

      res.json({
        message: 'Toner actualizado exitosamente',
        impresora
      });

    } catch (error) {
      console.error('Error en actualizarToner:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async actualizarContadorToner(req, res) {
    try {
        const { id } = req.params;
        const { contador_instalacion_toner } = req.body;

        const impresora = await prisma.impresora.update({
            where: { id: parseInt(id) },
            data: {
                contador_instalacion_toner: parseInt(contador_instalacion_toner),
                updated_at: new Date()
            },
            include: {
                stock_equipos: {
                    include: {
                        tipo_equipo: true
                    }
                },
                sede: true,
                departamento: true,
                toner_actual: {
                    include: {
                        tipo_equipo: true
                    }
                }
            }
        });

        res.json({
            message: 'Contador de toner actualizado',
            impresora
        });

    } catch (error) {
        console.error('Error en actualizarContadorToner:', error);
        res.status(500).json({ error: error.message });
    }
  },

  async generarPDFGeneral(req, res) {
    try {
      console.log('Generando PDF general de impresoras...');
      
      const impresoras = await prisma.impresora.findMany({
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true,
          toner_actual: {
            include: {
              tipo_equipo: true
            }
          }
        },
        orderBy: [
          { sede_id: 'asc' },
          { nombre: 'asc' }
        ]
      });

      console.log(`${impresoras.length} impresoras encontradas`);

      const data = {
        titulo: 'Reporte General de Impresoras',
        fecha: new Date().toLocaleDateString('es-ES', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        total: impresoras.length,
        impresoras: impresoras,
        estadisticas: {
          activas: impresoras.filter(i => i.estado_impresora === 'activa').length,
          inactivas: impresoras.filter(i => i.estado_impresora === 'inactiva').length,
          mantenimiento: impresoras.filter(i => i.estado_impresora === 'mantenimiento').length,
          obsoletas: impresoras.filter(i => i.estado_impresora === 'obsoleta').length
        }
      };
      
      const html = await renderTemplate(req.app, 'pdfs/reporte-general-impresoras', data);
      
      console.log('Template renderizado exitosamente');
      console.log('Longitud del HTML:', html.length);

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
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="reporte-general-impresoras.pdf"',
        'Content-Length': pdfBuffer.length,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      
      console.log(`PDF general generado exitosamente - ${impresoras.length} impresoras`);

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

      console.log(`Generando PDF de impresoras para sede ID: ${sedeId}`);

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

      const impresoras = await prisma.impresora.findMany({
        where: { sede_id: sedeId },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true,
          departamento: true,
          toner_actual: {
            include: {
              tipo_equipo: true
            }
          }
        },
        orderBy: [
          { departamento_id: 'asc' },
          { nombre: 'asc' }
        ]
      });

      if (impresoras.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ 
          error: 'No se encontraron impresoras para esta sede' 
        }));
      }

      console.log(`${impresoras.length} impresoras encontradas en ${sede.nombre}`);

      const data = {
        titulo: `Reporte de Impresoras - ${sede.nombre}`,
        subtitulo: `Sede: ${sede.nombre}`,
        fecha: new Date().toLocaleDateString('es-ES', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        total: impresoras.length,
        impresoras: impresoras,
        sede: sede,
        estadisticas: {
          activas: impresoras.filter(i => i.estado_impresora === 'activa').length,
          inactivas: impresoras.filter(i => i.estado_impresora === 'inactiva').length,
          mantenimiento: impresoras.filter(i => i.estado_impresora === 'mantenimiento').length,
          obsoletas: impresoras.filter(i => i.estado_impresora === 'obsoleta').length
        }
      };

      const html = await renderTemplate(req.app, 'pdfs/reporte-impresoras-sede', data);
      
      console.log('Longitud del HTML:', html.length);

      console.log('Generando PDF para sede...');

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

      const filename = `reporte-${sede.nombre.replace(/\s+/g, '-')}.pdf`;
      
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
      console.error('Error generando PDF por sede:', error);

      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Error generando PDF', 
        detalles: error.message 
      }));
    }
  }
}



