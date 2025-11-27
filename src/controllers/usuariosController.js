import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import PDFKitGenerator from '../services/PDFKitGenerator.js';
import { renderTemplate } from '../helpers/renderHelper.js';
import FileUploadService from '../services/fileUploadService.js';
import multer from 'multer';


const CARGOS_PERMITIDOS = [
  'Gerente',
  'Jefe',
  'Analista',
  'Especialista',
  'Becario',
  'Pasante',
  'Coordinador',
  'Supervisor',
  'Auxiliar'
];

const USUARIOS_COMPROBANTE_PATH = 'usuarios/comprobantes';

export const usuariosController = {
  async index(req, res) {
    try {
      console.log(' Iniciando carga de usuarios con filtros...');

      const page = parseInt(req.query.page) || 1;
      const limit = 10;
      const skip = (page - 1) * limit;

      const { nombre, cargo, sede, rdp } = req.query;

      console.log('Filtros recibidos:', { nombre, cargo, sede, rdp });

      let whereClause = {};

      if (nombre) {
        whereClause.OR = [
          { nombre: { contains: nombre, mode: 'insensitive' } },
          { apellido: { contains: nombre, mode: 'insensitive' } }
        ];
      }

      if (cargo) {
        const cargosCoincidentes = CARGOS_PERMITIDOS.filter(c =>
          c.toLowerCase().includes(cargo.toLowerCase())
        );

        if (cargosCoincidentes.length > 0) {
          whereClause.cargo = { in: cargosCoincidentes };
        } else {
          whereClause.cargo = { in: [] };
        }
      }


      if (sede) {
        whereClause.sede = {
          nombre: { contains: sede, mode: 'insensitive' }
        };
      }

      if (rdp) {
        whereClause.OR = [
          ...(whereClause.OR || []),
          { rdpfis: { contains: rdp, mode: 'insensitive' } },
          { rdpfin: { contains: rdp, mode: 'insensitive' } }
        ];

        if (!whereClause.OR) {
          whereClause.OR = [
            { rdpfis: { contains: rdp, mode: 'insensitive' } },
            { rdpfin: { contains: rdp, mode: 'insensitive' } }
          ];
        }
      }

      console.log('Where clause:', JSON.stringify(whereClause, null, 2));

      const usuariosCount = await prisma.usuarios.count({
        where: whereClause
      });

      console.log(`Total de usuarios con filtros: ${usuariosCount}`);

      const usuarios = await prisma.usuarios.findMany({
        where: whereClause,
        skip,
        take: limit,
        select: {
          id: true,
          nombre: true,
          apellido: true,
          cargo: true,
          correo: true,
          rdpfis: true,
          rdpfin: true,
          descripcion: true,
          created_at: true,
          updated_at: true,
          sede: {
            select: {
              id: true,
              nombre: true
            }
          },
          departamento: {
            select: {
              id: true,
              nombre: true
            }
          }
        },
        orderBy: { id: 'asc' }
      });

      console.log(`Usuarios encontrados: ${usuarios.length}`);

      const usuariosConCount = await Promise.all(
        usuarios.map(async (usuario) => {
          try {
            const equipos_totales_count = await prisma.equipo_asignado.count({
              where: { usuarios_id: usuario.id }
            });

            const equipos_activos_count = await prisma.equipo_asignado.count({
              where: {
                usuarios_id: usuario.id,
                estado: 'activo'
              }
            });

            const equipos_devueltos_count = await prisma.equipo_asignado.count({
              where: {
                usuarios_id: usuario.id,
                estado: 'devuelto'
              }
            });

            return {
              ...usuario,
              equipos_totales_count,
              equipos_activos_count,
              equipos_devueltos_count
            };
          } catch (error) {
            console.error(`Error contando equipos para usuario ${usuario.id}:`, error);
            return {
              ...usuario,
              equipos_totales_count: 0,
              equipos_activos_count: 0,
              equipos_devueltos_count: 0
            };
          }
        })
      );

      const sedes = await prisma.sedes.findMany({
        select: { id: true, nombre: true }
      });

      const departamentos = await prisma.departamentos.findMany({
        select: { id: true, nombre: true }
      });

      console.log('Datos cargados correctamente con filtros');

      res.json({
        usuarios: usuariosConCount,
        sedes,
        departamentos,
        cargosPermitidos: CARGOS_PERMITIDOS,
        pagination: {
          current: page,
          total: Math.ceil(usuariosCount / limit),
          totalRecords: usuariosCount
        }
      });
    } catch (error) {
      console.error('ERROR en index usuarios:', error);
      res.status(500).json({
        error: 'Error al cargar usuarios',
        message: error.message,
        details: error.code
      });
    }
  },

  async store(req, res) {
    console.log('=== INICIANDO STORE USUARIO ===');
    try {
      const {
        nombre,
        apellido,
        cargo,
        correo,
        sede_id,
        departamento_id,
        rdpfis,
        rdpfin,
        descripcion
      } = req.body;

      console.log('Datos recibidos:', req.body);

      if (!nombre || !cargo || !sede_id || !departamento_id) {
        return res.status(400).json({
          error: 'Campos obligatorios faltantes',
          message: 'Nombre, cargo, sede y departamento son obligatorios'
        });
      }

      if (!CARGOS_PERMITIDOS.includes(cargo)) {
        return res.status(400).json({
          error: 'Cargo no válido',
          message: `El cargo debe ser uno de: ${CARGOS_PERMITIDOS.join(', ')}`,
          cargosPermitidos: CARGOS_PERMITIDOS
        });
      }

      if (correo) {
        const usuarioConCorreo = await prisma.usuarios.findFirst({
          where: { correo }
        });
        if (usuarioConCorreo) {
          return res.status(400).json({
            error: 'Correo ya registrado',
            message: 'El correo electrónico ya está registrado en el sistema'
          });
        }
      }

      if (rdpfis) {
        const usuarioConRdpfis = await prisma.usuarios.findFirst({
          where: { rdpfis }
        });
        if (usuarioConRdpfis) {
          return res.status(400).json({
            error: 'RDP Físico ya registrado',
            message: 'El RDP Físico ya está registrado en el sistema'
          });
        }
      }

      if (rdpfin) {
        const usuarioConRdpfin = await prisma.usuarios.findFirst({
          where: { rdpfin }
        });
        if (usuarioConRdpfin) {
          return res.status(400).json({
            error: 'RDP Financiero ya registrado',
            message: 'El RDP Financiero ya está registrado en el sistema'
          });
        }
      }

      console.log('Creando nuevo usuario...');
      const usuario = await prisma.usuarios.create({
        data: {
          nombre: nombre.trim(),
          apellido: apellido?.trim(),
          cargo: cargo,
          correo: correo?.trim(),
          rdpfis: rdpfis?.trim(),
          rdpfin: rdpfin?.trim(),
          descripcion: descripcion?.trim(),
          sede_id: parseInt(sede_id),
          departamento_id: parseInt(departamento_id)
        },
        select: {
          id: true,
          nombre: true,
          apellido: true,
          cargo: true,
          correo: true,
          rdpfis: true,
          rdpfin: true,
          descripcion: true,
          created_at: true,
          sede: {
            select: {
              id: true,
              nombre: true
            }
          },
          departamento: {
            select: {
              id: true,
              nombre: true
            }
          }
        }
      });

      console.log('USUARIO CREADO EXITOSAMENTE - ID:', usuario.id);

      res.status(201).json({
        message: 'Usuario creado exitosamente.',
        usuario
      });
    } catch (error) {
      console.error('ERROR en store:', error);

      if (error.code === 'P2000' || error.message.includes('enum')) {
        return res.status(400).json({
          error: 'Cargo no válido',
          message: `El cargo debe ser uno de: ${CARGOS_PERMITIDOS.join(', ')}`,
          cargosPermitidos: CARGOS_PERMITIDOS
        });
      }

      res.status(500).json({
        error: 'Error al crear usuario',
        message: error.message
      });
    }
  },

  async show(req, res) {
    try {
      const { id } = req.params;
      console.log(`Buscando usuario ID: ${id}`);

      const usuario = await prisma.usuarios.findUnique({
        where: { id: parseInt(id) },
        select: {
          id: true,
          nombre: true,
          apellido: true,
          cargo: true,
          correo: true,
          rdpfis: true,
          rdpfin: true,
          descripcion: true,
          comprobante: true,
          created_at: true,
          updated_at: true,
          sede: {
            select: {
              id: true,
              nombre: true
            }
          },
          departamento: {
            select: {
              id: true,
              nombre: true
            }
          }
        }
      });

      if (!usuario) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      const usuarioConComprobante = {
        ...usuario,
        comprobante_url: usuario.comprobante ? `/uploads/${usuario.comprobante}` : null
      };

      console.log('Comprobante URL generada:', usuarioConComprobante.comprobante_url);

      const equipos_totales_count = await prisma.equipo_asignado.count({
        where: { usuarios_id: usuario.id }
      });

      const equipos_activos_count = await prisma.equipo_asignado.count({
        where: {
          usuarios_id: usuario.id,
          estado: 'activo'
        }
      });

      const usuarioConCount = {
        ...usuarioConComprobante,
        equipos_totales_count,
        equipos_activos_count
      };

      res.json(usuarioConCount);
    } catch (error) {
      console.error('ERROR en show:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const {
        nombre,
        apellido,
        cargo,
        correo,
        sede_id,
        departamento_id,
        rdpfis,
        rdpfin,
        descripcion,
        delete_comprobante
      } = req.body;

      console.log('Actualizando usuario ID:', id, 'RDPFis:', rdpfis, 'RDPFin:', rdpfin);

      if (cargo && !CARGOS_PERMITIDOS.includes(cargo)) {
        return res.status(400).json({
          error: 'Cargo no válido',
          message: `El cargo debe ser uno de: ${CARGOS_PERMITIDOS.join(', ')}`,
          cargosPermitidos: CARGOS_PERMITIDOS
        });
      }

      const usuarioExistente = await prisma.usuarios.findUnique({
        where: { id: parseInt(id) }
      });

      if (!usuarioExistente) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      if (correo) {
        const usuarioConCorreo = await prisma.usuarios.findFirst({
          where: {
            correo,
            NOT: { id: parseInt(id) }
          }
        });
        if (usuarioConCorreo) {
          return res.status(400).json({
            error: 'Correo ya registrado',
            message: 'El correo electrónico ya está registrado por otro usuario'
          });
        }
      }

      if (rdpfis) {
        const usuarioConRdpfis = await prisma.usuarios.findFirst({
          where: {
            rdpfis,
            NOT: { id: parseInt(id) }
          }
        });
        if (usuarioConRdpfis) {
          return res.status(400).json({
            error: 'RDP Físico ya registrado',
            message: 'El RDP Físico ya está registrado por otro usuario'
          });
        }
      }

      if (rdpfin) {
        const usuarioConRdpfin = await prisma.usuarios.findFirst({
          where: {
            rdpfin,
            NOT: { id: parseInt(id) }
          }
        });
        if (usuarioConRdpfin) {
          return res.status(400).json({
            error: 'RDP Financiero ya registrado',
            message: 'El RDP Financiero ya está registrado por otro usuario'
          });
        }
      }

      let comprobantePath = usuarioExistente.comprobante;

      if (delete_comprobante === 'true') {
        if (usuarioExistente.comprobante) {
          await FileUploadService.deleteFile(usuarioExistente.comprobante);
        }
        comprobantePath = null;
      }

      if (req.file) {
        console.log('Procesando comprobante para usuario...');

        try {
          FileUploadService.validateImage(req.file);
        } catch (error) {
          return res.status(400).json({
            error: 'Archivo no válido',
            message: error.message
          });
        }

        if (usuarioExistente.comprobante) {
          await FileUploadService.deleteFile(usuarioExistente.comprobante);
        }

        comprobantePath = await FileUploadService.uploadFile(req.file, 'usuarios/comprobantes');
        console.log('Comprobante subido:', comprobantePath);
      }

      const usuario = await prisma.usuarios.update({
        where: { id: parseInt(id) },
        data: {
          nombre: nombre?.trim(),
          apellido: apellido?.trim(),
          cargo: cargo?.trim(),
          correo: correo?.trim(),
          rdpfis: rdpfis?.trim(),
          rdpfin: rdpfin?.trim(),
          descripcion: descripcion?.trim(),
          comprobante: comprobantePath,
          sede_id: sede_id ? parseInt(sede_id) : undefined,
          departamento_id: departamento_id ? parseInt(departamento_id) : undefined
        },
        select: {
          id: true,
          nombre: true,
          apellido: true,
          cargo: true,
          correo: true,
          rdpfis: true,
          rdpfin: true,
          descripcion: true,
          comprobante: true,
          updated_at: true,
          sede: {
            select: {
              id: true,
              nombre: true
            }
          },
          departamento: {
            select: {
              id: true,
              nombre: true
            }
          }
        }
      });

      res.json({
        message: 'Usuario actualizado exitosamente.',
        usuario
      });
    } catch (error) {
      console.error('ERROR en update:', error);

      if (error.code === 'P2000' || error.message.includes('enum')) {
        return res.status(400).json({
          error: 'Cargo no válido',
          message: `El cargo debe ser uno de: ${CARGOS_PERMITIDOS.join(', ')}`,
          cargosPermitidos: CARGOS_PERMITIDOS
        });
      }

      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            error: 'Archivo demasiado grande',
            message: 'El archivo no puede ser mayor a 5MB'
          });
        }
      }

      res.status(500).json({ error: error.message });
    }
  },

  async destroy(req, res) {
    try {
      const { id } = req.params;
      console.log(`Eliminando usuario ID: ${id}`);

      const usuarioExistente = await prisma.usuarios.findUnique({
        where: { id: parseInt(id) }
      });

      if (!usuarioExistente) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      const equiposActivos = await prisma.equipo_asignado.count({
        where: {
          usuarios_id: parseInt(id),
          estado: 'activo'
        }
      });

      if (equiposActivos > 0) {
        return res.status(400).json({
          error: 'No se puede eliminar el usuario porque tiene equipos activos asignados.'
        });
      }

      if (usuarioExistente.comprobante) {
        await FileUploadService.deleteFile(usuarioExistente.comprobante);
      }


      await prisma.usuarios.delete({
        where: { id: parseInt(id) }
      });

      console.log('Usuario eliminado exitosamente');
      res.json({ message: 'Usuario eliminado exitosamente.' });
    } catch (error) {
      console.error('ERROR en destroy:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async getBySede(req, res) {
    try {
      const { sedeId } = req.params;
      const usuarios = await prisma.usuarios.findMany({
        where: { sede_id: parseInt(sedeId) },
        include: {
          departamento: true
        }
      });

      const usuariosConCount = await Promise.all(
        usuarios.map(async (usuario) => {
          const equipos_totales_count = await prisma.equipo_asignado.count({
            where: { usuarios_id: usuario.id }
          });

          const equipos_activos_count = await prisma.equipo_asignado.count({
            where: {
              usuarios_id: usuario.id,
              estado: 'activo'
            }
          });

          const equipos_devueltos_count = await prisma.equipo_asignado.count({
            where: {
              usuarios_id: usuario.id,
              estado: 'devuelto'
            }
          });

          return {
            ...usuario,
            equipos_totales_count,
            equipos_activos_count,
            equipos_devueltos_count
          };
        })
      );

      res.json(usuariosConCount);
    } catch (error) {
      console.error('ERROR en getBySede:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async getByDepartamento(req, res) {
    try {
      const { departamentoId } = req.params;
      const usuarios = await prisma.usuarios.findMany({
        where: { departamento_id: parseInt(departamentoId) },
        include: {
          sede: true
        }
      });

      const usuariosConCount = await Promise.all(
        usuarios.map(async (usuario) => {
          const equipos_totales_count = await prisma.equipo_asignado.count({
            where: { usuarios_id: usuario.id }
          });

          const equipos_activos_count = await prisma.equipo_asignado.count({
            where: {
              usuarios_id: usuario.id,
              estado: 'activo'
            }
          });

          const equipos_devueltos_count = await prisma.equipo_asignado.count({
            where: {
              usuarios_id: usuario.id,
              estado: 'devuelto'
            }
          });

          return {
            ...usuario,
            equipos_totales_count,
            equipos_activos_count,
            equipos_devueltos_count
          };
        })
      );

      res.json(usuariosConCount);
    } catch (error) {
      console.error('ERROR en getByDepartamento:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async search(req, res) {
    try {
      const { query } = req.query;

      if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
      }

      const usuarios = await prisma.usuarios.findMany({
        where: {
          OR: [
            { nombre: { contains: query, mode: 'insensitive' } },
            { apellido: { contains: query, mode: 'insensitive' } },
            { cargo: { contains: query, mode: 'insensitive' } },
            { correo: { contains: query, mode: 'insensitive' } },
            { rdpfis: { contains: query, mode: 'insensitive' } },
            { rdpfin: { contains: query, mode: 'insensitive' } },
            { descripcion: { contains: query, mode: 'insensitive' } }
          ]
        },
        include: {
          sede: true,
          departamento: true
        }
      });

      const usuariosConCount = await Promise.all(
        usuarios.map(async (usuario) => {
          const equipos_totales_count = await prisma.equipo_asignado.count({
            where: { usuarios_id: usuario.id }
          });

          const equipos_activos_count = await prisma.equipo_asignado.count({
            where: {
              usuarios_id: usuario.id,
              estado: 'activo'
            }
          });

          const equipos_devueltos_count = await prisma.equipo_asignado.count({
            where: {
              usuarios_id: usuario.id,
              estado: 'devuelto'
            }
          });

          return {
            ...usuario,
            equipos_totales_count,
            equipos_activos_count,
            equipos_devueltos_count
          };
        })
      );

      res.json(usuariosConCount);
    } catch (error) {
      console.error('ERROR en search:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async getEstadisticas(req, res) {
    try {
      const totalUsuarios = await prisma.usuarios.count();

      const usuariosConEquipos = await prisma.usuarios.count({
        where: {
          equipo_asignado: {
            some: {}
          }
        }
      });

      const usuariosSinEquipos = totalUsuarios - usuariosConEquipos;

      const usuariosPorSede = await prisma.usuarios.groupBy({
        by: ['sede_id'],
        _count: {
          id: true
        }
      });

      const usuariosPorDepartamento = await prisma.usuarios.groupBy({
        by: ['departamento_id'],
        _count: {
          id: true
        }
      });

      const sedes = await prisma.sedes.findMany({
        where: {
          id: {
            in: usuariosPorSede.map(item => item.sede_id)
          }
        }
      });

      const departamentos = await prisma.departamentos.findMany({
        where: {
          id: {
            in: usuariosPorDepartamento.map(item => item.departamento_id)
          }
        }
      });

      const usuariosPorSedeConNombre = usuariosPorSede.map(item => ({
        sede_id: item.sede_id,
        total: item._count.id,
        sede: sedes.find(s => s.id === item.sede_id) || { nombre: 'No encontrada' }
      }));

      const usuariosPorDepartamentoConNombre = usuariosPorDepartamento.map(item => ({
        departamento_id: item.departamento_id,
        total: item._count.id,
        departamento: departamentos.find(d => d.id === item.departamento_id) || { nombre: 'No encontrado' }
      }));

      res.json({
        total_usuarios: totalUsuarios,
        usuarios_con_equipos: usuariosConEquipos,
        usuarios_sin_equipos: usuariosSinEquipos,
        usuarios_por_sede: usuariosPorSedeConNombre,
        usuarios_por_departamento: usuariosPorDepartamentoConNombre
      });
    } catch (error) {
      console.error('ERROR en getEstadisticas:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async apiIndex(req, res) {
    try {
      const usuarios = await prisma.usuarios.findMany({
        select: {
          id: true,
          nombre: true,
          apellido: true,
          cargo: true,
          correo: true,
          rdpfis: true,
          rdpfin: true,
          descripcion: true,
          sede: {
            select: {
              id: true,
              nombre: true
            }
          },
          departamento: {
            select: {
              id: true,
              nombre: true
            }
          }
        },
        orderBy: { id: 'asc' }
      });

      console.log('Usuarios cargados para API:', usuarios.length);
      res.json(usuarios);
    } catch (error) {
      console.error('Error en apiIndex usuarios:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async apiShow(req, res) {
    try {
      const { id } = req.params;
      const usuario = await prisma.usuarios.findUnique({
        where: { id: parseInt(id) },
        include: {
          sede: true,
          departamento: true
        }
      });

      if (!usuario) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      res.json(usuario);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async generarPdf(req, res) {
    console.log('=== GENERAR PDF USUARIOS INICIADO ===');

    try {
      const usuarios = await prisma.usuarios.findMany({
        include: {
          sede: {
            select: { nombre: true }
          },
          departamento: {
            select: { nombre: true }
          }
        },
        orderBy: { id: 'asc' }
      });

      console.log('Usuarios encontrados:', usuarios.length);

      const usuariosConContadores = await Promise.all(
        usuarios.map(async (usuario) => {
          const equipos_totales_count = await prisma.equipo_asignado.count({
            where: { usuarios_id: usuario.id }
          });

          const equipos_activos_count = await prisma.equipo_asignado.count({
            where: {
              usuarios_id: usuario.id,
              estado: 'activo'
            }
          });

          const equipos_devueltos_count = await prisma.equipo_asignado.count({
            where: {
              usuarios_id: usuario.id,
              estado: 'devuelto'
            }
          });

          return {
            ...usuario,
            equipos_totales_count,
            equipos_activos_count,
            equipos_devueltos_count
          };
        })
      );

      const data = {
        usuarios: usuariosConContadores,
        fechaGeneracion: new Date().toLocaleString('es-ES'),
        totalUsuarios: usuarios.length,
        totalConEquipos: usuariosConContadores.filter(u => u.equipos_activos_count > 0).length,
        totalSinEquipos: usuariosConContadores.filter(u => u.equipos_activos_count === 0).length
      };

      const htmlContent = await renderTemplate(req.app, 'pdfs/usuarios', data);

      const pdfBuffer = await PDFKitGenerator.generatePDF(htmlContent, {
        format: 'Letter',
        landscape: false
      });

      console.log('=== PDF USUARIOS GENERADO EXITOSAMENTE ===');

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="reporte-usuarios.pdf"');
      res.setHeader('Content-Length', pdfBuffer.length);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      res.end(pdfBuffer);

    } catch (error) {
      console.error('ERROR generando PDF de usuarios:', error);
      res.status(500).json({
        error: 'Error al generar el PDF: ' + error.message
      });
    }
  },

  async verPdf(req, res) {
  console.log('=== VER PDF USUARIOS INICIADO ===');

  

  try {
    const usuarios = await prisma.usuarios.findMany({
      include: {
        sede: {
          select: { nombre: true }
        },
        departamento: {
          select: { nombre: true }
        }
      },
      orderBy: { id: 'asc' }
    });

    const usuariosConContadores = await Promise.all(
      usuarios.map(async (usuario) => {
        const equipos_totales_count = await prisma.equipo_asignado.count({
          where: { usuarios_id: usuario.id }
        });

        const equipos_activos_count = await prisma.equipo_asignado.count({
          where: {
            usuarios_id: usuario.id,
            estado: 'activo'
          }
        });

        const equipos_devueltos_count = await prisma.equipo_asignado.count({
          where: {
            usuarios_id: usuario.id,
            estado: 'devuelto'
          }
        });

        return {
          ...usuario,
          equipos_totales_count,
          equipos_activos_count,
          equipos_devueltos_count
        };
      })
    );

    const data = {
      usuarios: usuariosConContadores,
      fechaGeneracion: new Date().toLocaleString('es-ES'),
      totalUsuarios: usuarios.length,
      totalConEquipos: usuariosConContadores.filter(u => u.equipos_activos_count > 0).length,
      totalSinEquipos: usuariosConContadores.filter(u => u.equipos_activos_count === 0).length
    };

    // Usar PDFKitGenerator - SOLO PASA LOS DATOS, NO EL HTML
    const pdfBuffer = await PDFKitGenerator.generatePDF(null, {
      title: 'Reporte de Usuarios',
      data: data
    });

    console.log('=== VER PDF GENERADO EXITOSAMENTE ===');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="reporte-usuarios.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    res.end(pdfBuffer);

  } catch (error) {
    console.error('ERROR viendo PDF de usuarios:', error);
    res.status(500).json({
      error: 'Error al cargar el PDF: ' + error.message
    });
  }
},

  async usuariosParaSelect(req, res) {
    try {
      console.log('Cargando usuarios para select...');

      const usuarios = await prisma.usuarios.findMany({
        select: {
          id: true,
          nombre: true,
          apellido: true,
          cargo: true,
          correo: true,
          sede: {
            select: {
              id: true,
              nombre: true
            }
          },
          departamento: {
            select: {
              id: true,
              nombre: true
            }
          }
        },
        orderBy: { nombre: 'asc' }
      });

      console.log(`${usuarios.length} usuarios cargados para select`);
      res.json(usuarios);

    } catch (error) {
      console.error('ERROR en usuariosParaSelect:', error);
      res.status(500).json({
        error: 'Error al cargar usuarios',
        message: error.message
      });
    }
  },

  async generarReporteIndividual(req, res) {
    console.log('=== GENERAR REPORTE INDIVIDUAL USUARIO ===');

    try {
      const { id } = req.params;
      console.log(`Generando reporte para usuario ID: ${id}`);

      const usuario = await prisma.usuarios.findUnique({
        where: { id: parseInt(id) },
        include: {
          sede: {
            select: { nombre: true }
          },
          departamento: {
            select: { nombre: true }
          }
        }
      });

      if (!usuario) {
        return res.status(404).json({
          error: 'Usuario no encontrado'
        });
      }

      const equipos_totales_count = await prisma.equipo_asignado.count({
        where: { usuarios_id: parseInt(id) }
      });

      const equipos_activos_count = await prisma.equipo_asignado.count({
        where: {
          usuarios_id: parseInt(id),
          estado: 'activo'
        }
      });

      const equipos_devueltos_count = await prisma.equipo_asignado.count({
        where: {
          usuarios_id: parseInt(id),
          estado: 'devuelto'
        }
      });

      const data = {
        usuario,
        titulo: 'Reporte Individual de Usuario',
        fecha: new Date().toLocaleString('es-ES'),
        numeroDocumento: `${usuario.id}-${Date.now().toString().slice(-6)}`,
        estadisticas: {
          totales: equipos_totales_count,
          activos: equipos_activos_count,
          devueltos: equipos_devueltos_count
        }
      };

      console.log(`Datos preparados para reporte del usuario: ${usuario.nombre} ${usuario.apellido}`);

      const htmlContent = await renderTemplate(req.app, 'pdfs/reporte-usuarios-individual', data);

      const pdfBuffer = await PDFKitGenerator.generatePDF(htmlContent, {
        format: 'Letter',
        landscape: true
      });

      console.log('=== REPORTE INDIVIDUAL GENERADO EXITOSAMENTE ===');

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="reporte-usuario-${usuario.nombre}-${usuario.apellido}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      res.end(pdfBuffer);

    } catch (error) {
      console.error('ERROR generando reporte individual:', error);
      res.status(500).json({
        error: 'Error al generar el reporte: ' + error.message
      });
    }
  },


async verReporteIndividual(req, res) {
    console.log('=== VER REPORTE INDIVIDUAL USUARIO ===');

    try {
        const { id } = req.params;
        console.log(`Viendo reporte para usuario ID: ${id}`);

        const usuario = await prisma.usuarios.findUnique({
            where: { id: parseInt(id) },
            include: {
                sede: {
                    select: { nombre: true }
                },
                departamento: {
                    select: { nombre: true }
                }
            }
        });

        if (!usuario) {
            return res.status(404).json({
                error: 'Usuario no encontrado'
            });
        }

        const equipos_totales_count = await prisma.equipo_asignado.count({
            where: { usuarios_id: parseInt(id) }
        });

        const equipos_activos_count = await prisma.equipo_asignado.count({
            where: {
                usuarios_id: parseInt(id),
                estado: 'activo'
            }
        });

        const equipos_devueltos_count = await prisma.equipo_asignado.count({
            where: {
                usuarios_id: parseInt(id),
                estado: 'devuelto'
            }
        });

        // Obtener contador de documentos
        let contador = await prisma.contador_documentos.findUnique({
            where: { tipo: 'REPORTE_USUARIO' }
        });

        let numeroDocumento;
        
        if (!contador) {
            contador = await prisma.contador_documentos.create({
                data: {
                    tipo: 'REPORTE_USUARIO',
                    valor: 1
                }
            });
            numeroDocumento = '0001';
        } else {
            contador = await prisma.contador_documentos.update({
                where: { tipo: 'REPORTE_USUARIO' },
                data: { 
                    valor: contador.valor + 1,
                    fecha_actualizacion: new Date()
                }
            });
            numeroDocumento = contador.valor.toString().padStart(4, '0');
        }

        const data = {
            usuario,
            titulo: 'Reporte Individual de Usuario',
            fecha: new Date().toLocaleDateString('es-ES', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }),
            numeroDocumento: numeroDocumento,
            estadisticas: {
                totales: equipos_totales_count,
                activos: equipos_activos_count,
                devueltos: equipos_devueltos_count
            }
        };

        // Generar HTML para el PDF
        const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reporte de Usuario - ${usuario.nombre}</title>
    <style>
        @page {
            size: Letter landscape;
            margin: 8mm;
        }
        
        body {
            font-family: 'Arial', sans-serif;
            font-size: 10px;
            line-height: 1.3;
            margin: 0;
            padding: 8px;
            color: #000;
        }
        
        .container {
            display: flex;
            gap: 15px;
            height: 100%;
        }
        
        .columna {
            flex: 1;
            border: 1px solid #000;
            padding: 12px;
            position: relative;
            min-height: 180mm;
        }
        
        .header {
            text-align: center;
            margin-bottom: 15px;
            border-bottom: 1px solid #000;
            padding-bottom: 8px;
            position: relative;
        }
        
        .header h1 {
            font-size: 16px;
            font-weight: bold;
            margin: 0 0 3px 0;
            text-transform: uppercase;
            color: #f73737;
        }
        
        .header h2 {
            font-size: 14px;
            margin: 3px 0;
            color: #666;
        }
        
        .header .fecha {
            font-size: 12px;
            font-weight: normal;
            margin: 0;
        }
        
        .logo-container {
            position: absolute;
            top: 0;
            left: 0;
        }
        
        .logo {
            width: 50px;
            height: 40px;
            object-fit: contain;
        }
        
        .info-usuario {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 15px;
            border-left: 4px solid #DC2626;
            font-size: 10px;
        }
        
        .info-usuario h3 {
            margin: 0 0 10px 0;
            color: #333;
            font-size: 12px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 5px;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }
        
        .info-item {
            margin-bottom: 8px;
            padding: 5px;
            border-bottom: 1px dashed #eee;
        }
        
        .info-item strong {
            color: #333;
            display: block;
            margin-bottom: 2px;
        }
        
        .info-item span {
            color: #666;
        }
        
        .resumen-equipos {
            background: #e9ecef;
            padding: 12px;
            border-radius: 5px;
            margin-bottom: 15px;
            font-size: 10px;
        }
        
        .resumen-equipos h4 {
            margin: 0 0 8px 0;
            color: #333;
            font-size: 11px;
        }
        
        .estadisticas-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin-top: 8px;
        }
        
        .estadistica-item {
            text-align: center;
            padding: 8px;
            background: white;
            border-radius: 4px;
            border: 1px solid #ddd;
        }
        
        .estadistica-valor {
            font-size: 16px;
            font-weight: bold;
            color: #DC2626;
        }
        
        .estadistica-label {
            font-size: 9px;
            color: #666;
        }
        
        .firmas-container {
            margin-top: 30px;
            width: 100%;
        }
        
        .tabla-firmas {
            width: 100%;
            border-collapse: collapse;
        }
        
        .tabla-firmas td {
            width: 50%;
            vertical-align: top;
            padding: 0 10px;
            border: none;
            background: none;
        }
        
        .firma {
            text-align: center;
            width: 100%;
        }
        
        .espacio-firma {
            height: 40px;
            border-bottom: 1px solid #333;
            margin-bottom: 6px;
            width: 100%;
        }
        
        .nombre-firma {
            font-weight: bold;
            margin-bottom: 3px;
            font-size: 9px;
        }
        
        .cargo-firma {
            font-size: 8px;
            color: #666;
            line-height: 1.2;
        }
        
        .footer {
            margin-top: 20px;
            text-align: center;
            font-size: 8px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 8px;
            position: relative;
        }
        
        .numero-documento {
            position: absolute;
            bottom: 5px;
            right: 10px;
            font-size: 8px;
            color: #666;
            font-weight: bold;
        }
        
        .descripcion-container {
            margin-top: 10px;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 5px;
            border: 1px solid #dee2e6;
        }
        
        .descripcion-container strong {
            display: block;
            margin-bottom: 5px;
            color: #333;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Primera columna -->
        <div class="columna">
            <div class="header">
                <div class="logo-container">
                    <!-- Logo placeholder -->
                </div>
                <h1>FRITZ C.A</h1>
                <h2>${data.titulo}</h2>
                <p class="fecha">Generado el: ${data.fecha}</p>
            </div>

            <div class="info-usuario">
                <h3>Información Personal del Usuario</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <strong>ID de Usuario:</strong>
                        <span>${usuario.id}</span>
                    </div>
                    <div class="info-item">
                        <strong>Nombre Completo:</strong>
                        <span>${usuario.nombre} ${usuario.apellido}</span>
                    </div>
                    <div class="info-item">
                        <strong>Cargo:</strong>
                        <span>${usuario.cargo || 'No especificado'}</span>
                    </div>
                    <div class="info-item">
                        <strong>Correo Electrónico:</strong>
                        <span>${usuario.correo || 'No especificado'}</span>
                    </div>
                    <div class="info-item">
                        <strong>RDP Fiscal:</strong>
                        <span>${usuario.rdpfis || 'No asignado'}</span>
                    </div>
                    <div class="info-item">
                        <strong>RDP Financiero:</strong>
                        <span>${usuario.rdpfin || 'No asignado'}</span>
                    </div>
                    <div class="info-item">
                        <strong>Sede:</strong>
                        <span>${usuario.sede ? usuario.sede.nombre : 'No asignada'}</span>
                    </div>
                    <div class="info-item">
                        <strong>Departamento:</strong>
                        <span>${usuario.departamento ? usuario.departamento.nombre : 'No asignado'}</span>
                    </div>
                </div>
                
                ${usuario.descripcion ? `
                <div class="descripcion-container">
                    <strong>Módulos y Descripción:</strong>
                    <span>${usuario.descripcion}</span>
                </div>
                ` : ''}
            </div>

            <div class="resumen-equipos">
                <h4>Resumen de Equipos Asignados</h4>
                <div class="estadisticas-grid">
                    <div class="estadistica-item">
                        <div class="estadistica-valor">${data.estadisticas.totales}</div>
                        <div class="estadistica-label">Total Equipos</div>
                    </div>
                    <div class="estadistica-item">
                        <div class="estadistica-valor">${data.estadisticas.activos}</div>
                        <div class="estadistica-label">Equipos Activos</div>
                    </div>
                    <div class="estadistica-item">
                        <div class="estadistica-valor">${data.estadisticas.devueltos}</div>
                        <div class="estadistica-label">Equipos Devueltos</div>
                    </div>
                </div>
            </div>

            <div class="firmas-container">
                <br>
                <table class="tabla-firmas">
                    <tr>
                        <td>
                            <div class="firma">
                                <div class="espacio-firma"></div>
                                <div class="nombre-firma">${usuario.nombre} ${usuario.apellido}</div>
                                <div class="cargo-firma">Usuario</div>
                            </div>
                        </td>
                        <td>
                            <div class="firma">
                                <div class="espacio-firma"></div>
                                <div class="cargo-firma">Departamento de Tecnología</div>
                                <div class="cargo-firma">FRITZ C.A</div>
                            </div>
                        </td>
                    </tr>
                </table>
            </div>

            <div class="footer">
                <p>FRITZ C.A - Sistema de Gestión de Usuarios</p>
                <div class="numero-documento">Doc: USR-${data.numeroDocumento}</div>
            </div>
        </div>

        <!-- Segunda columna (copia) -->
        <div class="columna">
            <div class="header">
                <div class="logo-container">
                    <!-- Logo placeholder -->
                </div>
                <h1>FRITZ C.A</h1>
                <h2>${data.titulo}</h2>
                <p class="fecha">Generado el: ${data.fecha}</p>
            </div>

            <div class="info-usuario">
                <h3>Información Personal del Usuario</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <strong>ID de Usuario:</strong>
                        <span>${usuario.id}</span>
                    </div>
                    <div class="info-item">
                        <strong>Nombre Completo:</strong>
                        <span>${usuario.nombre} ${usuario.apellido}</span>
                    </div>
                    <div class="info-item">
                        <strong>Cargo:</strong>
                        <span>${usuario.cargo || 'No especificado'}</span>
                    </div>
                    <div class="info-item">
                        <strong>Correo Electrónico:</strong>
                        <span>${usuario.correo || 'No especificado'}</span>
                    </div>
                    <div class="info-item">
                        <strong>RDP Fiscal:</strong>
                        <span>${usuario.rdpfis || 'No asignado'}</span>
                    </div>
                    <div class="info-item">
                        <strong>RDP Financiero:</strong>
                        <span>${usuario.rdpfin || 'No asignado'}</span>
                    </div>
                    <div class="info-item">
                        <strong>Sede:</strong>
                        <span>${usuario.sede ? usuario.sede.nombre : 'No asignada'}</span>
                    </div>
                    <div class="info-item">
                        <strong>Departamento:</strong>
                        <span>${usuario.departamento ? usuario.departamento.nombre : 'No asignado'}</span>
                    </div>
                </div>
                
                ${usuario.descripcion ? `
                <div class="descripcion-container">
                    <strong>Módulos y Descripción:</strong>
                    <span>${usuario.descripcion}</span>
                </div>
                ` : ''}
            </div>

            <div class="resumen-equipos">
                <h4>Resumen de Equipos Asignados</h4>
                <div class="estadisticas-grid">
                    <div class="estadistica-item">
                        <div class="estadistica-valor">${data.estadisticas.totales}</div>
                        <div class="estadistica-label">Total Equipos</div>
                    </div>
                    <div class="estadistica-item">
                        <div class="estadistica-valor">${data.estadisticas.activos}</div>
                        <div class="estadistica-label">Equipos Activos</div>
                    </div>
                    <div class="estadistica-item">
                        <div class="estadistica-valor">${data.estadisticas.devueltos}</div>
                        <div class="estadistica-label">Equipos Devueltos</div>
                    </div>
                </div>
            </div>

            <div class="firmas-container">
                <br>
                <table class="tabla-firmas">
                    <tr>
                        <td>
                            <div class="firma">
                                <div class="espacio-firma"></div>
                                <div class="nombre-firma">${usuario.nombre} ${usuario.apellido}</div>
                                <div class="cargo-firma">Usuario</div>
                            </div>
                        </td>
                        <td>
                            <div class="firma">
                                <div class="espacio-firma"></div>
                                <div class="cargo-firma">Departamento de Tecnología</div>
                                <div class="cargo-firma">FRITZ C.A</div>
                            </div>
                        </td>
                    </tr>
                </table>
            </div>

            <div class="footer">
                <p>FRITZ C.A - Sistema de Gestión de Usuarios</p>
                <div class="numero-documento">Doc: USR-${data.numeroDocumento}</div>
            </div>
        </div>
    </div>
</body>
</html>`;

        console.log('Generando PDF con PDFKitGenerator...');
        
        // Generar PDF usando PDFKitGenerator
        const pdfBuffer = await PDFKitGenerator.generatePDF(htmlContent, {
            format: 'Letter',
            landscape: true
        });

        console.log('=== VER REPORTE INDIVIDUAL GENERADO EXITOSAMENTE ===');
        console.log(`Número de documento: USR-${numeroDocumento}`);

        // Configurar headers de respuesta
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="reporte-usuario-${usuario.nombre}-${usuario.apellido}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('X-Content-Type-Options', 'nosniff');

        res.end(pdfBuffer);

    } catch (error) {
        console.error('ERROR viendo reporte individual:', error);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Error al cargar el reporte: ' + error.message
            });
        }
    }
}
};