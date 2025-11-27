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

  
    const estadisticasGlobales = await prisma.impresora.groupBy({
      by: ['estado_impresora'],
      _count: {
        id: true
      },
      where: where 
    });

    
    const estadisticas = {
      total: totalRecords,
      activas: estadisticasGlobales.find(e => e.estado_impresora === 'activa')?._count.id || 0,
      inactivas: estadisticasGlobales.find(e => e.estado_impresora === 'inactiva')?._count.id || 0,
      mantenimiento: estadisticasGlobales.find(e => e.estado_impresora === 'mantenimiento')?._count.id || 0,
      obsoletas: estadisticasGlobales.find(e => e.estado_impresora === 'obsoleta')?._count.id || 0,
      sin_toner: estadisticasGlobales.find(e => e.estado_impresora === 'sin_toner')?._count.id || 0
    };

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
      },
      estadisticas: estadisticas 
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

          if (ip_impresora) {
      const ipExistente = await prisma.impresora.findFirst({
        where: { ip_impresora }
      });
      if (ipExistente) {
        return res.status(400).json({ error: 'La dirección IP ya está en uso por otra impresora' });
      }
    }

    if (cereal_impresora) {
      const cerealExistente = await prisma.impresora.findFirst({
        where: { cereal_impresora }
      });
      if (cerealExistente) {
        return res.status(400).json({ error: 'El número de serie ya está en uso por otra impresora' });
      }
    }

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
    if (error.code === 'P2002') {
      const campo = error.meta?.target?.[0];
      const mensajes = {
        ip_impresora: 'La dirección IP ya está en uso',
        cereal_impresora: 'El número de serie ya está en uso'
      };
      return res.status(400).json({ 
        error: mensajes[campo] || 'El valor ya existe en otro registro' 
      });
    }
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
        if (ip_impresora) {
      const ipExistente = await prisma.impresora.findFirst({
        where: {
          ip_impresora,
          id: { not: impresoraId }
        }
      });
      if (ipExistente) {
        return res.status(400).json({ error: 'La dirección IP ya está en uso por otra impresora' });
      }
    }

    if (cereal_impresora) {
      const cerealExistente = await prisma.impresora.findFirst({
        where: {
          cereal_impresora,
          id: { not: impresoraId }
        }
      });
      if (cerealExistente) {
        return res.status(400).json({ error: 'El número de serie ya está en uso por otra impresora' });
      }
    }
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
    if (error.code === 'P2002') {
      const campo = error.meta?.target?.[0];
      const mensajes = {
        ip_impresora: 'La dirección IP ya está en uso',
        cereal_impresora: 'El número de serie ya está en uso'
      };
      return res.status(400).json({ 
        error: mensajes[campo] || 'El valor ya existe en otro registro' 
      });
    }
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
    res.setHeader('Content-Disposition', 'inline; filename="reporte-general-impresoras.pdf"');
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
       .text('Reporte General de Impresoras', doc.page.margins.left, yPosition, { 
         align: 'center',
         width: pageWidth
       });
    
    yPosition += 20;
    
    doc.fontSize(10)
       .fillColor('#666666')
       .font('Helvetica')
       .text('Sistema de Gestión de Impresoras', doc.page.margins.left, yPosition, {
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
    const sedesUnicas = [...new Set(impresoras.map(i => i.sede_id).filter(Boolean))];

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
      activas: impresoras.filter(i => i.estado_impresora === 'activa').length,
      inactivas: impresoras.filter(i => i.estado_impresora === 'inactiva').length,
      mantenimiento: impresoras.filter(i => i.estado_impresora === 'mantenimiento').length,
      obsoletas: impresoras.filter(i => i.estado_impresora === 'obsoleta').length
    };

    const statWidth = (pageWidth - 20) / 5;
    const statHeight = 25;
    const statY = yPosition;

    const stats = [
      { label: 'TOTAL', value: impresoras.length, color: '#DC2626' },
      { label: 'ACTIVAS', value: estadisticas.activas, color: '#DC2626' },
      { label: 'INACTIVAS', value: estadisticas.inactivas, color: '#DC2626' },
      { label: 'MANTENIMIENTO', value: estadisticas.mantenimiento, color: '#DC2626' },
      { label: 'OBSOLETAS', value: estadisticas.obsoletas, color: '#DC2626' }
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
    if (impresoras.length > 0) {
      // Configuración de columnas para impresoras
      const columnWidths = {
        nombre: 80,
        equipo: 90,
        ip: 70,
        serial: 75,
        sede: 60,
        departamento: 80,
        toner: 80,
        ubicacion: 70,
        estado: 40
      };

      const totalTableWidth = Object.values(columnWidths).reduce((a, b) => a + b, 0);
      
      const headers = [
        { text: 'NOMBRE', width: columnWidths.nombre },
        { text: 'EQUIPO', width: columnWidths.equipo },
        { text: 'IP', width: columnWidths.ip },
        { text: 'SERIAL', width: columnWidths.serial },
        { text: 'SEDE', width: columnWidths.sede },
        { text: 'DEPARTAMENTO', width: columnWidths.departamento },
        { text: 'TONER', width: columnWidths.toner },
        { text: 'UBICACIÓN', width: columnWidths.ubicacion },
        { text: 'ESTADO', width: columnWidths.estado }
      ];

      let currentY = yPosition;

      // DIBUJAR ENCABEZADOS
      let currentX = doc.page.margins.left;
      
      headers.forEach(header => {
        doc.rect(currentX, currentY, header.width, 15)
           .fill('#DC2626');
        
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

      // Función para calcular líneas de texto
      const calcularLineasTexto = (texto, anchoMaximo, fontSize = 7) => {
        if (!texto) return 1;
        
        const palabras = texto.split(' ');
        let lineas = 1;
        let lineaActual = '';
        
        // Configurar fuente temporalmente para calcular
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
        
        // Restaurar tamaño de fuente
        doc.fontSize(tempSize);
        return lineas;
      };

      // CONTENIDO DE LA TABLA CON ALTURA DINÁMICA MEJORADA
      let currentSede = null;

      impresoras.forEach((impresora, index) => {
        // PRE-CALCULAR ALTURA PARA CADA CELDA
        const anchoNombre = columnWidths.nombre - 6;
        const anchoEquipo = columnWidths.equipo - 6;
        const anchoDepartamento = columnWidths.departamento - 6;
        const anchoToner = columnWidths.toner - 6;
        const anchoUbicacion = columnWidths.ubicacion - 6;
        
        // Textos
        const nombreText = impresora.nombre || 'Sin nombre';
        const equipoText = impresora.stock_equipos ? 
          `${impresora.stock_equipos.marca || ''} ${impresora.stock_equipos.modelo || ''}`.trim() + 
          (impresora.stock_equipos.tipo_equipo ? `\n${impresora.stock_equipos.tipo_equipo.nombre}` : '') 
          : 'No asignado';
        
        const departamentoText = impresora.departamento ? impresora.departamento.nombre : 'Sin departamento';
        const tonerText = impresora.toner_actual ? 
          `${impresora.toner_actual.marca || ''} ${impresora.toner_actual.modelo || ''}`.trim() 
          : 'Sin toner';
        const ubicacionText = impresora.ubicacion || '-';
        
        // Calcular líneas para cada columna
        const lineasNombre = calcularLineasTexto(nombreText, anchoNombre);
        const lineasEquipo = equipoText.split('\n').length;
        const lineasDepartamento = calcularLineasTexto(departamentoText, anchoDepartamento);
        const lineasToner = calcularLineasTexto(tonerText, anchoToner);
        const lineasUbicacion = calcularLineasTexto(ubicacionText, anchoUbicacion);
        
        // Encontrar el máximo de líneas
        const maxLines = Math.max(lineasNombre, lineasEquipo, lineasDepartamento, lineasToner, lineasUbicacion, 1);
        
        // Altura dinámica basada en el contenido
        const lineaBaseHeight = 10;
        const alturaPorLineaExtra = 8;
        const rowHeight = lineaBaseHeight + ((maxLines - 1) * alturaPorLineaExtra);

        // Verificar si necesitamos nueva página
        if (currentY + rowHeight > doc.page.height - doc.page.margins.bottom - 20) {
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
        if (currentSede !== impresora.sede_id && impresora.sede) {
          currentSede = impresora.sede_id;
          doc.fontSize(7)
             .fillColor('#333333')
             .font('Helvetica-Bold')
             .text(`SEDE: ${impresora.sede.nombre}`, doc.page.margins.left, currentY + 2);
          
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
        doc.fontSize(6)
           .fillColor('black')
           .font('Helvetica');

        // Altura disponible para texto
        const alturaTexto = rowHeight - 4;

        // Nombre (puede ser multilínea)
        const nombreFinalText = impresora.nombre || 'Sin nombre';
        doc.text(nombreFinalText, cellX + 3, currentY + 2, {
          width: anchoNombre,
          height: alturaTexto,
          lineGap: 1,
          align: 'left'
        });
        cellX += columnWidths.nombre;

        // Equipo/Modelo (multilínea)
        let equipoFinalText = 'No asignado';
        if (impresora.stock_equipos) {
          const marca = impresora.stock_equipos.marca || '';
          const modelo = impresora.stock_equipos.modelo || '';
          const tipo = impresora.stock_equipos.tipo_equipo ? impresora.stock_equipos.tipo_equipo.nombre : '';
          equipoFinalText = `${marca} ${modelo}`.trim();
          if (tipo) {
            equipoFinalText += `\n${tipo}`;
          }
        }
        doc.text(equipoFinalText, cellX + 3, currentY + 2, {
          width: anchoEquipo,
          height: alturaTexto,
          lineGap: 1,
          align: 'left'
        });
        cellX += columnWidths.equipo;

        // IP (una línea)
        const ipText = impresora.ip_impresora || '-';
        doc.text(ipText, cellX + 3, currentY + 2, {
          width: columnWidths.ip - 6,
          height: alturaTexto,
          align: 'left'
        });
        cellX += columnWidths.ip;

        // Serial (una línea)
        const serialText = impresora.cereal_impresora || '-';
        doc.text(serialText, cellX + 3, currentY + 2, {
          width: columnWidths.serial - 6,
          height: alturaTexto,
          align: 'left'
        });
        cellX += columnWidths.serial;

        // Sede (una línea)
        const sedeText = impresora.sede ? impresora.sede.nombre : 'Sin sede';
        doc.text(sedeText, cellX + 3, currentY + 2, {
          width: columnWidths.sede - 6,
          height: alturaTexto,
          align: 'left'
        });
        cellX += columnWidths.sede;

        // Departamento (puede ser multilínea)
        const departamentoFinalText = impresora.departamento ? impresora.departamento.nombre : 'Sin departamento';
        doc.text(departamentoFinalText, cellX + 3, currentY + 2, {
          width: anchoDepartamento,
          height: alturaTexto,
          lineGap: 1,
          align: 'left'
        });
        cellX += columnWidths.departamento;

        // Toner (puede ser multilínea)
        const tonerFinalText = impresora.toner_actual ? 
          `${impresora.toner_actual.marca || ''} ${impresora.toner_actual.modelo || ''}`.trim() 
          : 'Sin toner';
        doc.text(tonerFinalText, cellX + 3, currentY + 2, {
          width: anchoToner,
          height: alturaTexto,
          lineGap: 1,
          align: 'left'
        });
        cellX += columnWidths.toner;

        // Ubicación (puede ser multilínea)
        const ubicacionFinalText = impresora.ubicacion || '-';
        doc.text(ubicacionFinalText, cellX + 3, currentY + 2, {
          width: anchoUbicacion,
          height: alturaTexto,
          lineGap: 1,
          align: 'left'
        });
        cellX += columnWidths.ubicacion;

        // Estado (una línea)
        const estadoText = impresora.estado_impresora ? 
          impresora.estado_impresora.charAt(0).toUpperCase() + impresora.estado_impresora.slice(1) : '-';
        
        let estadoColor = 'black';
        switch(impresora.estado_impresora) {
          case 'activa': estadoColor = '#065f46'; break;
          case 'inactiva': estadoColor = '#374151'; break;
          case 'mantenimiento': estadoColor = '#92400e'; break;
          case 'obsoleta': estadoColor = '#be185d'; break;
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
         .text('No se encontraron impresoras', doc.page.margins.left, yPosition, {
           width: pageWidth,
           align: 'center'
         });
      
      yPosition += 20;
      
      doc.fontSize(10)
         .text('No hay impresoras registradas en el sistema para generar el reporte.', 
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
       .text('FRITZ C.A - Sistema de Gestión de Impresoras | Reporte generado automáticamente', 
             doc.page.margins.left, footerY, {
               width: pageWidth,
               align: 'center'
             });

    // Finalizar PDF
    doc.end();

    console.log(`PDF general generado exitosamente - ${impresoras.length} impresoras`);

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



