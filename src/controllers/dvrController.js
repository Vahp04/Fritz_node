import { PrismaClient } from '@prisma/client';
import PuppeteerPDF from '../services/puppeteerPDF.js';
import { renderTemplate } from '../helpers/renderHelper.js';

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
        titulo: 'Reporte General de DVRs',
        fecha: new Date().toLocaleDateString('es-ES', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        total: dvrsConDatosCompletos.length,
        dvrs: dvrsConDatosCompletos,
        estadisticas: {
          activos: dvrsConDatosCompletos.filter(d => d.estado === 'activo').length,
          inactivos: dvrsConDatosCompletos.filter(d => d.estado === 'inactivo').length,
          mantenimiento: dvrsConDatosCompletos.filter(d => d.estado === 'mantenimiento').length,
          desuso: dvrsConDatosCompletos.filter(d => d.estado === 'desuso').length
        }
      };

      const html = await renderTemplate(req.app, 'pdfs/reporte-general-dvrs', data);
      
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
        'Content-Disposition': 'inline; filename="reporte-general-dvrs.pdf"',
        'Content-Length': pdfBuffer.length,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      
      console.log(`PDF general generado exitosamente - ${dvrsConDatosCompletos.length} DVRs`);

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