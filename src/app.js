import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from 'cookie-parser';
import 'dotenv/config';

// Importar rutas API
import authRoutes from './routes/auth.js';
import departamentoRoutes from './routes/departamentos.js';
import sedeRoutes from './routes/sedes.js';
import usuariosRoutes from './routes/usuarios.js';
import usuarioRoutes from './routes/usuario.js';
import tipoEquipoRoutes from './routes/tipoEquipo.js';
import stockEquiposRoutes from './routes/stockEquipos.js';
import equipoAsignadoRoutes from './routes/equipoAsignado.js';
import mikrotikRoutes from './routes/mikrotik.js';
import impresoraRoutes from './routes/impresora.js';
import consumibleRoutes from './routes/consumible.js'


// Importar routers para PDFs
import pdfRoutes from './routes/pdfRoutes.js';

// Importar rutas de vistas
import viewRoutes from './routes/views.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Configuración para ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/public', express.static(path.join(__dirname, '../public')));
app.use('/img', express.static(path.join(__dirname, '../public/img')));

// Configuración de EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Función helper para renderizar templates en controladores
export const renderTemplate = (app, view, data) => {
  return new Promise((resolve, reject) => {
    app.render(view, data, (err, html) => {
      if (err) reject(err);
      else resolve(html);
    });
  });
};



// Rutas API
app.use('/api/auth', authRoutes);
app.use('/api/departamentos', departamentoRoutes);
app.use('/api/sedes', sedeRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/usuario', usuarioRoutes);
app.use('/api/tipo_equipo', tipoEquipoRoutes);
app.use('/api/stock_equipos', stockEquiposRoutes);
app.use('/api/equipos_asignados', equipoAsignadoRoutes);
app.use('/api/', mikrotikRoutes);
app.use('/', impresoraRoutes);
app.use('/api/consumibles', consumibleRoutes);


// Rutas PDF
app.use('/api/pdf', pdfRoutes);

// Rutas de VISTAS (EJS)
app.use('/', viewRoutes);

// Ruta de prueba
app.get("/", (req, res) => {
  res.redirect('/login');
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    environment: process.env.NODE_ENV,
    database: "Prisma MySQL",
    views: "EJS activado",
    pdfEndpoints: {
      usuarios: [
        "/api/pdf/usuarios",       
        "/api/pdf/usuarios/ver"    
      ],
      stock: [
        "/api/pdf/stock",           
        "/api/pdf/stock/ver"        
      ],
      asignaciones: [
        "/api/pdf/asignaciones",   
        "/api/pdf/asignaciones/ver",
        "/api/pdf/asignaciones/usuario/:usuarioid",
        "/api/pdf/asignaciones/usuario/:usuarioid/ver"
      ],

      impresoras: [
        "/reportes/general-pd",
        '/reportes/sede-pdf/:sedeId?'
      ],

      comsumibles:[
        "/pdfs/orden-salida-consumible"
      ]
    }
  });
});

// Ruta para debug de rutas (similar a tu Laravel)
app.get('/debug-routes', (req, res) => {
  const routes = [];
  
  // Obtener todas las rutas registradas
  app._router.stack.forEach(middleware => {
    if (middleware.route) {
      routes.push({
        method: Object.keys(middleware.route.methods)[0].toUpperCase(),
        path: middleware.route.path,
        type: middleware.route.path.includes('/api/') ? 'API' : 'VIEW'
      });
    } else if (middleware.name === 'router') {
      middleware.handle.stack.forEach(handler => {
        if (handler.route) {
          const route = handler.route;
          routes.push({
            method: Object.keys(route.methods)[0].toUpperCase(),
            path: route.path,
            type: route.path.includes('/api/') ? 'API' : 'VIEW'
          });
        }
      });
    }
  });

  res.json(routes);
});

// Manejo de errores 404 para API
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: "Ruta API no encontrada",
    path: req.path,
    method: req.method,
    available_endpoints: [
      "/api/auth/login",
      "/api/auth/dashboard",
      "/api/departamentos",
      "/api/sedes", 
      "/api/usuarios",
      "/api/usuario",
      "/api/tipo_equipo",
      "/api/stock_equipos",
      "/api/equipos_asignados",
      
      
      "/api/pdf/usuarios",
      "/api/pdf/usuarios/ver",
      "/api/pdf/stock", 
      "/api/pdf/stock/ver",
      "/api/pdf/asignaciones",
      "/api/pdf/asignaciones/ver",
      "/api/pdf/asignaciones/usuario/:usuarioId",        
      "/api/pdf/asignaciones/usuario/:usuarioId/ver",    
    ]
  });
});

// Manejo de errores 404 para vistas
app.use((req, res) => {
  res.status(404).render('error', {
    title: "Página no encontrada",
    message: "La página que buscas no existe.",
    error: {
      status: 404,
      stack: null
    }
  });
});

// Manejo de errores global
app.use((error, req, res, next) => {
  console.error('Error global:', error);
  
  // Si es una petición API, responder con JSON
  if (req.path.includes('/api/')) {
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Contacte al administrador'
    });
  }
  
  // Si es una vista, renderizar página de error
  res.status(500).render('error', {
    title: "Error del servidor",
    message: "Ha ocurrido un error interno.",
    error: process.env.NODE_ENV === 'development' ? error : {}
  });
});
console.log('Rutas PDF registradas:');
pdfRoutes.stack.forEach(layer => {
  if (layer.route) {
    const methods = Object.keys(layer.route.methods).map(method => method.toUpperCase()).join(', ');
    console.log(`   ${methods} /api/pdf${layer.route.path}`);
  }
});



export default app;