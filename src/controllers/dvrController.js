import { PrismaClient } from '@prisma/client';
import PuppeteerPDF from '../services/puppeteerPDF.js';
import { renderTemplate } from '../helpers/renderHelper.js';
import PDFDocument from 'pdfkit';

const prisma = new PrismaClient();

export const dvrController = {
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
          { ip_dvr: { contains: search, mode: 'insensitive' } },
          { cereal_dvr: { contains: search, mode: 'insensitive' } },
          { mac_dvr: { contains: search, mode: 'insensitive' } },
          { switch: { contains: search, mode: 'insensitive' } },
          { ubicacion: { contains: search, mode: 'insensitive' } } 
        ];
      }

      if (sede_id) {
        where.sede_id = parseInt(sede_id);
      }

      if (estado) {
        where.estado = estado;
      }

      const totalRecords = await prisma.dvr.count({ where });

      const estadisticasTotales = await prisma.dvr.groupBy({
        by: ['estado'],
        _count: {
          id: true
        },
        where: where
      });

      const estadisticas = {
        activos: 0,
        inactivos: 0,
        mantenimiento: 0,
        desuso: 0
      };

      estadisticasTotales.forEach(item => {
        switch (item.estado) {
          case 'activo':
            estadisticas.activos = item._count.id;
            break;
          case 'inactivo':
            estadisticas.inactivos = item._count.id;
            break;
          case 'mantenimiento':
            estadisticas.mantenimiento = item._count.id;
            break;
          case 'desuso':
            estadisticas.desuso = item._count.id;
            break;
        }
      });

      const dvrs = await prisma.dvr.findMany({
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

      const dvrsConDatosCompletos = dvrs.map(dvr => ({
        id: dvr.id,
        descripcion: dvr.descripcion || '',
        ubicacion: dvr.ubicacion || 'Sin ubicación', 
        sede_id: dvr.sede_id,
        cantidad_cam: dvr.cantidad_cam || 0,
        ip_dvr: dvr.ip_dvr || '',
        cereal_dvr: dvr.cereal_dvr || '',
        mac_dvr: dvr.mac_dvr || '',
        switch: dvr.switch || '',
        estado: dvr.estado || 'inactivo',
        created_at: dvr.created_at,
        updated_at: dvr.updated_at,
        stock_equipos: dvr.stock_equipos ? {
          id: dvr.stock_equipos.id,
          marca: dvr.stock_equipos.marca || '',
          modelo: dvr.stock_equipos.modelo || '',
          tipo_equipo: dvr.stock_equipos.tipo_equipo ? {
            id: dvr.stock_equipos.tipo_equipo.id,
            nombre: dvr.stock_equipos.tipo_equipo.nombre || ''
          } : null
        } : null,
        sede: dvr.sede ? {
          id: dvr.sede.id,
          nombre: dvr.sede.nombre || 'Sin sede'
        } : null
      }));

      const totalPages = Math.ceil(totalRecords / limit);

      res.json({
        dvrs: dvrsConDatosCompletos,
        pagination: {
          current: page,
          total: totalPages,
          totalRecords: totalRecords
        },
        estadisticas: {
          total: totalRecords,
          activos: estadisticas.activos,
          inactivos: estadisticas.inactivos,
          mantenimiento: estadisticas.mantenimiento,
          desuso: estadisticas.desuso
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
      const dvrId = parseInt(id); 

      const dvr = await prisma.dvr.findUnique({
        where: { id: dvrId }, 
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true
        }
      });

      if (!dvr) {
        return res.status(404).json({ error: 'DVR no encontrado' });
      }

      const dvrConDatosCompletos = {
        id: dvr.id,
        descripcion: dvr.descripcion || '',
        ubicacion: dvr.ubicacion || 'Sin ubicación',
        sede_id: dvr.sede_id,
        cantidad_cam: dvr.cantidad_cam || 0,
        ip_dvr: dvr.ip_dvr || '',
        cereal_dvr: dvr.cereal_dvr || '',
        mac_dvr: dvr.mac_dvr || '',
        switch: dvr.switch || '',
        estado: dvr.estado || 'inactivo',
        created_at: dvr.created_at,
        updated_at: dvr.updated_at,
        stock_equipos: dvr.stock_equipos ? {
          id: dvr.stock_equipos.id,
          marca: dvr.stock_equipos.marca || '',
          modelo: dvr.stock_equipos.modelo || '',
          tipo_equipo: dvr.stock_equipos.tipo_equipo ? {
            id: dvr.stock_equipos.tipo_equipo.id,
            nombre: dvr.stock_equipos.tipo_equipo.nombre || ''
          } : null
        } : null,
        sede: dvr.sede ? {
          id: dvr.sede.id,
          nombre: dvr.sede.nombre || 'Sin sede'
        } : null
      };

      res.json(dvrConDatosCompletos);
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
        cantidad_cam,
        ip_dvr,
        cereal_dvr,
        mac_dvr,
        switch: switchName,
        estado,
        ubicacion 
      } = req.body;

      console.log('Datos recibidos para crear DVR:', req.body);

      if (!ubicacion || ubicacion.trim() === '') {
        return res.status(400).json({ error: 'La ubicación es requerida' });
      }

      if (!stock_equipos_id) {
        return res.status(400).json({ error: 'El equipo de stock es requerido' });
      }

      if (!sede_id) {
        return res.status(400).json({ error: 'La sede es requerida' });
      }

      const stockEquiposId = parseInt(stock_equipos_id);
      const sedeId = parseInt(sede_id);
      const cantidadCam = parseInt(cantidad_cam) || 1;

      const dvrStock = await prisma.stock_equipos.findUnique({
        where: { id: stockEquiposId }
      });

      if (!dvrStock) {
        return res.status(404).json({ error: 'Equipo no encontrado en inventario' });
      }

      if (dvrStock.cantidad_disponible <= 0) {
        return res.status(400).json({ error: 'No hay stock disponible para este equipo' });
      }
       if (ip_dvr) {
      const ipExistente = await prisma.dvr.findFirst({
        where: { ip_dvr }
      });
      if (ipExistente) {
        return res.status(400).json({ error: 'La dirección IP ya está en uso por otro DVR' });
      }
    }

    if (cereal_dvr) {
      const cerealExistente = await prisma.dvr.findFirst({
        where: { cereal_dvr }
      });
      if (cerealExistente) {
        return res.status(400).json({ error: 'El número de serie ya está en uso por otro DVR' });
      }
    }

    if (mac_dvr) {
      const macExistente = await prisma.dvr.findFirst({
        where: { mac_dvr }
      });
      if (macExistente) {
        return res.status(400).json({ error: 'La dirección MAC ya está en uso por otro DVR' });
      }
    }

      const resultado = await prisma.$transaction(async (tx) => {
        const dvr = await tx.dvr.create({
          data: {
            stock_equipos_id: stockEquiposId, 
            descripcion: descripcion || '',
            ubicacion: ubicacion, 
            sede_id: sedeId, 
            cantidad_cam: cantidadCam,
            ip_dvr: ip_dvr || '',
            cereal_dvr: cereal_dvr || '',
            mac_dvr: mac_dvr || '',
            switch: switchName || '',
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

        return dvr;
      });

  
      const dvrCompleto = await prisma.dvr.findUnique({
        where: { id: resultado.id },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          },
          sede: true
        }
      });

      res.status(201).json({
        message: 'DVR activado exitosamente',
        dvr: dvrCompleto
      });

    } catch (error) {
  
      if (error.code === 'P2002') {
      const campo = error.meta?.target?.[0];
      const mensajes = {
        ip_dvr: 'La dirección IP ya está en uso',
        cereal_dvr: 'El número de serie ya está en uso',
        mac_dvr: 'La dirección MAC ya está en uso'
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
        cantidad_cam,
        ip_dvr,
        cereal_dvr,
        mac_dvr,
        switch: switchName,
        estado,
        ubicacion 
      } = req.body;

      console.log('Datos recibidos para actualizar:', req.body);

      if (!ubicacion || ubicacion.trim() === '') {
        return res.status(400).json({ error: 'La ubicación es requerida' });
      }

      const dvrId = parseInt(id);
      if (ip_dvr) {
      const ipExistente = await prisma.dvr.findFirst({
        where: {
          ip_dvr,
          id: { not: dvrId }
        }
      });
      if (ipExistente) {
        return res.status(400).json({ error: 'La dirección IP ya está en uso por otro DVR' });
      }
    }

    if (cereal_dvr) {
      const cerealExistente = await prisma.dvr.findFirst({
        where: {
          cereal_dvr,
          id: { not: dvrId }
        }
      });
      if (cerealExistente) {
        return res.status(400).json({ error: 'El número de serie ya está en uso por otro DVR' });
      }
    }

    if (mac_dvr) {
      const macExistente = await prisma.dvr.findFirst({
        where: {
          mac_dvr,
          id: { not: dvrId }
        }
      });
      if (macExistente) {
        return res.status(400).json({ error: 'La dirección MAC ya está en uso por otro DVR' });
      }
    }
      const sedeId = sede_id ? parseInt(sede_id) : undefined;
      const cantidadCam = cantidad_cam ? parseInt(cantidad_cam) : undefined;

      const dvrActual = await prisma.dvr.findUnique({
        where: { id: dvrId },
        include: {
          stock_equipos: true
        }
      });

      if (!dvrActual) {
        return res.status(404).json({ error: 'DVR no encontrado' });
      }

      console.log(`DVR actual - Estado: ${dvrActual.estado}, Stock ID: ${dvrActual.stock_equipos_id}`);

      const resultado = await prisma.$transaction(async (tx) => {
        const estadoAnterior = dvrActual.estado;
        const estadoNuevo = estado || dvrActual.estado;
        const stockEquipoId = dvrActual.stock_equipos_id;

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
            console.log('Devolviendo DVR activo al inventario');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_disponible: { increment: 1 },
                cantidad_asignada: { decrement: 1 }
              }
            });
          }
          else if ((estadoAnterior === 'inactivo' || estadoAnterior === 'mantenimiento') && estadoNuevo === 'activo') {
            console.log('Asignando DVR desde inventario a activo');
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
            console.log('Marcando DVR activo como desuso');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_total: { decrement: 1 },
                cantidad_asignada: { decrement: 1 }
              }
            });
          }
          else if ((estadoAnterior === 'inactivo' || estadoAnterior === 'mantenimiento') && estadoNuevo === 'desuso') {
            console.log('Marcando DVR inactivo/mantenimiento como desuso');
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_total: { decrement: 1 },
                cantidad_disponible: { decrement: 1 }
              }
            });
          }
          else if (estadoAnterior === 'desuso' && estadoNuevo === 'activo') {
            console.log('Reactivar DVR desde desuso');
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
            console.log('Mover DVR de desuso a inventario disponible');
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

        const dvrActualizado = await tx.dvr.update({
          where: { id: dvrId },
          data: {
            descripcion: descripcion || '',
            ubicacion: ubicacion, 
            sede_id: sedeId,
            cantidad_cam: cantidadCam,
            ip_dvr: ip_dvr || '',
            cereal_dvr: cereal_dvr || '',
            mac_dvr: mac_dvr || '',
            switch: switchName || '',
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

        return dvrActualizado;
      });

      res.json({
        message: 'DVR actualizado exitosamente',
        dvr: resultado
      });

    } catch (error) {
       if (error.code === 'P2002') {
      const campo = error.meta?.target?.[0];
      const mensajes = {
        ip_dvr: 'La dirección IP ya está en uso',
        cereal_dvr: 'El número de serie ya está en uso',
        mac_dvr: 'La dirección MAC ya está en uso'
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

      const dvr = await prisma.dvr.findUnique({
        where: { id: parseInt(id) },
        include: {
          stock_equipos: true
        }
      });

      if (!dvr) {
        return res.status(404).json({ error: 'DVR no encontrado' });
      }

      await prisma.$transaction(async (tx) => {
        const stockEquipoId = dvr.stock_equipos_id;
        const estadoActual = dvr.estado;

        console.log(`Eliminando DVR con estado: ${estadoActual}`);

        if (estadoActual === 'activo') {
          console.log(`Devolviendo DVR activo al inventario`);
          
          await tx.stock_equipos.update({
            where: { id: stockEquipoId },
            data: {
              cantidad_disponible: { increment: 1 },
              cantidad_asignada: { decrement: 1 }
            }
          });
        } 
        else if (estadoActual === 'inactivo' || estadoActual === 'mantenimiento') {
          console.log(`DVR ya estaba disponible, no se modifica inventario`);
        }
        
        await tx.dvr.delete({
          where: { id: parseInt(id) }
        });
      });

      res.json({ message: 'DVR eliminado exitosamente' });

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

      const dvr = await prisma.dvr.findUnique({
        where: { id: parseInt(id) },
        include: {
          stock_equipos: true
        }
      });

      if (!dvr) {
        return res.status(404).json({ error: 'DVR no encontrado' });
      }

      const dvrActualizado = await prisma.$transaction(async (tx) => {
        const estadoAnterior = dvr.estado;
        const estadoNuevo = estado;
        const stockEquipoId = dvr.stock_equipos_id;

        console.log(`Cambio de estado: ${estadoAnterior} -> ${estadoNuevo}`);

        if (estadoAnterior !== estadoNuevo) {
          const stockActual = await tx.stock_equipos.findUnique({
            where: { id: stockEquipoId }
          });

          if (!stockActual) {
            throw new Error('Stock de equipo no encontrado');
          }

          if (estadoAnterior === 'activo' && (estadoNuevo === 'inactivo' || estadoNuevo === 'mantenimiento')) {
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_disponible: { increment: 1 },
                cantidad_asignada: { decrement: 1 }
              }
            });
          }
          else if ((estadoAnterior === 'inactivo' || estadoAnterior === 'mantenimiento') && estadoNuevo === 'activo') {
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
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_total: { decrement: 1 },
                cantidad_asignada: { decrement: 1 }
              }
            });
          }
          else if ((estadoAnterior === 'inactivo' || estadoAnterior === 'mantenimiento') && estadoNuevo === 'desuso') {
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_total: { decrement: 1 },
                cantidad_disponible: { decrement: 1 }
              }
            });
          }
          else if (estadoAnterior === 'desuso' && estadoNuevo === 'activo') {
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
            await tx.stock_equipos.update({
              where: { id: stockEquipoId },
              data: {
                cantidad_total: { increment: 1 },
                cantidad_disponible: { increment: 1 }
              }
            });
          }
        }

        const dvrActualizado = await tx.dvr.update({
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

        return dvrActualizado;
      });

      res.json({
        message: `Estado del DVR cambiado a ${estado}`,
        dvr: dvrActualizado
      });

    } catch (error) {
      console.error('Error en cambiarEstado:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async porSede(req, res) {
    try {
      const { sede_id } = req.params;

      const dvrs = await prisma.dvr.findMany({
        where: { sede_id: parseInt(sede_id) },
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

      const dvrsConDatosCompletos = dvrs.map(dvr => ({
        id: dvr.id,
        descripcion: dvr.descripcion || '',
        ubicacion: dvr.ubicacion || 'Sin ubicación',
        sede_id: dvr.sede_id,
        cantidad_cam: dvr.cantidad_cam || 0,
        ip_dvr: dvr.ip_dvr || '',
        cereal_dvr: dvr.cereal_dvr || '',
        mac_dvr: dvr.mac_dvr || '',
        switch: dvr.switch || '',
        estado: dvr.estado || 'inactivo',
        created_at: dvr.created_at,
        updated_at: dvr.updated_at,
        stock_equipos: dvr.stock_equipos ? {
          id: dvr.stock_equipos.id,
          marca: dvr.stock_equipos.marca || '',
          modelo: dvr.stock_equipos.modelo || '',
          tipo_equipo: dvr.stock_equipos.tipo_equipo ? {
            id: dvr.stock_equipos.tipo_equipo.id,
            nombre: dvr.stock_equipos.tipo_equipo.nombre || ''
          } : null
        } : null,
        sede: dvr.sede ? {
          id: dvr.sede.id,
          nombre: dvr.sede.nombre || 'Sin sede'
        } : null
      }));

      res.json(dvrsConDatosCompletos);
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

      const dvrs = await prisma.dvr.findMany({
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

      const dvrsConDatosCompletos = dvrs.map(dvr => ({
        id: dvr.id,
        descripcion: dvr.descripcion || '',
        ubicacion: dvr.ubicacion || 'Sin ubicación',
        sede_id: dvr.sede_id,
        cantidad_cam: dvr.cantidad_cam || 0,
        ip_dvr: dvr.ip_dvr || '',
        cereal_dvr: dvr.cereal_dvr || '',
        mac_dvr: dvr.mac_dvr || '',
        switch: dvr.switch || '',
        estado: dvr.estado || 'inactivo',
        created_at: dvr.created_at,
        updated_at: dvr.updated_at,
        stock_equipos: dvr.stock_equipos ? {
          id: dvr.stock_equipos.id,
          marca: dvr.stock_equipos.marca || '',
          modelo: dvr.stock_equipos.modelo || '',
          tipo_equipo: dvr.stock_equipos.tipo_equipo ? {
            id: dvr.stock_equipos.tipo_equipo.id,
            nombre: dvr.stock_equipos.tipo_equipo.nombre || ''
          } : null
        } : null,
        sede: dvr.sede ? {
          id: dvr.sede.id,
          nombre: dvr.sede.nombre || 'Sin sede'
        } : null
      }));

      res.json(dvrsConDatosCompletos);
    } catch (error) {
      console.error('Error en porEstado:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async estadisticas(req, res) {
    try {
      const totalDvrs = await prisma.dvr.count();
      
      const dvrsPorEstado = await prisma.dvr.groupBy({
        by: ['estado'],
        _count: {
          id: true
        }
      });

      const dvrsPorSede = await prisma.dvr.groupBy({
        by: ['sede_id'],
        _count: {
          id: true
        }
      });

      const sedes = await prisma.sedes.findMany({
        where: {
          id: {
            in: dvrsPorSede.map(item => item.sede_id)
          }
        }
      });

      const estadisticasPorSede = dvrsPorSede.map(item => {
        const sede = sedes.find(s => s.id === item.sede_id);
        return {
          sede_id: item.sede_id,
          sede_nombre: sede ? sede.nombre : 'Desconocida',
          cantidad: item._count.id
        };
      });

      res.json({
        total_dvrs: totalDvrs,
        por_estado: dvrsPorEstado.map(item => ({
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

      const dvrs = await prisma.dvr.findMany({
        where: {
          OR: [
            { ip_dvr: { contains: q, mode: 'insensitive' } },
            { descripcion: { contains: q, mode: 'insensitive' } },
            { cereal_dvr: { contains: q, mode: 'insensitive' } },
            { mac_dvr: { contains: q, mode: 'insensitive' } },
            { switch: { contains: q, mode: 'insensitive' } },
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

      const dvrsConDatosCompletos = dvrs.map(dvr => ({
        id: dvr.id,
        descripcion: dvr.descripcion || '',
        ubicacion: dvr.ubicacion || 'Sin ubicación',
        sede_id: dvr.sede_id,
        cantidad_cam: dvr.cantidad_cam || 0,
        ip_dvr: dvr.ip_dvr || '',
        cereal_dvr: dvr.cereal_dvr || '',
        mac_dvr: dvr.mac_dvr || '',
        switch: dvr.switch || '',
        estado: dvr.estado || 'inactivo',
        created_at: dvr.created_at,
        updated_at: dvr.updated_at,
        stock_equipos: dvr.stock_equipos ? {
          id: dvr.stock_equipos.id,
          marca: dvr.stock_equipos.marca || '',
          modelo: dvr.stock_equipos.modelo || '',
          tipo_equipo: dvr.stock_equipos.tipo_equipo ? {
            id: dvr.stock_equipos.tipo_equipo.id,
            nombre: dvr.stock_equipos.tipo_equipo.nombre || ''
          } : null
        } : null,
        sede: dvr.sede ? {
          id: dvr.sede.id,
          nombre: dvr.sede.nombre || 'Sin sede'
        } : null
      }));

      res.json(dvrsConDatosCompletos);
    } catch (error) {
      console.error('Error en buscar:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async generarPDFGeneral(req, res) {
  try {
    console.log('Generando PDF general de DVRs...');

    const dvrs = await prisma.dvr.findMany({
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

    console.log(`${dvrs.length} DVRs encontrados`);

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
    res.setHeader('Content-Disposition', 'inline; filename="reporte-general-dvrs.pdf"');
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
       .text('Reporte General de DVRs', doc.page.margins.left, yPosition, { 
         align: 'center',
         width: pageWidth
       });
    
    yPosition += 20;
    
    doc.fontSize(10)
       .fillColor('#666666')
       .font('Helvetica')
       .text('Sistema de Gestión de CCTV', doc.page.margins.left, yPosition, {
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
    const sedesUnicas = [...new Set(dvrs.map(d => d.sede_id).filter(Boolean))];

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
      activos: dvrs.filter(d => d.estado === 'activo').length,
      inactivos: dvrs.filter(d => d.estado === 'inactivo').length,
      mantenimiento: dvrs.filter(d => d.estado === 'mantenimiento').length,
      desuso: dvrs.filter(d => d.estado === 'desuso').length
    };

    const statWidth = (pageWidth - 20) / 5;
    const statHeight = 25;
    const statY = yPosition;

    const stats = [
      { label: 'TOTAL', value: dvrs.length, color: '#DC2626' },
      { label: 'ACTIVOS', value: estadisticas.activos, color: '#DC2626' },
      { label: 'INACTIVOS', value: estadisticas.inactivos, color: '#DC2626' },
      { label: 'MANTENIMIENTO', value: estadisticas.mantenimiento, color: '#DC2626' },
      { label: 'DESUSO', value: estadisticas.desuso, color: '#DC2626' }
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
    if (dvrs.length > 0) {
      // Configuración de columnas para DVRs
      const columnWidths = {
        equipo: 90,
        ip: 70,
        serial: 80,
        mac: 90,
        sede: 70,
        camaras: 40,
        switch: 80,
        ubicacion: 80,
        estado: 40
      };

      const totalTableWidth = Object.values(columnWidths).reduce((a, b) => a + b, 0);
      
      const headers = [
        { text: 'EQUIPO', width: columnWidths.equipo },
        { text: 'IP', width: columnWidths.ip },
        { text: 'SERIAL', width: columnWidths.serial },
        { text: 'MAC', width: columnWidths.mac },
        { text: 'SEDE', width: columnWidths.sede },
        { text: 'CÁMARAS', width: columnWidths.camaras },
        { text: 'SWITCH', width: columnWidths.switch },
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

      dvrs.forEach((dvr, index) => {
        // PRE-CALCULAR ALTURA PARA CADA CELDA
        const anchoEquipo = columnWidths.equipo - 6;
        const anchoSwitch = columnWidths.switch - 6;
        const anchoUbicacion = columnWidths.ubicacion - 6;
        
        // Textos
        const equipoText = dvr.stock_equipos ? 
          `${dvr.stock_equipos.marca || ''} ${dvr.stock_equipos.modelo || ''}`.trim() + 
          (dvr.stock_equipos.tipo_equipo ? `\n${dvr.stock_equipos.tipo_equipo.nombre}` : '') 
          : 'No asignado';
        
        const switchText = dvr.switch || '-';
        const ubicacionText = dvr.ubicacion || 'Sin ubicación';
        
        // Calcular líneas para cada columna
        const lineasEquipo = equipoText.split('\n').length;
        const lineasSwitch = calcularLineasTexto(switchText, anchoSwitch);
        const lineasUbicacion = calcularLineasTexto(ubicacionText, anchoUbicacion);
        
        // Encontrar el máximo de líneas
        const maxLines = Math.max(lineasEquipo, lineasSwitch, lineasUbicacion, 1);
        
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
        if (currentSede !== dvr.sede_id && dvr.sede) {
          currentSede = dvr.sede_id;
          doc.fontSize(7)
             .fillColor('#333333')
             .font('Helvetica-Bold')
             .text(`SEDE: ${dvr.sede.nombre}`, doc.page.margins.left, currentY + 2);
          
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

        // Equipo/Modelo (multilínea)
        let equipoFinalText = 'No asignado';
        if (dvr.stock_equipos) {
          const marca = dvr.stock_equipos.marca || '';
          const modelo = dvr.stock_equipos.modelo || '';
          const tipo = dvr.stock_equipos.tipo_equipo ? dvr.stock_equipos.tipo_equipo.nombre : '';
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
        const ipText = dvr.ip_dvr || '-';
        doc.text(ipText, cellX + 3, currentY + 2, {
          width: columnWidths.ip - 6,
          height: alturaTexto,
          align: 'left'
        });
        cellX += columnWidths.ip;

        // Serial (una línea)
        const serialText = dvr.cereal_dvr || '-';
        doc.text(serialText, cellX + 3, currentY + 2, {
          width: columnWidths.serial - 6,
          height: alturaTexto,
          align: 'left'
        });
        cellX += columnWidths.serial;

        // MAC (una línea)
        const macText = dvr.mac_dvr || '-';
        doc.text(macText, cellX + 3, currentY + 2, {
          width: columnWidths.mac - 6,
          height: alturaTexto,
          align: 'left'
        });
        cellX += columnWidths.mac;

        // Sede (una línea)
        const sedeText = dvr.sede ? dvr.sede.nombre : 'Sin sede';
        doc.text(sedeText, cellX + 3, currentY + 2, {
          width: columnWidths.sede - 6,
          height: alturaTexto,
          align: 'left'
        });
        cellX += columnWidths.sede;

        // Cámaras (una línea)
        const camarasText = dvr.cantidad_cam ? dvr.cantidad_cam.toString() : '0';
        doc.text(camarasText, cellX + 3, currentY + 2, {
          width: columnWidths.camaras - 6,
          height: alturaTexto,
          align: 'center'
        });
        cellX += columnWidths.camaras;

        // Switch (puede ser multilínea)
        const switchFinalText = dvr.switch || '-';
        doc.text(switchFinalText, cellX + 3, currentY + 2, {
          width: anchoSwitch,
          height: alturaTexto,
          lineGap: 1,
          align: 'left'
        });
        cellX += columnWidths.switch;

        // Ubicación (puede ser multilínea)
        const ubicacionFinalText = dvr.ubicacion || 'Sin ubicación';
        doc.text(ubicacionFinalText, cellX + 3, currentY + 2, {
          width: anchoUbicacion,
          height: alturaTexto,
          lineGap: 1,
          align: 'left'
        });
        cellX += columnWidths.ubicacion;

        // Estado (una línea)
        const estadoText = dvr.estado ? 
          dvr.estado.charAt(0).toUpperCase() + dvr.estado.slice(1) : '-';
        
        let estadoColor = 'black';
        switch(dvr.estado) {
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
         .text('No se encontraron DVRs', doc.page.margins.left, yPosition, {
           width: pageWidth,
           align: 'center'
         });
      
      yPosition += 20;
      
      doc.fontSize(10)
         .text('No hay DVRs registrados en el sistema para generar el reporte.', 
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
       .text('FRITZ C.A - Sistema de Gestión de CCTV | Reporte generado automáticamente', 
             doc.page.margins.left, footerY, {
               width: pageWidth,
               align: 'center'
             });

    // Finalizar PDF
    doc.end();

    console.log(`PDF general generado exitosamente - ${dvrs.length} DVRs`);

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

      console.log(`Generando PDF de DVRs para sede ID: ${sedeId}`);

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

      const dvrs = await prisma.dvr.findMany({
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
          { id: 'asc' }
        ]
      });

      if (dvrs.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ 
          error: 'No se encontraron DVRs para esta sede' 
        }));
      }

      console.log(`${dvrs.length} DVRs encontrados en ${sede.nombre}`);

      const dvrsConDatosCompletos = dvrs.map(dvr => ({
        id: dvr.id,
        descripcion: dvr.descripcion || '',
        ubicacion: dvr.ubicacion || 'Sin ubicación',
        sede_id: dvr.sede_id,
        cantidad_cam: dvr.cantidad_cam || 0,
        ip_dvr: dvr.ip_dvr || '',
        cereal_dvr: dvr.cereal_dvr || '',
        mac_dvr: dvr.mac_dvr || '',
        switch: dvr.switch || '',
        estado: dvr.estado || 'inactivo',
        created_at: dvr.created_at,
        stock_equipos: dvr.stock_equipos ? {
          marca: dvr.stock_equipos.marca || '',
          modelo: dvr.stock_equipos.modelo || '',
          tipo_equipo: dvr.stock_equipos.tipo_equipo ? {
            nombre: dvr.stock_equipos.tipo_equipo.nombre || ''
          } : null
        } : null,
        sede: dvr.sede ? {
          nombre: dvr.sede.nombre || 'Sin sede'
        } : null
      }));

      const data = {
        titulo: `Reporte de DVRs - ${sede.nombre}`,
        subtitulo: `Sede: ${sede.nombre}`,
        fecha: new Date().toLocaleDateString('es-ES', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        total: dvrsConDatosCompletos.length,
        dvrs: dvrsConDatosCompletos,
        sede: sede,
        estadisticas: {
          activos: dvrsConDatosCompletos.filter(d => d.estado === 'activo').length,
          inactivos: dvrsConDatosCompletos.filter(d => d.estado === 'inactivo').length,
          mantenimiento: dvrsConDatosCompletos.filter(d => d.estado === 'mantenimiento').length,
          desuso: dvrsConDatosCompletos.filter(d => d.estado === 'desuso').length
        }
      };

      console.log('Renderizando template para sede...');
      
      const html = await renderTemplate(req.app, 'pdfs/reporte-dvrs-sede', data);

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
      console.log('Tamaño del buffer PDF:', pdfBuffer.length);

      const filename = `reporte-dvrs-${sede.nombre.replace(/\s+/g, '-')}.pdf`;
      
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