import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { dashboardController } from '../controllers/dashboardController.js';

const router = express.Router();

// Ruta de login (pública)
router.get('/login', (req, res) => {
    // Si ya está autenticado, redirigir al dashboard
    if (req.cookies.token) {
        return res.redirect('/dashboard');
    }
    
    res.render('login/login', { 
        title: 'Fritz C.A | Login',
        error: req.query.error || null,
        success: req.query.success || null,
        oldName: req.query.oldName || ''
    });
});

// Ruta del dashboard (protegida)
router.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        const stats = await dashboardController.getDashboardStats();
        res.render('dashboard/index', {
            title: 'Fritz C.A | Dashboard',
            user: req.user,
            totalUsuarios: stats.totalUsuarios,
            totalSedes: stats.totalSedes,
            totalDepartamentos: stats.totalDepartamentos,
            totalEquiposAsignados: stats.totalEquiposAsignados
        });
    } catch (error) {
        console.error('Error loading dashboard:', error);
        res.redirect('/login?error=Error al cargar el dashboard');
    }
});

// Ruta raíz redirige al login
router.get('/', (req, res) => {
    res.redirect('/login');
});

// Middleware para verificar autenticación en rutas protegidas
const requireAuth = (req, res, next) => {
    if (!req.headers.authorization) {
        return res.redirect('/login?error=Debes iniciar sesión');
    }
    next();
};

// Todas las demás rutas requieren autenticación
router.get('/usuario', authenticateToken, (req, res) => {
    res.render('usuario/usuario', {
        title: 'Gestión de Usuarios - TIC',
        user: req.user,
        success: req.query.success || null,
        error: req.query.error || null
    });
});

router.get('/equipoA', authenticateToken, (req, res) => {
    res.render('equipoA/equipoA', {
        title: 'Gestión de Equipos Asignados',
        user: req.user,
        success: req.query.success || null,
        error: req.query.error || null
    });
});

router.get('/stock', authenticateToken, (req, res) => {
    res.render('Stock/stock', {
        title: 'Inventario de Stock',
        user: req.user
    });
});

router.get('/usuarios', authenticateToken, (req, res) => {
    res.render('usuarios/usuarios', {
        title: 'Gestión de Usuarios',
        user: req.user,
        success: req.query.success || null,
        error: req.query.error || null
    });
});

router.get('/departamentos', authenticateToken, (req, res) => {
    res.render('departamento/departamento', {
        title: 'Gestión de Departamentos',
        user: req.user
    });
});

router.get('/sedes', authenticateToken, (req, res) => {
    res.render('sede/sede', {
        title: 'Gestión de Sedes',
        user: req.user
    });
});

router.get('/tipo_equipo', authenticateToken, (req, res) => {
    res.render('tipo_equipo/tipo_equipo', {
        title: 'Gestión de Tipo de Equipos',
        user: req.user,
        success: req.query.success || null,
        error: req.query.error || null
    });
});

router.get('/mikrotik', authenticateToken, (req, res) => {
    res.render('mikrotik/mikrotik', {
        title: 'Gestión de los Mikrotiks',
        user: req.user,
        success: req.query.success || null,
        error: req.query.error || null
    });
});

router.get('/impresoras', authenticateToken, (req, res) => {
    res.render('impresoras/impresoras', {
        title: 'Gestión de las Impresoras',
        user: req.user,
        success: req.query.success || null,
        error: req.query.error || null
    });
});

router.get('/consumibles', authenticateToken, (req, res) => {
    res.render('consumibles/consumibles', {
        title: 'Gestión de las Impresoras',
        user: req.user,
        success: req.query.success || null,
        error: req.query.error || null
    });
});


router.get('/equipos-a/pdf', authenticateToken, (req, res) => {
    res.render('equipoA/pdf', {
        title: 'Reporte de Equipos',
        user: req.user
    });
});

router.get('/stock/pdf', authenticateToken, (req, res) => {
    res.render('Stock/pdf', {
        title: 'Reporte de Stock',
        user: req.user
    });
});


router.get('/equipos-a/pdf', authenticateToken, (req, res) => {
    res.render('equipoA/pdf', {
        title: 'Reporte de Stock',
        user: req.user
    });
});

router.get('/pdfs/impresoras-general', authenticateToken, (req, res) => {
    res.render('pdfs/impresoras-general', {
        title: 'Reporte General de Impresoras',
        user: req.user
    });
});

router.get('/pdfs/impresoras-sede/:sedeId?', authenticateToken, (req, res) => {
    res.render('pdfs/impresoras-sede', {
        title: 'Reporte de Impresoras por Sede',
        user: req.user,
        sedeId: req.params.sedeId || null
    });
});

// Ruta de logout
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/login?success=Sesión cerrada correctamente');
});

export default router;