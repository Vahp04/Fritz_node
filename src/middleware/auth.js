// middleware/auth.js - Versión mejorada
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const authenticateToken = async (req, res, next) => {
    let token = null;

    // Verificar header Authorization
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
        console.log('🔐 Token from Authorization header:', token ? `${token.substring(0, 20)}...` : 'NULL');
    }
    
    // Verificar cookies
    if (!token && req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }
    
    // Verificar query parameter (solo para desarrollo)
    if (!token && req.query.token) {
        token = req.query.token;
    }

    console.log('🔐 Final token to verify:', token);
    console.log('🌐 Request URL:', req.url);
    console.log('📧 Request Headers:', req.headers);

    if (!token) {
        console.log('❌ No token found');
        if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
            return res.status(401).json({ error: 'Token de acceso requerido' });
        } else {
            return res.redirect('/login?error=Debes iniciar sesión');
        }
    }

    try {
        console.log('🔑 Verifying token with secret...');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('✅ Token decoded:', decoded);

        
        // Buscar usuario en la base de datos para información actualizada
        const user = await prisma.usuario.findUnique({
            where: { id: decoded.id },
            select: {
                id: true,
                name: true,
                email: true,
                activo: true,
                created_at: true
            }
        });

        if (!user) {
            console.log('❌ User not found in database');
            throw new Error('Usuario no encontrado');
        }

        if (!user.activo) {
            console.log('❌ User is inactive');
            throw new Error('Usuario desactivado');
        }

        req.user = user;
        req.token = token;
        console.log('✅ Authentication successful for user:', user.name);
        next();
        
    } catch (error) {
        console.error('❌ Error en autenticación:', error.message);
        console.error('🔍 Token that failed:', token);
        
        if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
            return res.status(403).json({ error: 'Token inválido o usuario no disponible' });
        } else {
            return res.redirect('/login?error=Sesión expirada, ingresa nuevamente');
        }
    }
};