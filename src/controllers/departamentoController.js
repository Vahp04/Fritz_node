import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const departamentoController = {
  async index(req, res) {
    try {
      const { page = 1, limit = 10, all = false } = req.query;
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      if (all === 'true') {
        const departamentos = await prisma.departamentos.findMany({
          include: {
            usuarios: {
              select: { id: true }
            }
          },
          orderBy: { id: 'asc' }
        });

        const departamentosConCount = departamentos.map(depto => ({
          id: depto.id,
          nombre: depto.nombre,
          createdAt: depto.created_at,  
          updatedAt: depto.updated_at,  
          usuarios_count: depto.usuarios.length
        }));

        return res.json(departamentosConCount);
      }

      const [departamentos, totalCount] = await Promise.all([
        prisma.departamentos.findMany({
          include: {
            usuarios: {
              select: { id: true }
            }
          },
          orderBy: { id: 'asc' },
          skip: skip,
          take: limitNum
        }),
        prisma.departamentos.count()
      ]);

      const departamentosConCount = departamentos.map(depto => ({
        id: depto.id,
        nombre: depto.nombre,
        createdAt: depto.created_at,  
        updatedAt: depto.updated_at,  
        usuarios_count: depto.usuarios.length
      }));

      const totalPages = Math.ceil(totalCount / limitNum);

      res.json({
        departamentos: departamentosConCount,
        pagination: {
          currentPage: pageNum,
          totalPages: totalPages,
          totalItems: totalCount,
          itemsPerPage: limitNum,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1
        }
      });
    } catch (error) {
      console.error('Error en index:', error);
      res.status(500).json({ error: error.message });
    }
  },
  async store(req, res) {
    try {
      const { nombre } = req.body;


      if (!nombre || nombre.trim() === '') {
        return res.status(400).json({ error: 'El nombre del departamento es obligatorio' });
      }

      const existe = await prisma.departamentos.findFirst({
        where: { 
          nombre: {
            equals: nombre.trim(),
            mode: 'insensitive'
          }
        }
      });

      if (existe) {
        return res.status(400).json({ error: 'El nombre del departamento ya existe' });
      }

      const departamento = await prisma.departamentos.create({
        data: { 
          nombre: nombre.trim()
        },
        include: {
          usuarios: {
            select: { id: true }
          }
        }
      });

      const departamentoConCount = {
        id: departamento.id,
        nombre: departamento.nombre,
        createdAt: departamento.created_at,  
        updatedAt: departamento.updated_at, 
        usuarios_count: departamento.usuarios.length
      };

      res.status(201).json({
        message: 'Departamento creado exitosamente.',
        departamento: departamentoConCount
      });
    } catch (error) {
      console.error('Error en store:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async show(req, res) {
    try {
      const { id } = req.params;
      const departamento = await prisma.departamentos.findUnique({
        where: { id: parseInt(id) },
        include: { 
          usuarios: {
            include: {
              sede: {
                select: { nombre: true }
              }
            }
          }
        }
      });

      if (!departamento) {
        return res.status(404).json({ error: 'Departamento no encontrado' });
      }
      
      const departamentoConConteo = {
        id: departamento.id,
        nombre: departamento.nombre,
        createdAt: departamento.created_at, 
        updatedAt: departamento.updated_at, 
        usuarios_count: departamento.usuarios ? departamento.usuarios.length : 0,
        usuarios: departamento.usuarios
      };

      res.json(departamentoConConteo);
    } catch (error) {
      console.error('Error en show:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const { nombre } = req.body;

      const departamentoExistente = await prisma.departamentos.findUnique({
        where: { id: parseInt(id) }
      });

      if (!departamentoExistente) {
        return res.status(404).json({ error: 'Departamento no encontrado' });
      }

      if (!nombre || nombre.trim() === '') {
        return res.status(400).json({ error: 'El nombre del departamento es obligatorio' });
      }

      const existe = await prisma.departamentos.findFirst({
        where: { 
          nombre: {
            equals: nombre.trim(),
            mode: 'insensitive'
          },
          NOT: { id: parseInt(id) }
        }
      });

      if (existe) {
        return res.status(400).json({ error: 'El nombre del departamento ya existe' });
      }

      const departamento = await prisma.departamentos.update({
        where: { id: parseInt(id) },
        data: { 
          nombre: nombre.trim()
        },
        include: {
          usuarios: {
            select: { id: true }
          }
        }
      });

      const departamentoConCount = {
        id: departamento.id,
        nombre: departamento.nombre,
        createdAt: departamento.created_at,  
        updatedAt: departamento.updated_at,  
        usuarios_count: departamento.usuarios.length
      };

      res.json({
        message: 'Departamento actualizado exitosamente.',
        departamento: departamentoConCount
      });
    } catch (error) {
      console.error('Error en update:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async destroy(req, res) {
    try {
      const { id } = req.params;

      const departamentoExistente = await prisma.departamentos.findUnique({
        where: { id: parseInt(id) }
      });

      if (!departamentoExistente) {
        return res.status(404).json({ error: 'Departamento no encontrado' });
      }

      const usuarios = await prisma.usuarios.findMany({
        where: { departamento_id: parseInt(id) },
        select: { id: true, nombre: true, apellido: true }
      });

      if (usuarios.length > 0) {
        return res.status(400).json({ 
          error: 'No se puede eliminar el departamento porque tiene usuarios asociados.',
          usuarios: usuarios.map(u => `${u.nombre} ${u.apellido}`)
        });
      }

      await prisma.departamentos.delete({
        where: { id: parseInt(id) }
      });

      res.json({ 
        message: 'Departamento eliminado exitosamente.',
        departamento_eliminado: departamentoExistente.nombre
      });
    } catch (error) {
      console.error('Error en destroy:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async getUsuarios(req, res) {
    try {
      const { id } = req.params;
      
      const departamento = await prisma.departamentos.findUnique({
        where: { id: parseInt(id) },
        include: { 
          usuarios: {
            include: {
              sede: {
                select: { nombre: true }
              },
              equipo_asignado: {
                where: { estado: 'activo' },
                select: { id: true }
              }
            }
          }
        }
      });

      if (!departamento) {
        return res.status(404).json({ error: 'Departamento no encontrado' });
      }

      const usuariosConEquipos = departamento.usuarios.map(usuario => ({
        ...usuario,
        equipos_activos_count: usuario.equipo_asignado.length
      }));

      res.json({
        departamento: {
          id: departamento.id,
          nombre: departamento.nombre,
          createdAt: departamento.created_at, 
          updatedAt: departamento.updated_at,  
          usuarios_count: departamento.usuarios.length
        },
        usuarios: usuariosConEquipos
      });
    } catch (error) {
      console.error('Error en getUsuarios:', error);
      res.status(500).json({ error: error.message });
    }
  }
};

export default departamentoController;