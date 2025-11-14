import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import PuppeteerPDF from '../services/puppeteerPDF.js';
import { renderTemplate } from '../helpers/renderHelper.js';
import FileUploadService from '../services/fileUploadService.js';

export const telefonoAsignadoController = {
  async index(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = 10;
      const skip = (page - 1) * limit;

      const { usuario, telefono, num_telefono } = req.query;
      
      console.log('Filtros recibidos en teléfonos asignados:', { usuario, telefono, num_telefono });

      let whereClause = {};

      if (usuario) {
        whereClause.usuarios = {
          OR: [
            { nombre: { contains: usuario, mode: 'insensitive' } },
            { apellido: { contains: usuario, mode: 'insensitive' } }
          ]
        };
      }

      if (telefono) {
        whereClause.stock_equipos = {
          OR: [
            { marca: { contains: telefono, mode: 'insensitive' } },
            { modelo: { contains: telefono, mode: 'insensitive' } }
          ]
        };
      }

      if (num_telefono) {
        whereClause.num_telefono = { contains: num_telefono, mode: 'insensitive' };
      }

      console.log('Where clause para teléfonos asignados:', JSON.stringify(whereClause, null, 2));

      const total = await prisma.telefonos.count({
        where: whereClause
      });

      console.log(`Total de teléfonos asignados con filtros: ${total}`);

      let telefonosAsignados = [];
      if (total > 0) {
        telefonosAsignados = await prisma.telefonos.findMany({
          where: whereClause,
          skip,
          take: limit,
          include: {
            usuarios: {
              include: {
                sede: true,
                departamento: true
              }
            },
            stock_equipos: {
              include: {
                tipo_equipo: true
              }
            }
          },
          orderBy: { id: 'asc' }
        });
      }

      console.log('Teléfonos asignados encontrados:', telefonosAsignados.length);

      const response = telefonosAsignados.map(asignacion => ({
        id: asignacion.id,
        usuarios_id: asignacion.usuarios_id,
        stock_equipos_id: asignacion.stock_equipos_id,
        num_telefono: asignacion.num_telefono,
        linea_telefono: asignacion.linea_telefono, 
        ip_telefono: asignacion.ip_telefono,
        mac_telefono: asignacion.mac_telefono,
        mail_telefono: asignacion.mail_telefono,
        fecha_asignacion: asignacion.fecha_asignacion,
        created_at: asignacion.created_at,
        updated_at: asignacion.updated_at,
        usuarioAsignado: asignacion.usuarios ? {
          id: asignacion.usuarios.id,
          nombre: asignacion.usuarios.nombre,
          apellido: asignacion.usuarios.apellido,
          cargo: asignacion.usuarios.cargo,
          correo: asignacion.usuarios.correo,
          sede: asignacion.usuarios.sede,
          departamento: asignacion.usuarios.departamento
        } : null,
        stockEquipo: asignacion.stock_equipos ? {
          id: asignacion.stock_equipos.id,
          marca: asignacion.stock_equipos.marca,
          modelo: asignacion.stock_equipos.modelo,
          tipo_equipo: asignacion.stock_equipos.tipo_equipo
        } : null
      }));

      res.json({
        telefonosAsignados: response,
        pagination: {
          current: page,
          total: Math.ceil(total / limit),
          totalRecords: total
        }
      });

    } catch (error) {
      console.error('Error en index:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async store(req, res) {
    try {
      const {
        usuarios_id,
        stock_equipos_id,
        num_telefono,
        linea_telefono, 
        ip_telefono,
        mac_telefono,
        mail_telefono,
        fecha_asignacion
      } = req.body;

      console.log('Datos recibidos para crear asignación de teléfono:', {
        usuarios_id,
        stock_equipos_id,
        num_telefono,
        linea_telefono, 
        ip_telefono,
        mac_telefono,
        mail_telefono,
        fecha_asignacion
      });

      console.log('Creación - No se procesa imagen');

      const stockEquipo = await prisma.stock_equipos.findUnique({
        where: { id: parseInt(stock_equipos_id) },
        include: { tipo_equipo: true }
      });

      if (!stockEquipo) {
        return res.status(400).json({ error: 'Teléfono en stock no encontrado' });
      }

      if (stockEquipo.cantidad_disponible <= 0) {
        return res.status(400).json({ error: 'El teléfono seleccionado no tiene stock disponible' });
      }

      const telefonoAsignado = await prisma.telefonos.create({
        data: {
          usuarios_id: parseInt(usuarios_id),
          stock_equipos_id: parseInt(stock_equipos_id),
          num_telefono,
          linea_telefono, 
          ip_telefono,
          mac_telefono,
          mail_telefono,
          fecha_asignacion: fecha_asignacion ? new Date(fecha_asignacion) : new Date(),
          imagen_telefono: null 
        },
        include: {
          usuarios: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              cargo: true,
              correo: true
            }
          },
          stock_equipos: {
            include: {
              tipo_equipo: {
                select: {
                  id: true,
                  nombre: true
                }
              }
            }
          }
        }
      });

      await prisma.stock_equipos.update({
        where: { id: parseInt(stock_equipos_id) },
        data: {
          cantidad_disponible: { decrement: 1 },
          cantidad_asignada: { increment: 1 }
        }
      });

      res.status(201).json({
        message: 'Teléfono asignado exitosamente.',
        telefonoAsignado
      });

    } catch (error) {
      console.error('Error en store:', error);
      res.status(500).json({ error: error.message });
    }
  },

async show(req, res) {
  try {
    const { id } = req.params;
    const telefonoAsignado = await prisma.telefonos.findUnique({
      where: { id: parseInt(id) },
      include: {
        usuarios: {
          include: {
            sede: true,
            departamento: true
          }
        },
        stock_equipos: {
          include: {
            tipo_equipo: true
          }
        }
      }
    });

    if (!telefonoAsignado) {
      return res.status(404).json({ error: 'Asignación de teléfono no encontrada' });
    }

    const telefonoConImagen = {
      ...telefonoAsignado,
      imagen_url: telefonoAsignado.imagen_telefono 
        ? `/uploads/${telefonoAsignado.imagen_telefono}`
        : null
    };

    res.json(telefonoConImagen);
  } catch (error) {
    console.error('Error en show:', error);
    res.status(500).json({ error: error.message });
  }
},

  async update(req, res) {
    try {
      const { id } = req.params;
      const {
        usuarios_id,
        stock_equipos_id,
        num_telefono,
        linea_telefono, 
        ip_telefono,
        mac_telefono,
        mail_telefono,
        fecha_asignacion
      } = req.body;

      console.log('Datos recibidos para actualizar asignación de teléfono:', {
        usuarios_id,
        stock_equipos_id,
        num_telefono,
        linea_telefono, 
        ip_telefono,
        mac_telefono,
        mail_telefono,
        fecha_asignacion
      });

      const telefonoAsignado = await prisma.telefonos.findUnique({
        where: { id: parseInt(id) }
      });

      

      if (!telefonoAsignado) {
        return res.status(404).json({ error: 'Asignación de teléfono no encontrada' });
      }
      

      let imagenPath = telefonoAsignado.imagen_telefono;

if (req.body.delete_imagen === 'true') {
    if (telefonoAsignado.imagen_telefono) {
        await FileUploadService.deleteFile(telefonoAsignado.imagen_telefono);
    }
    imagenPath = null;
}

if (req.file) {
    console.log('Procesando imagen de comprobante en edición...');
    
    FileUploadService.validateImage(req.file);
    
    if (telefonoAsignado.imagen_telefono) {
        await FileUploadService.deleteFile(telefonoAsignado.imagen_telefono);
    }
    
    imagenPath = await FileUploadService.uploadFile(req.file, 'telefonos/comprobantes');
    console.log('Imagen subida:', imagenPath);
}

      const stockAnterior = telefonoAsignado.stock_equipos_id;
      const stockNuevo = parseInt(stock_equipos_id);

      if (stockAnterior !== stockNuevo) {
        await prisma.stock_equipos.update({
          where: { id: stockAnterior },
          data: {
            cantidad_disponible: { increment: 1 },
            cantidad_asignada: { decrement: 1 }
          }
        });

        await prisma.stock_equipos.update({
          where: { id: stockNuevo },
          data: {
            cantidad_disponible: { decrement: 1 },
            cantidad_asignada: { increment: 1 }
          }
        });
      }

      const updated = await prisma.telefonos.update({
        where: { id: parseInt(id) },
        data: {
          usuarios_id: parseInt(usuarios_id),
          stock_equipos_id: stockNuevo,
          num_telefono,
          linea_telefono, 
          ip_telefono,
          mac_telefono,
          mail_telefono,
          imagen_telefono: imagenPath,
          fecha_asignacion: fecha_asignacion ? new Date(fecha_asignacion) : telefonoAsignado.fecha_asignacion
        },
        include: {
          usuarios: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              cargo: true,
              correo: true
            }
          },
          stock_equipos: {
            include: {
              tipo_equipo: {
                select: {
                  id: true,
                  nombre: true
                }
              }
            }
          }
        }
      });

      res.json({
        message: 'Asignación de teléfono actualizada exitosamente.',
        telefonoAsignado: updated
      });

    } catch (error) {
      console.error('Error en update:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async destroy(req, res) {  
    try {
      const { id } = req.params;
      console.log('Eliminando asignación de teléfono:', id);

      const telefonoAsignado = await prisma.telefonos.findUnique({
        where: { id: parseInt(id) }
      });

      if (!telefonoAsignado) {
        return res.status(404).json({ error: 'Asignación de teléfono no encontrada' });
      }

      if (telefonoAsignado.imagen_telefono) {
        await FileUploadService.deleteFile(telefonoAsignado.imagen_telefono);
      }

      const stockEquipo = await prisma.stock_equipos.findUnique({
        where: { id: telefonoAsignado.stock_equipos_id }
      });

      if (stockEquipo) {
        await prisma.stock_equipos.update({
          where: { id: stockEquipo.id },
          data: {
            cantidad_disponible: { increment: 1 },
            cantidad_asignada: { decrement: 1 }
          }
        });
      }

      await prisma.telefonos.delete({
        where: { id: parseInt(id) }
      });

      res.json({ message: 'Asignación de teléfono eliminada exitosamente.' });

    } catch (error) {
      console.error('Error en destroy:', error);
      res.status(500).json({ error: error.message });
    }
  },


  async porUsuario(req, res) {
    try {
      const { usuarioId } = req.params;
      const telefonosAsignados = await prisma.telefonos.findMany({
        where: { usuarios_id: parseInt(usuarioId) },
        include: {
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          }
        }
      });

      res.json(telefonosAsignados);
    } catch (error) {
      console.error('Error en porUsuario:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async porStock(req, res) {
    try {
      const { stockId } = req.params;
      const historial = await prisma.telefonos.findMany({
        where: { stock_equipos_id: parseInt(stockId) },
        include: {
          usuarios: true
        },
        orderBy: { fecha_asignacion: 'desc' }
      });

      res.json(historial);
    } catch (error) {
      console.error('Error en porStock:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async reporte(req, res) {
    try {
      const { fecha_desde, fecha_hasta } = req.query;
      
      let where = {};
      
      if (fecha_desde) {
        where.fecha_asignacion = {
          gte: new Date(fecha_desde)
        };
      }
      
      if (fecha_hasta) {
        where.fecha_asignacion = {
          ...where.fecha_asignacion,
          lte: new Date(fecha_hasta)
        };
      }

      const telefonosAsignados = await prisma.telefonos.findMany({
        where,
        include: {
          usuarios: true,
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          }
        }
      });

      res.json(telefonosAsignados);
    } catch (error) {
      console.error('Error en reporte:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async estadisticas(req, res) {
    try {
      const totalAsignaciones = await prisma.telefonos.count();
      
      const asignacionesPorMes = await prisma.$queryRaw`
        SELECT 
          YEAR(fecha_asignacion) as año, 
          MONTH(fecha_asignacion) as mes, 
          COUNT(*) as total
        FROM telefonos 
        GROUP BY año, mes 
        ORDER BY año DESC, mes DESC
      `;

      const telefonosPorMarca = await prisma.telefonos.groupBy({
        by: ['stock_equipos_id'],
        _count: {
          id: true
        },
        include: {
          stock_equipos: {
            select: {
              marca: true,
              modelo: true
            }
          }
        }
      });

      res.json({
        total_asignaciones: totalAsignaciones,
        asignaciones_por_mes: asignacionesPorMes,
        telefonos_por_marca: telefonosPorMarca
      });
    } catch (error) {
      console.error('Error en estadisticas:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async apiIndex(req, res) {
    try {
      const telefonosAsignados = await prisma.telefonos.findMany({
        include: {
          usuarios: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              cargo: true,
              correo: true
            }
          },
          stock_equipos: {
            include: {
              tipo_equipo: {
                select: {
                  id: true,
                  nombre: true
                }
              }
            }
          }
        },
        orderBy: { id: 'asc' }
      });

      console.log('Teléfonos asignados cargados:', telefonosAsignados.length);
      res.json(telefonosAsignados);
    } catch (error) {
      console.error('Error en apiIndex:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async apiShow(req, res) {
    try {
      const { id } = req.params;
      const telefonoAsignado = await prisma.telefonos.findUnique({
        where: { id: parseInt(id) },
        include: {
          usuarios: {
            include: {
              sede: true,
              departamento: true
            }
          },
          stock_equipos: {
            include: {
              tipo_equipo: true
            }
          }
        }
      });

      if (!telefonoAsignado) {
        return res.status(404).json({ error: 'Asignación de teléfono no encontrada' });
      }

      res.json(telefonoAsignado);
    } catch (error) {
      console.error('Error en apiShow:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async devolverTelefono(req, res) {
  try {
    const { id } = req.params;
    console.log('Devolviendo teléfono asignado:', id);

    const telefonoAsignado = await prisma.telefonos.findUnique({
      where: { id: parseInt(id) }
    });

    if (!telefonoAsignado) {
      return res.status(404).json({ error: 'Asignación de teléfono no encontrada' });
    }

    await prisma.stock_equipos.update({
      where: { id: telefonoAsignado.stock_equipos_id },
      data: {
        cantidad_disponible: { increment: 1 },
        cantidad_asignada: { decrement: 1 }
      }
    });

    await prisma.telefonos.delete({
      where: { id: parseInt(id) }
    });

    res.json({ 
      message: 'Teléfono devuelto al inventario exitosamente.',
      stock_equipos_id: telefonoAsignado.stock_equipos_id
    });

  } catch (error) {
    console.error('Error en devolverTelefono:', error);
    res.status(500).json({ error: error.message });
  }
},

async generarPDFPorUsuario(req, res) {
  console.log('=== GENERAR PDF POR USUARIO INICIADO ===');
  
  try {
    const { usuarioId } = req.params;

    const usuario = await prisma.usuarios.findUnique({
      where: { id: parseInt(usuarioId) },
      include: {
        sede: { select: { nombre: true } },
        departamento: { select: { nombre: true } }
      }
    });

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const telefonosAsignados = await prisma.telefonos.findMany({
      where: { usuarios_id: parseInt(usuarioId) },
      include: {
        stock_equipos: {
          include: {
            tipo_equipo: { select: { nombre: true } }
          }
        }
      },
      orderBy: { fecha_asignacion: 'desc' }
    });

    const telefonosProcesados = telefonosAsignados.map(asignacion => {
      const stock = asignacion.stock_equipos || {};
      const tipoEquipo = stock.tipo_equipo || {};
      
      return {
        id: asignacion.id,
        num_telefono: asignacion.num_telefono,
        ip_telefono: asignacion.ip_telefono,
        mac_telefono: asignacion.mac_telefono,
        mail_telefono: asignacion.mail_telefono,
        linea_telefono: asignacion.linea_telefono,
        fecha_asignacion: asignacion.fecha_asignacion,
        stockEquipo: {
          id: stock.id || 0,
          marca: stock.marca || 'N/A',
          modelo: stock.modelo || '',
          tipoEquipo: {
            nombre: tipoEquipo.nombre || 'Teléfono'
          }
        }
      };
    });

    const totalTelefonos = telefonosProcesados.length;

    let contador = await prisma.contador_documentos.findUnique({
      where: { tipo: 'TELEFONOS_USUARIO' }
    });

    let numeroDocumento;
    
    if (!contador) {
      contador = await prisma.contador_documentos.create({
        data: {
          tipo: 'TELEFONOS_USUARIO',
          valor: 1
        }
      });
      numeroDocumento = '0001';
    } else {
      contador = await prisma.contador_documentos.update({
        where: { tipo: 'TELEFONOS_USUARIO' },
        data: { 
          valor: contador.valor + 1,
          fecha_actualizacion: new Date()
        }
      });
      numeroDocumento = contador.valor.toString().padStart(4, '0');
    }

    const data = {
      titulo: `Reporte de Teléfonos Asignados - ${usuario.nombre} ${usuario.apellido}`,
      subtitulo: `Usuario: ${usuario.nombre} ${usuario.apellido}`,
      fecha: new Date().toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      total: totalTelefonos,
      telefonos: telefonosProcesados,
      usuario: usuario,
      sede: usuario.sede,
      numeroDocumento: numeroDocumento
    };

    console.log('Renderizando template para teléfonos...');
    
    const html = await renderTemplate(req.app, 'pdfs/reporte-telefonos-usuario', data);

    console.log('Generando PDF para teléfonos...');
    
    const pdfOptions = {
      format: 'Letter',
      landscape: false,
      printBackground: true,
      margin: {
        top: '15mm',
        right: '10mm',
        bottom: '15mm',
        left: '10mm'
      }
    };

    const pdfBuffer = await PuppeteerPDF.generatePDF(html, pdfOptions);
    
    console.log('PDF de teléfonos generado exitosamente');
    console.log('Número de documento:', numeroDocumento);

    const filename = `reporte-telefonos-${usuario.nombre.replace(/\s+/g, '-')}-${usuario.apellido.replace(/\s+/g, '-')}-${numeroDocumento}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.end(pdfBuffer);

  } catch (error) {
    console.error('Error generando PDF por usuario:', error);

    res.status(500).json({ 
      error: 'Error generando PDF', 
      detalles: error.message 
    });
  }
},
async generarPDFGeneral(req, res) {
  console.log('=== GENERAR PDF GENERAL DE TELÉFONOS INICIADO ===');
  
  try {
    const { sede_id, departamento_id } = req.query;

    let whereClause = {};

    if (sede_id) {
      whereClause.usuarios = {
        sede_id: parseInt(sede_id)
      };
    }

    if (departamento_id) {
      whereClause.usuarios = {
        ...whereClause.usuarios,
        departamento_id: parseInt(departamento_id)
      };
    }

    const telefonosAsignados = await prisma.telefonos.findMany({
      where: whereClause,
      include: {
        usuarios: {
          include: {
            sede: true,
            departamento: true
          }
        },
        stock_equipos: {
          include: {
            tipo_equipo: { select: { nombre: true } }
          }
        }
      },
      orderBy: [
        { usuarios: { sede_id: 'asc' } },
        { usuarios: { departamento_id: 'asc' } },
        { usuarios: { nombre: 'asc' } }
      ]
    });

    const telefonosProcesados = telefonosAsignados.map(asignacion => {
      const usuario = asignacion.usuarios || {};
      const stock = asignacion.stock_equipos || {};
      const tipoEquipo = stock.tipo_equipo || {};
      
      return {
        id: asignacion.id,
        num_telefono: asignacion.num_telefono,
        ip_telefono: asignacion.ip_telefono,
        mac_telefono: asignacion.mac_telefono,
        mail_telefono: asignacion.mail_telefono,
        fecha_asignacion: asignacion.fecha_asignacion,
        usuario: {
          id: usuario.id,
          nombre: usuario.nombre,
          apellido: usuario.apellido,
          cargo: usuario.cargo,
          sede: usuario.sede,
          departamento: usuario.departamento
        },
        stockEquipo: {
          id: stock.id || 0,
          marca: stock.marca || 'N/A',
          modelo: stock.modelo || '',
          tipoEquipo: {
            nombre: tipoEquipo.nombre || 'Teléfono'
          }
        }
      };
    });

    const totalTelefonos = telefonosProcesados.length;

    let titulo = 'Reporte General de Teléfonos Asignados';
    let subtitulo = 'Todos los teléfonos asignados en el sistema';
    
    if (sede_id) {
      const sede = await prisma.sedes.findUnique({
        where: { id: parseInt(sede_id) }
      });
      titulo = `Reporte de Teléfonos - Sede: ${sede?.nombre || 'Desconocida'}`;
      subtitulo = `Teléfonos asignados en ${sede?.nombre || 'la sede seleccionada'}`;
    }

    const data = {
      titulo: titulo,
      subtitulo: subtitulo,
      fecha: new Date().toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      total: totalTelefonos,
      telefonos: telefonosProcesados,
      filtros: {
        sede_id: sede_id || null,
        departamento_id: departamento_id || null
      }
    };

    console.log('Renderizando template general para teléfonos...');
    
    const html = await renderTemplate(req.app, 'pdfs/reporte-telefonos-general', data);

    console.log('Generando PDF general para teléfonos...');
    
    const pdfOptions = {
      format: 'Letter',
      landscape: true, 
      printBackground: true,
      margin: {
        top: '15mm',
        right: '10mm',
        bottom: '15mm',
        left: '10mm'
      }
    };

    const pdfBuffer = await PuppeteerPDF.generatePDF(html, pdfOptions);
    
    console.log('PDF general de teléfonos generado exitosamente');

    const filename = `reporte-telefonos-general-${new Date().toISOString().split('T')[0]}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.end(pdfBuffer);

  } catch (error) {
    console.error('Error generando PDF general:', error);

    res.status(500).json({ 
      error: 'Error generando PDF', 
      detalles: error.message 
    });
  }
},
};