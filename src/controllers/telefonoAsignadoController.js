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

    const fecha = new Date().toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const data = {
      titulo: `Reporte de Teléfonos Asignados `,
      fecha: fecha,
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
      layout: 'portrait' // Cambiado a portrait para mejor distribución
    });

    // Configurar headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="reporte-telefonos-${usuario.nombre}-${usuario.apellido}.pdf"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Pipe el PDF a la respuesta
    doc.pipe(res);

    // Función auxiliar para dibujar texto con estilo
    const drawText = (text, x, y, options = {}) => {
      const {
        fontSize = 10,
        font = 'Helvetica',
        color = '#000000',
        align = 'left',
        bold = false
      } = options;

      doc.font(bold ? font + '-Bold' : font)
         .fontSize(fontSize)
         .fillColor(color);

      const textWidth = doc.widthOfString(text);
      let finalX = x;

      if (align === 'center') {
        finalX = x - textWidth / 2;
      } else if (align === 'right') {
        finalX = x - textWidth;
      }

      doc.text(text, finalX, y);
    };

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

    drawText('FRITZ C.A', colX + (columnWidth / 2), colY + 5, {
      fontSize: 16,
      color: '#DC2626',
      align: 'center',
      bold: true
    });
    
    drawText(data.titulo, colX + (columnWidth / 2), colY + 20, {
      fontSize: 14,
      color: '#666666',
      align: 'center',
      bold: true
    });

    colY += 40;

    drawText(`Generado el: ${data.fecha}`, colX + (columnWidth / 2), colY, {
      fontSize: 10,
      color: '#000000',
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

    // Información del usuario - Columna 1
    doc.rect(colX, colY, columnWidth, 25)
       .fillColor('#f8f9fa')
       .fill();
    
    doc.rect(colX, colY, columnWidth, 25)
       .strokeColor('#000000')
       .lineWidth(1)
       .stroke();

    drawText('Información del Usuario', colX + 10, colY + 8, {
      fontSize: 12,
      color: '#333333',
      bold: true
    });

    colY += 30;

    // Contenedor principal de información
    const infoHeight = 120;
    doc.rect(colX, colY, columnWidth, infoHeight)
       .fillColor('#f8f9fa')
       .fill();
    
    doc.rect(colX, colY, columnWidth, infoHeight)
       .strokeColor('#000000')
       .lineWidth(1)
       .stroke();

    let infoY = colY + 10;
    const infoItemHeight = 14;

    // Datos del usuario - Columna 1
    const userInfo = [
        { label: 'ID de Usuario:', value: usuario.id.toString() },
        { label: 'Nombre Completo:', value: `${usuario.nombre} ${usuario.apellido}` },
        { label: 'Cargo:', value: usuario.cargo || 'No especificado' },
        { label: 'Sede:', value: usuario.sede?.nombre || 'No asignada' },
        { label: 'Departamento:', value: usuario.departamento?.nombre || 'No asignado' },
        { label: 'Total Teléfonos:', value: data.total.toString() },
        { label: 'Última Asignación:', value: data.telefonos && data.telefonos.length > 0 ? 
            new Date(data.telefonos[0].fecha_asignacion).toLocaleDateString('es-ES') : 'No disponible' }
    ];

    userInfo.forEach((info, index) => {
        const currentY = infoY + (index * infoItemHeight);
        
        drawText(info.label, colX + 10, currentY, {
          fontSize: 8,
          color: '#333333',
          bold: true
        });
        
        drawText(info.value, colX + 90, currentY, {
          fontSize: 8,
          color: '#666666'
        });

        // Línea punteada entre items
        if (index < userInfo.length - 1) {
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


    // Detalle de teléfonos asignados - Columna 1
    if (data.telefonos && data.telefonos.length > 0) {
        drawText('Detalle de Teléfonos Asignados', colX, colY, {
            fontSize: 11,
            color: '#333333',
            bold: true
        });

        colY += 15;

        // Encabezados de tabla
        const headers = ['Número', 'Marca/Modelo', 'IP', 'MAC', 'Línea'];
        const columnWidths = [
            columnWidth * 0.20,
            columnWidth * 0.25,
            columnWidth * 0.20,
            columnWidth * 0.23,
            columnWidth * 0.12
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

        // Filas de teléfonos
        data.telefonos.forEach((telefono, index) => {
            // Fondo alternado para filas
            if (index % 2 === 0) {
                doc.rect(colX, colY, columnWidth, 15)
                   .fillColor('#f8f9fa')
                   .fill();
            }

            let cellX = colX;

            doc.fillColor('#333')
               .fontSize(6);

            // Número
            doc.text(telefono.num_telefono || 'N/A', cellX + 2, colY + 4, { 
                width: columnWidths[0] - 4 
            });
            cellX += columnWidths[0];

            // Marca/Modelo
            const equipoTexto = `${telefono.stockEquipo.marca || 'N/A'} ${telefono.stockEquipo.modelo || ''}`;
            doc.text(equipoTexto, cellX + 2, colY + 4, { 
                width: columnWidths[1] - 4 
            });
            cellX += columnWidths[1];

            // IP
            doc.text(telefono.ip_telefono || 'N/A', cellX + 2, colY + 4, { 
                width: columnWidths[2] - 4 
            });
            cellX += columnWidths[2];

            // MAC
            doc.text(telefono.mac_telefono || 'N/A', cellX + 2, colY + 4, { 
                width: columnWidths[3] - 4 
            });
            cellX += columnWidths[3];

            // Línea
            doc.text(telefono.linea_telefono || 'N/A', cellX + 2, colY + 4, { 
                width: columnWidths[4] - 4 
            });

            colY += 15;
        });

        // Bordes de la tabla
        doc.rect(colX, colY - (data.telefonos.length * 15), columnWidth, (data.telefonos.length * 15) + 12)
           .strokeColor('#000')
           .lineWidth(0.5)
           .stroke();

        colY += 20;
    }

    // Firmas - Columna 1
    const firmaHeight = 65;
    const firmaWidth = (columnWidth - 20) / 2;

    // Firma Usuario
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
    
    drawText(`${usuario.nombre} ${usuario.apellido}`, colX + 5 + (firmaWidth / 2), colY + 45, {
      fontSize: 9,
      color: '#333333',
      align: 'center',
      bold: true
    });
    
    drawText('Usuario', colX + 5 + (firmaWidth / 2), colY + 55, {
      fontSize: 8,
      color: '#666666',
      align: 'center'
    });

    // Firma Tecnología
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
    
    drawText('Departamento de Tecnología', colX + 10 + firmaWidth + (firmaWidth / 2), colY + 45, {
      fontSize: 9,
      color: '#333333',
      align: 'center',
      bold: true
    });
    
    drawText('FRITZ C.A', colX + 10 + firmaWidth + (firmaWidth / 2), colY + 55, {
      fontSize: 8,
      color: '#666666',
      align: 'center'
    });

    colY += firmaHeight + 15;

    // Footer - Columna 1
    doc.moveTo(colX, colY)
       .lineTo(colX + columnWidth, colY)
       .lineWidth(1)
       .strokeColor('#dddddd')
       .stroke();
    
    drawText('FRITZ C.A - Sistema de Gestión de Teléfonos', colX + (columnWidth / 2), colY + 10, {
      fontSize: 8,
      color: '#666666',
      align: 'center'
    });

    // Número de documento
    drawText('Doc:' + data.numeroDocumento, colX + columnWidth - 10, colY + 10, {
      fontSize: 8,
      color: '#666666',
      align: 'right'
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

    drawText('FRITZ C.A', colX + (columnWidth / 2), colY + 5, {
      fontSize: 16,
      color: '#DC2626',
      align: 'center',
      bold: true
    });
    
    drawText(data.titulo, colX + (columnWidth / 2), colY + 20, {
      fontSize: 14,
      color: '#666666',
      align: 'center',
      bold: true
    });

    colY += 40;

    drawText(`Generado el: ${data.fecha}`, colX + (columnWidth / 2), colY, {
      fontSize: 10,
      color: '#000000',
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

    // Información del usuario - Columna 2
    doc.rect(colX, colY, columnWidth, 25)
       .fillColor('#f8f9fa')
       .fill();
    
    doc.rect(colX, colY, columnWidth, 25)
       .strokeColor('#000000')
       .lineWidth(1)
       .stroke();

    drawText('Información del Usuario', colX + 10, colY + 8, {
      fontSize: 12,
      color: '#333333',
      bold: true
    });

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

    // Datos del usuario - Columna 2 (mismos datos)
    userInfo.forEach((info, index) => {
        const currentY = infoY + (index * infoItemHeight);
        
        drawText(info.label, colX + 10, currentY, {
          fontSize: 8,
          color: '#333333',
          bold: true
        });
        
        drawText(info.value, colX + 90, currentY, {
          fontSize: 8,
          color: '#666666'
        });

        // Línea punteada entre items
        if (index < userInfo.length - 1) {
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

   
    // Detalle de teléfonos asignados - Columna 2
    if (data.telefonos && data.telefonos.length > 0) {
        drawText('Detalle de Teléfonos Asignados', colX, colY, {
            fontSize: 11,
            color: '#333333',
            bold: true
        });

        colY += 15;

        // Encabezados de tabla
        const headers = ['Número', 'Marca/Modelo', 'IP', 'MAC', 'Línea'];
        const columnWidths = [
            columnWidth * 0.20,
            columnWidth * 0.25,
            columnWidth * 0.20,
            columnWidth * 0.23,
            columnWidth * 0.12
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

        // Filas de teléfonos
        data.telefonos.forEach((telefono, index) => {
            // Fondo alternado para filas
            if (index % 2 === 0) {
                doc.rect(colX, colY, columnWidth, 15)
                   .fillColor('#f8f9fa')
                   .fill();
            }

            let cellX = colX;

            doc.fillColor('#333')
               .fontSize(6);

            // Número
            doc.text(telefono.num_telefono || 'N/A', cellX + 2, colY + 4, { 
                width: columnWidths[0] - 4 
            });
            cellX += columnWidths[0];

            // Marca/Modelo
            const equipoTexto = `${telefono.stockEquipo.marca || 'N/A'} ${telefono.stockEquipo.modelo || ''}`;
            doc.text(equipoTexto, cellX + 2, colY + 4, { 
                width: columnWidths[1] - 4 
            });
            cellX += columnWidths[1];

            // IP
            doc.text(telefono.ip_telefono || 'N/A', cellX + 2, colY + 4, { 
                width: columnWidths[2] - 4 
            });
            cellX += columnWidths[2];

            // MAC
            doc.text(telefono.mac_telefono || 'N/A', cellX + 2, colY + 4, { 
                width: columnWidths[3] - 4 
            });
            cellX += columnWidths[3];

            // Línea
            doc.text(telefono.linea_telefono || 'N/A', cellX + 2, colY + 4, { 
                width: columnWidths[4] - 4 
            });

            colY += 15;
        });

        // Bordes de la tabla
        doc.rect(colX, colY - (data.telefonos.length * 15), columnWidth, (data.telefonos.length * 15) + 12)
           .strokeColor('#000')
           .lineWidth(0.5)
           .stroke();

        colY += 20;
    }

    // Firmas - Columna 2
    // Firma Usuario
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
    
    drawText(`${usuario.nombre} ${usuario.apellido}`, colX + 5 + (firmaWidth / 2), colY + 45, {
      fontSize: 9,
      color: '#333333',
      align: 'center',
      bold: true
    });
    
    drawText('Usuario', colX + 5 + (firmaWidth / 2), colY + 55, {
      fontSize: 8,
      color: '#666666',
      align: 'center'
    });

    // Firma Tecnología
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
    
    drawText('Departamento de Tecnología', colX + 10 + firmaWidth + (firmaWidth / 2), colY + 45, {
      fontSize: 9,
      color: '#333333',
      align: 'center',
      bold: true
    });
    
    drawText('FRITZ C.A', colX + 10 + firmaWidth + (firmaWidth / 2), colY + 55, {
      fontSize: 8,
      color: '#666666',
      align: 'center'
    });

    colY += firmaHeight + 15;

    // Footer - Columna 2
    doc.moveTo(colX, colY)
       .lineTo(colX + columnWidth, colY)
       .lineWidth(1)
       .strokeColor('#dddddd')
       .stroke();
    
    drawText('FRITZ C.A - Sistema de Gestión de Teléfonos', colX + (columnWidth / 2), colY + 10, {
      fontSize: 8,
      color: '#666666',
      align: 'center'
    });

    // Número de documento
    drawText('Doc: TEL-' + data.numeroDocumento, colX + columnWidth - 10, colY + 10, {
      fontSize: 8,
      color: '#666666',
      align: 'right'
    });
    doc.end();

    console.log('=== PDF DE TELÉFONOS POR USUARIO GENERADO EXITOSAMENTE ===');
    console.log(`Número de documento: TEL-${numeroDocumento}`);

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

    console.log('Generando PDF con PDFKit...');
    
    // Crear documento PDF
    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'portrait',
      margins: {
        top: 50,
        bottom: 50,
        left: 50,
        right: 50
      }
    });

    // Configurar headers de respuesta
    const filename = `reporte-telefonos-general-${new Date().toISOString().split('T')[0]}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Pipe del PDF a la respuesta
    doc.pipe(res);

    // Dimensiones
    const margin = 50;
    const pageWidth = 500;
    let yPosition = margin;

    // DECLARAR fecha AL INICIO para que esté disponible en todo el scope
    const fecha = new Date().toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // HEADER - Usando métodos directos de PDFDocument
    // Título principal
    doc.fontSize(18)
       .font('Helvetica-Bold')
       .fillColor('#DC2626')
       .text('FRITZ C.A', margin, yPosition, { 
         width: pageWidth, 
         align: 'center' 
       });
    
    yPosition += 25;

    // Subtítulo
    doc.fontSize(12)
       .font('Helvetica')
       .fillColor('#666666')
       .text(titulo, margin, yPosition, { 
         width: pageWidth, 
         align: 'center' 
       });
    
    yPosition += 30;

    // Línea separadora
    doc.moveTo(margin, yPosition)
       .lineTo(margin + pageWidth, yPosition)
       .lineWidth(2)
       .strokeColor('#DC2626')
       .stroke();
    
    yPosition += 20;

    // INFORMACIÓN GENERAL
    doc.rect(margin, yPosition, pageWidth, 60)
       .fillColor('#f5f5f5')
       .fill();
    
    // Fecha de generación
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#333333')
       .text('Fecha de generación:', margin + 10, yPosition + 10);
    
    doc.font('Helvetica')
       .text(fecha, margin + 200, yPosition + 10);
    
    // Total de teléfonos
    doc.font('Helvetica-Bold')
       .text('Total de teléfonos:', margin + 10, yPosition + 25);
    
    doc.font('Helvetica')
       .text(totalTelefonos.toString(), margin + 200, yPosition + 25);
    

    
    yPosition += 70;

    // TABLA DE TELÉFONOS
    if (telefonosProcesados.length > 0) {
      // Título de la tabla
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor('#000000')
         .text('LISTA DE TELÉFONOS ASIGNADOS', margin, yPosition, { 
           width: pageWidth, 
           align: 'center' 
         });
      
      yPosition += 20;

      // Encabezados de la tabla
      const headers = ['Teléfono', 'Usuario', 'Cargo', 'Sede', 'Depto', 'Marca/Modelo', 'IP', 'MAC', 'Estado'];
      const colWidths = [45, 60, 50, 50, 50, 60, 55, 75, 30];
      
      // Fondo del encabezado
      doc.rect(margin, yPosition, pageWidth, 15)
         .fillColor('#DC2626')
         .fill();
      
      // Texto del encabezado
      let x = margin;
      doc.fontSize(8)
         .font('Helvetica-Bold')
         .fillColor('#ffffff');
      
      headers.forEach((header, i) => {
        doc.text(header, x + 2, yPosition + 4, {
          width: colWidths[i] - 4,
          align: 'left'
        });
        x += colWidths[i];
      });
      
      yPosition += 20;

      // Filas de datos
      telefonosProcesados.forEach((telefono, index) => {
        // Verificar si necesita nueva página
        if (yPosition > 700) {
          doc.addPage();
          yPosition = margin;
          
          // Redibujar encabezados en nueva página
          doc.rect(margin, yPosition, pageWidth, 15)
             .fillColor('#DC2626')
             .fill();
          
          let headerX = margin;
          doc.fontSize(8)
             .font('Helvetica-Bold')
             .fillColor('#ffffff');
          
          headers.forEach((header, i) => {
            doc.text(header, headerX + 2, yPosition + 4, {
              width: colWidths[i] - 4,
              align: 'left'
            });
            headerX += colWidths[i];
          });
          
          yPosition += 20;
        }

        // Fondo alternado para filas
        if (index % 2 === 0) {
          doc.rect(margin, yPosition, pageWidth, 12)
             .fillColor('#f9f9f9')
             .fill();
        }

        // Determinar estado y color
        const estado = telefono.usuario && telefono.usuario.nombre ? 'Asignado' : 'Sin asignar';
        const estadoColor = estado === 'Asignado' ? '#155724' : '#666666';

        // Datos de la fila
        const rowData = [
          telefono.num_telefono || 'N/A',
          telefono.usuario && telefono.usuario.nombre ? 
            `${telefono.usuario.nombre.substring(0, 15)} ${telefono.usuario.apellido?.substring(0, 1) || ''}.` : '-',
          (telefono.usuario?.cargo || '-').substring(0, 12),
          (telefono.usuario?.sede?.nombre || '-').substring(0, 12),
          (telefono.usuario?.departamento?.nombre || '-').substring(0, 12),
          telefono.stockEquipo ? 
            `${telefono.stockEquipo.marca?.substring(0, 10) || ''} ${telefono.stockEquipo.modelo?.substring(0, 8) || ''}`.trim() : 'N/A',
          (telefono.ip_telefono || 'N/A').substring(0, 12),
          (telefono.mac_telefono || 'N/A').substring(0, 15),
          estado
        ];

        let x = margin;
        doc.fontSize(7)
           .font('Helvetica');
        
        rowData.forEach((text, i) => {
          // Aplicar color especial para estado
          if (i === 8) {
            doc.fillColor(estadoColor);
          } else {
            doc.fillColor('#000000');
          }
          
          doc.text(text, x + 2, yPosition + 2, {
            width: colWidths[i] - 4,
            align: 'left'
          });
          
          x += colWidths[i];
        });

        yPosition += 15;

        // Línea separadora entre filas
        doc.moveTo(margin, yPosition)
           .lineTo(margin + pageWidth, yPosition)
           .lineWidth(0.8)
           .strokeColor('#cccccc')
           .stroke();
        
        yPosition += 3;
      });
    } else {
      // Mensaje cuando no hay teléfonos
      yPosition += 20;
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .fillColor('#666666')
         .text('No hay teléfonos registrados', margin, yPosition, { 
           width: pageWidth, 
           align: 'center' 
         });
      
      yPosition += 20;
      doc.fontSize(10)
         .font('Helvetica')
         .text('No se encontraron teléfonos con los filtros aplicados', margin, yPosition, { 
           width: pageWidth, 
           align: 'center' 
         });
      
      yPosition += 40;
    }

    // PIE DE PÁGINA
    const footerY = 700;
    doc.moveTo(margin, footerY)
       .lineTo(margin + pageWidth, footerY)
       .lineWidth(1)
       .strokeColor('#cccccc')
       .stroke();
    
    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#666666')
       .text('Sistema de Gestión de Teléfonos - FRITZ C.A', margin, footerY + 10, { 
         width: pageWidth, 
         align: 'center' 
       });
    
    doc.text(`Generado el: ${fecha}`, margin, footerY + 20, { 
      width: pageWidth, 
      align: 'center' 
    });

    // Finalizar documento
    doc.end();

    console.log('PDF general de teléfonos generado exitosamente con PDFKit');

  } catch (error) {
    console.error('Error generando PDF general:', error);

    res.status(500).json({ 
      error: 'Error generando PDF', 
      detalles: error.message 
    });
  }
}
};