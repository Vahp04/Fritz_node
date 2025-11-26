import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import PuppeteerPDF from '../services/puppeteerPDF.js';
import PDFDocument from 'pdfkit';
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

    const totalGlobal = await prisma.telefonos.count();
    const totalUsuariosUnicos = await prisma.telefonos.groupBy({
      by: ['usuarios_id'],
      _count: {
        id: true
      }
    }).then(results => results.length);

    const totalMarcasUnicas = await prisma.telefonos.groupBy({
  by: ['stock_equipos_id'],
  _count: {
    id: true
  }
}).then(async (results) => {
  const stockIds = results.map(item => item.stock_equipos_id);
  
  if (stockIds.length === 0) return 0;
  
  const stockEquipos = await prisma.stock_equipos.findMany({
    where: {
      id: { in: stockIds }
    },
    select: {
      marca: true
    }
  });
  
  const marcas = new Set();
  stockEquipos.forEach(item => {
    if (item.marca) {
      marcas.add(item.marca);
    }
  });
  
  return marcas.size;
});

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
      },
      resumenes: {
        totalGlobal: totalGlobal,
        totalUsuariosUnicos: totalUsuariosUnicos,
        totalMarcasUnicas: totalMarcasUnicas,
        totalConFiltros: total 
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

          if (num_telefono) {
      const numTelefonoExistente = await prisma.telefonos.findFirst({
        where: { num_telefono }
      });
      if (numTelefonoExistente) {
        return res.status(400).json({ error: 'El número de teléfono ya está en uso' });
      }
    }

    if (ip_telefono) {
      const ipExistente = await prisma.telefonos.findFirst({
        where: { ip_telefono }
      });
      if (ipExistente) {
        return res.status(400).json({ error: 'La dirección IP ya está en uso por otro teléfono' });
      }
    }

    if (mac_telefono) {
      const macExistente = await prisma.telefonos.findFirst({
        where: { mac_telefono }
      });
      if (macExistente) {
        return res.status(400).json({ error: 'La dirección MAC ya está en uso por otro teléfono' });
      }
    }

    if (mail_telefono) {
      const mailExistente = await prisma.telefonos.findFirst({
        where: { mail_telefono }
      });
      if (mailExistente) {
        return res.status(400).json({ error: 'El IMEI ya está en uso por otro teléfono' });
      }
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
    if (error.code === 'P2002') {
      const campo = error.meta?.target?.[0];
      const mensajes = {
        num_telefono: 'El número de teléfono ya está en uso',
        ip_telefono: 'La dirección IP ya está en uso',
        mac_telefono: 'La dirección MAC ya está en uso',
        mail_telefono: 'El IMEI ya está en uso'
      };
      return res.status(400).json({ 
        error: mensajes[campo] || 'El valor ya existe en otro registro' 
      });
    }
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
      
      const telefonoId = parseInt(id);

    if (num_telefono) {
      const numTelefonoExistente = await prisma.telefonos.findFirst({
        where: {
          num_telefono,
          id: { not: telefonoId }
        }
      });
      if (numTelefonoExistente) {
        return res.status(400).json({ error: 'El número de teléfono ya está en uso' });
      }
    }

    if (ip_telefono) {
      const ipExistente = await prisma.telefonos.findFirst({
        where: {
          ip_telefono,
          id: { not: telefonoId }
        }
      });
      if (ipExistente) {
        return res.status(400).json({ error: 'La dirección IP ya está en uso por otro teléfono' });
      }
    }

    if (mac_telefono) {
      const macExistente = await prisma.telefonos.findFirst({
        where: {
          mac_telefono,
          id: { not: telefonoId }
        }
      });
      if (macExistente) {
        return res.status(400).json({ error: 'La dirección MAC ya está en uso por otro teléfono' });
      }
    }

    if (mail_telefono) {
      const mailExistente = await prisma.telefonos.findFirst({
        where: {
          mail_telefono,
          id: { not: telefonoId }
        }
      });
      if (mailExistente) {
        return res.status(400).json({ error: 'El IMEI ya está en uso por otro teléfono' });
      }
    }

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
      fecha: new Date().toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      total: totalTelefonos,
      telefonos: telefonosProcesados,
      usuario: usuario,
      numeroDocumento: numeroDocumento
    };

    console.log('Generando PDF con PDFDocument...');
    
    // Crear documento PDF
    const doc = new PDFDocument({ 
      margin: 20,
      size: 'LETTER',
      layout: 'landscape'
    });

    // Configurar headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="reporte-telefonos-${usuario.nombre}-${usuario.apellido}.pdf"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Pipe el PDF a la respuesta
    doc.pipe(res);

    // Función para dibujar una columna
    const dibujarColumna = (x, y, width, height, esCopia = false) => {
      // Borde de la columna
      doc.rect(x, y, width, height)
         .strokeColor('#000')
         .lineWidth(1)
         .stroke();

      let currentY = y + 15;

      // ===== HEADER =====
      // Logo placeholder
      doc.fillColor('#f73737')
         .rect(x + 10, currentY, 40, 30)
         .fill()
         .fillColor('white')
         .fontSize(8)
         .text('FRITZ C.A', x + 15, currentY + 10, { width: 30, align: 'center' });

      // Títulos
      doc.fillColor('#f73737')
         .fontSize(12)
         .text('FRITZ C.A', x + 60, currentY, { 
             width: width - 70, 
             align: 'center' 
         });

      currentY += 12;

      doc.fillColor('#666')
         .fontSize(10)
         .text('Reporte de Teléfonos Asignados', x + 60, currentY, { 
             width: width - 70, 
             align: 'center' 
         });

      currentY += 12;

      doc.fillColor('#000')
         .fontSize(10)
         .text('Generado el: ' + data.fecha, x + 60, currentY, { 
             width: width - 70, 
             align: 'center' 
         });

      currentY += 25;

      // Línea separadora del header
      doc.moveTo(x + 10, currentY)
         .lineTo(x + width - 10, currentY)
         .strokeColor('#000')
         .lineWidth(1)
         .stroke();

      currentY += 20;

      // ===== INFORMACIÓN DEL USUARIO =====
      doc.rect(x + 10, currentY, width - 30, 65)
         .fillColor('#e9ecef')
         .fill();
      
      doc.rect(x + 10, currentY, 4, 65)
         .fillColor('#DC2626')
         .fill();

      doc.fillColor('#333')
         .fontSize(11)
         .text('Información del Usuario', x + 20, currentY + 10);

      currentY += 20;

      const infoUsuario = [
        `Nombre: ${usuario.nombre} ${usuario.apellido}`,
        `Cargo: ${usuario.cargo || 'No especificado'}`,
        `Departamento: ${usuario.departamento?.nombre || 'No asignado'}`,
        `Sede: ${usuario.sede?.nombre || 'No asignada'}`
      ];

      infoUsuario.forEach((linea, index) => {
        doc.fontSize(9)
           .text(linea, x + 20, currentY + (index * 10));
      });

      currentY += 50;

      // ===== RESUMEN DE TELÉFONOS =====
      doc.rect(x + 10, currentY, width - 35, 30)
         .fillColor('#e9ecef')
         .fill();

      doc.fillColor('#333')
         .fontSize(10)
         .text('Resumen de Teléfono Asignado', x + 15, currentY + 8);

      currentY += 15;

      const ultimaAsignacion = data.telefonos && data.telefonos.length > 0 ? 
        new Date(data.telefonos[0].fecha_asignacion).toLocaleDateString('es-ES') : 'No disponible';

      doc.fontSize(9)
         .text(`Última asignación: ${ultimaAsignacion}`, x + 15, currentY);

      currentY += 25;

      // ===== DETALLE DE TELÉFONOS ASIGNADOS =====
      doc.fillColor('#333')
         .fontSize(11)
         .text('Detalle de Teléfono Asignado', x + 10, currentY);

      currentY += 15;

      if (data.telefonos && data.telefonos.length > 0) {
        // Encabezados de tabla
        const headers = ['Número', 'Marca/Modelo', 'IP', 'MAC', 'IMEI', 'Línea'];
        const columnWidths = [width * 0.15, width * 0.22, width * 0.17, width * 0.15, width * 0.15, width * 0.13];
        
        let headerX = x + 10;
        
        // Fondo encabezados
        headers.forEach((header, index) => {
          doc.rect(headerX, currentY, columnWidths[index], 12)
             .fillColor('#343a40')
             .fill();
          headerX += columnWidths[index];
        });

        // Texto encabezados
        headerX = x + 10;
        doc.fillColor('white')
           .fontSize(7);
        
        headers.forEach((header, index) => {
          doc.text(header, headerX + 2, currentY + 3, { 
              width: columnWidths[index] - 4, 
              align: 'left' 
          });
          headerX += columnWidths[index];
        });

        currentY += 12;

        // Filas de teléfonos
        data.telefonos.forEach((telefono, index) => {
          // Fondo alternado para filas
          if (index % 2 === 0) {
            doc.rect(x + 10, currentY, width - 20, 20)
               .fillColor('#f8f9fa')
               .fill();
          }

          let cellX = x + 10;

          doc.fillColor('#333')
             .fontSize(7);

          // Número
          doc.text(telefono.num_telefono || 'N/A', cellX + 2, currentY + 5, { 
              width: columnWidths[0] - 4 
          });
          cellX += columnWidths[0];

          // Marca/Modelo
          const equipoTexto = `${telefono.stockEquipo.marca || 'N/A'} ${telefono.stockEquipo.modelo || ''}`;
          doc.text(equipoTexto, cellX + 2, currentY + 5, { 
              width: columnWidths[1] - 4 
          });
          cellX += columnWidths[1];

          // IP
          doc.text(telefono.ip_telefono || 'N/A', cellX + 2, currentY + 5, { 
              width: columnWidths[2] - 4 
          });
          cellX += columnWidths[2];

          // MAC
          doc.text(telefono.mac_telefono || 'N/A', cellX + 2, currentY + 5, { 
              width: columnWidths[3] - 4 
          });
          cellX += columnWidths[3];

          // IMEI
          doc.text(telefono.mail_telefono || 'N/A', cellX + 2, currentY + 5, { 
              width: columnWidths[4] - 4 
          });
          cellX += columnWidths[4];

          // Línea
          doc.text(telefono.linea_telefono || 'N/A', cellX + 2, currentY + 5, { 
              width: columnWidths[5] - 4 
          });

          currentY += 20;
        });

        // Bordes de la tabla
        doc.rect(x + 10, currentY - (data.telefonos.length * 20), width - 20, (data.telefonos.length * 20) + 12)
           .strokeColor('#000')
           .lineWidth(0.5)
           .stroke();

      } else {
        // No hay teléfonos asignados
        doc.rect(x + 10, currentY, width - 20, 30)
           .fillColor('#f8f9fa')
           .fill();
        
        doc.fillColor('#666')
           .fontSize(10)
           .text('El usuario no tiene teléfonos asignados', x + 10, currentY + 10, { 
               width: width - 20, 
               align: 'center' 
           });
        
        currentY += 40;
      }

      currentY += 20;

      // ===== FIRMAS =====
      const firmaWidth = (width - 35) / 2;
      
      // Firma Usuario
      doc.moveTo(x + 10, currentY + 30)
         .lineTo(x + 10 + firmaWidth, currentY + 20)
         .strokeColor('#000')
         .lineWidth(1)
         .stroke();

      doc.fillColor('#000')
         .fontSize(9)
         .text(`${usuario.nombre} ${usuario.apellido}`, x + 10, currentY + 23, { 
             width: firmaWidth, 
             align: 'center' 
         });

      doc.fontSize(8)
         .text('Usuario', x + 10, currentY + 33, { 
             width: firmaWidth, 
             align: 'center' 
         });

      // Firma Departamento de Tecnología
      doc.moveTo(x + 20 + firmaWidth, currentY + 30)
         .lineTo(x + 20 + firmaWidth + firmaWidth, currentY + 20)
         .strokeColor('#000')
         .lineWidth(1)
         .stroke();

      doc.fontSize(8)
         .text('Departamento de Tecnología', x + 20 + firmaWidth, currentY + 23, { 
             width: firmaWidth, 
             align: 'center' 
         });

      doc.text('FRITZ C.A', x + 20 + firmaWidth, currentY + 33, { 
          width: firmaWidth, 
          align: 'center' 
      });

      currentY += 60;

      // ===== FOOTER =====
      doc.moveTo(x + 10, currentY)
         .lineTo(x + width - 10, currentY)
         .strokeColor('#ddd')
         .lineWidth(1)
         .stroke();

      doc.fillColor('#666')
         .fontSize(8)
         .text('FRITZ C.A - Sistema de Gestión de Teléfonos', x + 10, currentY + 8, { 
             width: width - 20, 
             align: 'center' 
         });

      // Número de documento
      doc.text('Doc: TEL-' + data.numeroDocumento, x + 10, currentY + 8, { 
          width: width - 20, 
          align: 'right' 
      });

      // ===== NOTA DE COPIA =====
      if (esCopia) {
        doc.fillColor('#ff0000')
           .fontSize(9)
           .text('COPIA', x + 10, y + height - 15, { 
               width: width - 20, 
               align: 'center' 
           });
      }

      return currentY;
    };

    // Dimensiones para las dos columnas
    const pageWidth = 760;
    const pageHeight = 520;
    const colWidth = (pageWidth - 20) / 2;
    
    // Dibujar primera columna (original)
    dibujarColumna(20, 20, colWidth, pageHeight, false);
    
    // Dibujar segunda columna (copia)
    dibujarColumna(20 + colWidth + 20, 20, colWidth, pageHeight, true);

    // Manejar eventos del documento
    doc.on('error', (error) => {
      console.error('Error en la generación del PDF:', error);
      if (!res.headersSent) {
        res.status(500).json({ 
          error: 'Error al generar el PDF: ' + error.message 
        });
      }
    });

    doc.on('end', () => {
      console.log('=== PDF DE TELÉFONOS GENERADO EXITOSAMENTE ===');
      console.log(`Número de documento: TEL-${numeroDocumento}`);
    });

    doc.end();

  } catch (error) {
    console.error('Error generando PDF por usuario:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Error generando PDF', 
        detalles: error.message 
      });
    }
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