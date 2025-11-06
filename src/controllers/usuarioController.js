import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const usuarioController = {
  async index(req, res) {
    try {
        const usuarios = await prisma.usuario.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                activo: true,
                created_at: true,
                updated_at: true
            }
        });

        // Mapear los campos de fecha a camelCase
        const usuariosConCamposMapeados = usuarios.map(usuario => ({
            id: usuario.id,
            name: usuario.name,
            email: usuario.email,
            activo: usuario.activo,
            // Mapear los campos con guión bajo a camelCase para el frontend
            createdAt: usuario.created_at,  // Cambiado de created_at a createdAt
            updatedAt: usuario.updated_at   // Cambiado de updated_at a updatedAt
        }));

        res.json(usuariosConCamposMapeados);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
  },

  async store(req, res) {
    try {
      const { name, email, password, activo = true } = req.body;

      const usuarioExistente = await prisma.usuario.findFirst({
        where: {
          OR: [
            { name },
            { email }
          ]
        }
      });

      if (usuarioExistente) {
        return res.status(400).json({ error: 'El nombre de usuario o email ya existe' });
      }

      const usuario = await prisma.usuario.create({
        data: {
          name: name.trim(),
          email: email.trim(),
          password: password.trim(),
          activo: activo === 'true' || activo === true
        }
      });

      // Mapear los campos de fecha
      const usuarioConCamposMapeados = {
        id: usuario.id,
        name: usuario.name,
        email: usuario.email,
        activo: usuario.activo,
        createdAt: usuario.created_at,  // Mapear a camelCase
        updatedAt: usuario.updated_at   // Mapear a camelCase
      };

      res.status(201).json({
        message: 'Usuario creado exitosamente.',
        usuario: usuarioConCamposMapeados
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
        const { id } = req.params;
        const { name, email, password, activo } = req.body;

        const usuarioExistente = await prisma.usuario.findFirst({
            where: {
                OR: [
                    { name },
                    { email }
                ],
                NOT: { id: parseInt(id) }
            }
        });

        if (usuarioExistente) {
            return res.status(400).json({ error: 'El nombre de usuario o email ya existe' });
        }

        const data = {
            name: name?.trim(),
            email: email?.trim(),
            activo: activo === 'true' || activo === true
        };

        if (password && password.trim() !== '') {
            data.password = password.trim();
        }

        const usuario = await prisma.usuario.update({
            where: { id: parseInt(id) },
            data
        });

        // Mapear los campos de fecha
        const usuarioConCamposMapeados = {
            id: usuario.id,
            name: usuario.name,
            email: usuario.email,
            activo: usuario.activo,
            createdAt: usuario.created_at,  // Mapear a camelCase
            updatedAt: usuario.updated_at   // Mapear a camelCase
        };

        res.json({
            message: 'Usuario actualizado exitosamente.',
            usuario: usuarioConCamposMapeados
        });
    } catch (error) {
        console.error('Error en update:', error);
        res.status(500).json({ error: error.message });
    }
  },

  async destroy(req, res) {
    try {
        const { id } = req.params;

        await prisma.usuario.delete({
            where: { id: parseInt(id) }
        });

        res.json({ message: 'Usuario eliminado exitosamente.' });
    } catch (error) {
        console.error('Error en destroy:', error);
        res.status(500).json({ error: error.message });
    }
  },

  async toggleStatus(req, res) {
    try {
        const { id } = req.params;

        const usuario = await prisma.usuario.findUnique({
            where: { id: parseInt(id) }
        });

        if (!usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const updated = await prisma.usuario.update({
            where: { id: parseInt(id) },
            data: { activo: !usuario.activo }
        });

        // Mapear los campos de fecha
        const usuarioConCamposMapeados = {
            id: updated.id,
            name: updated.name,
            email: updated.email,
            activo: updated.activo,
            createdAt: updated.created_at,  // Mapear a camelCase
            updatedAt: updated.updated_at   // Mapear a camelCase
        };

        const status = updated.activo ? 'activado' : 'desactivado';
        res.json({ 
            message: `Usuario ${status} exitosamente.`,
            usuario: usuarioConCamposMapeados
        });
    } catch (error) {
        console.error('Error en toggleStatus:', error);
        res.status(500).json({ error: error.message });
    }
  },

  async destroy(req, res) {
    try {
      const { id } = req.params;

      if (req.user.id === parseInt(id)) {
        return res.status(400).json({ error: 'No puedes eliminar tu propio usuario.' });
      }

      await prisma.usuario.delete({
        where: { id: parseInt(id) }
      });

      res.json({ message: 'Usuario eliminado exitosamente.' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async toggleStatus(req, res) {
    try {
      const { id } = req.params;

      if (req.user.id === parseInt(id)) {
        return res.status(400).json({ error: 'No puedes desactivar tu propio usuario.' });
      }

      const usuario = await prisma.usuario.findUnique({
        where: { id: parseInt(id) }
      });

      if (!usuario) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      const updated = await prisma.usuario.update({
        where: { id: parseInt(id) },
        data: { activo: !usuario.activo }
      });

      // Mapear los campos de fecha
      const usuarioConCamposMapeados = {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        activo: updated.activo,
        createdAt: updated.created_at,  
        updatedAt: updated.updated_at   
      };

      const status = updated.activo ? 'activado' : 'desactivado';
      res.json({ 
        message: `Usuario ${status} exitosamente.`,
        usuario: usuarioConCamposMapeados
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};