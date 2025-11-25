import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import PDFService from '../services/PDFService.js';
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

      const pdfBuffer = await PDFService.generatePDF(htmlContent, {
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

      const htmlContent = await renderTemplate(req.app, 'pdfs/usuarios', data);
      const pdfBuffer = await PDFService.generatePDF(htmlContent, {
        format: 'Letter',
        landscape: false
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

      const pdfBuffer = await PDFService.generatePDF(htmlContent, {
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

      const htmlContent = await renderTemplate(req.app, 'pdfs/reporte-usuarios-individual', data);
      const pdfBuffer = await PDFService.generatePDF(htmlContent, {
        format: 'Letter',
        landscape: true
      });

      console.log('=== VER REPORTE INDIVIDUAL GENERADO EXITOSAMENTE ===');

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
      res.status(500).json({
        error: 'Error al cargar el reporte: ' + error.message
      });
    }
  }
};