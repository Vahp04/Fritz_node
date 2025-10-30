import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

export const authController = {
  async login(req, res) {
    try {
      const { name, password } = req.body;

      console.log('🔐 Login attempt for user:', name);

      if (!name || !password) {
        return res.status(400).json({ 
          success: false,
          error: 'Nombre de usuario y contraseña son requeridos' 
        });
      }

      const usuario = await prisma.usuario.findFirst({
        where: { name: name.trim() }
      });

      if (!usuario) {
        console.log('❌ User not found:', name);
        return res.status(401).json({ 
          success: false,
          error: 'Las credenciales no coinciden con nuestros registros.' 
        });
      }

      if (password.trim() !== usuario.password) {
        console.log('❌ Invalid password for user:', name);
        return res.status(401).json({ 
          success: false,
          error: 'Las credenciales no coinciden con nuestros registros.' 
        });
      }

      if (!usuario.activo) {
        console.log('❌ User inactive:', name);
        return res.status(401).json({ 
          success: false,
          error: 'Tu cuenta está desactivada. Contacta al administrador.' 
        });
      }

      const token = jwt.sign(
        { 
          id: usuario.id, 
          name: usuario.name,
          email: usuario.email 
        },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      );

      console.log('✅ Login successful for user:', name);

      res.cookie('token', token, {
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production', 
        maxAge: 8 * 60 * 60 * 1000, 
        sameSite: 'strict'
      });

      return res.json({
        success: true,
        message: 'Login exitoso',
        user: {
          id: usuario.id,
          name: usuario.name,
          email: usuario.email
        }
      });

    } catch (error) {
      console.error('❌ Error en login:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Error interno del servidor. Intenta nuevamente.' 
      });
    }
  },

  async logout(req, res) {
    res.clearCookie('token');
    
    return res.json({ 
      success: true,
      message: 'Logout exitoso' 
    });
  },

  async dashboard(req, res) {
    try {
      const usuario = req.user;

      const [
        totalUsuarios,
        totalSedes,
        totalDepartamentos,
        totalEquiposAsignados
      ] = await Promise.all([
        prisma.usuario.count(),
        prisma.sede.count(),
        prisma.departamento.count(),
        prisma.equipoAsignado.count({
          where: { estado: 'activo' }
        })
      ]);

      console.log('📊 Dashboard accessed by user:', usuario.name);

      return res.render('dashboard', {
        title: 'Dashboard',
        user: usuario,
        stats: {
          totalUsuarios,
          totalSedes,
          totalDepartamentos,
          totalEquiposAsignados
        }
      });

    } catch (error) {
      console.error('Error en dashboard:', error);
      return res.status(500).render('error', {
        title: "Error",
        message: "Error interno del servidor"
      });
    }
  }
};