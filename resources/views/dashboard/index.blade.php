<!DOCTYPE html>
<html lang="es" data-bs-theme="auto">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fritz C.A | Dashboard</title>
    
     <!-- Bootstrap 5 CSS -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    
    <!-- Bootstrap Icons -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css">
    
    <!-- SweetAlert2 -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css">
    <style>
        :root {
            --fritz-red: #DC2626;
            --fritz-red-light: #EF4444;
            --fritz-black: #1A1A1A;
            --fritz-white: #FFFFFF;
            --fritz-gray: #F5F5F5;
        }
        
        .body {
            background-color: var(--fritz-gray);
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            overflow-x: hidden;
        }
        
        .sidebar {
            width: 280px;
            min-height: 100vh;
            background: linear-gradient(rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.9));
            background-size: cover;
            background-position: center;
            box-shadow: 2px 0 10px rgba(0, 0, 0, 0.1);
            transition: all 0.3s;
            position: fixed;
            z-index: 1000;
            display: flex;
            flex-direction: column; 
        }
        
        .sidebar-collapsed {
            width: 85px;
        }
        
        .sidebar-collapsed .sidebar-text {
            display: none;
        }
        
        .main-content {
            margin-left: 280px;
            transition: all 0.3s;
        }
        
        .main-content-expanded {
            margin-left: 80px;
        }
        
        .sidebar-section {
            color: var(--fritz-red);
            font-size: 0.75rem;
            text-transform: uppercase;
            margin-top: 15px;
            margin-bottom: 5px;
            padding-left: 10px;
        }

        .sidebar-link {
            border-radius: 5px;
            margin-bottom: 5px;
            transition: all 0.3s;
            color: white;
            text-decoration: none;
            display: block;
            padding: 10px 15px;
        }
        
        .sidebar-link:hover, .sidebar-link.active {
            background-color: rgba(220, 38, 38, 0.2);
            transform: translateX(5px);
            color: white;
        }
        
        .navbar {
            background-color: var(--fritz-black)!important;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        .navbar-brand {
             box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            background-color: var(--fritz-black) !important;
        }
        
        .navbar-brand span {
            color: var(--fritz-red);
        }
        
        .btn-logout {
            background-color: var(--fritz-red);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            text-decoration: none;
            font-size: 14px;
            transition: background-color 0.3s;
        }
        
        .btn-logout:hover {
            background-color: var(--fritz-red-light);
        }
        
        .card {
            border: none;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            transition: transform 0.3s ease;
            margin-bottom: 1.5rem;
        }
        
        .card:hover {
            transform: translateY(-5px);
        }
        
        .card-header {
            background-color: var(--fritz-black);
            color: white;
            border-radius: 10px 10px 0 0 !important;
            font-weight: 600;
        }

        .card-header2{
             background-color: var(--fritz-gray);
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            overflow-x: hidden;
        }
        
        .stat-card {
            background: linear-gradient(135deg, var(--fritz-red) 0%, var(--fritz-red-light) 100%);
            color: white;
            border-radius: 10px;
            padding: 1.5rem;
        }
        
        .stat-number {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
        }
        
        .stat-title {
            font-size: 0.9rem;
            opacity: 0.9;
        }
        
        .welcome-card {
          
            border-left: 4px solid var(--fritz-red);
            border-right: 4px solid var(--fritz-red);
        }
        
        .btn-fritz {
            background-color: var(--fritz-red);
            border: none;
            color: white;
            padding: 10px 20px;
            font-weight: 600;
            border-radius: 6px;
            transition: all 0.3s;
        }
        
        .btn-fritz:hover {
            background-color: var(--fritz-red-light);
            transform: translateY(-2px);
        }
        
        .table-responsive {
            border-radius: 10px;
        }
        
        .chart-container {
            position: relative;
            height: 300px;
            width: 100%;
        }
        
        .user-avatar {
            width: 35px;
            height: 30px;
            border-radius: 50%;
            background-color: var(--fritz-red);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
        }
        
        .avatar-circle {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            font-size: 1.5rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        
        .bg-gradient-danger {
            background: linear-gradient(135deg, #DC2626 0%, #EF4444 100%);
        }
        
        .sidebar-user-profile {
            padding: 0.75rem;
            border-radius: 0.5rem;
            transition: all 0.3s;
          
            margin-bottom: 1rem;
        }
        
        .sidebar-user-profile:hover {
            background-color: rgba(220, 38, 38, 0.2);
        }
        
        .text-white-50 {
            color: rgba(255, 255, 255, 0.8);
        }

        @media (max-width: 992px) {
            .sidebar {
                width: 80px;
            }
            .sidebar-text {
                display: none;
            }
            .main-content {
                margin-left: 80px;
            }


.sidebar-content {
    flex: 1;
    overflow-y: auto;
    padding-bottom: 80px; 
}

.sidebar-bottom {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(0, 0, 0, 0.9);
    padding: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
}

        }
    </style>
</head>
<body>
    <div class="d-flex">
<!-- Sidebar -->
<div class="sidebar text-white p-3">
    <!-- Toggle Button -->
    <button id="sidebarToggle" class="btn btn-sm btn-outline-light position-absolute end-0 top-0 m-3">
        <i class="bi bi-chevron-double-left"></i>
    </button>
    
    <!-- Contenido del sidebar con scroll -->
    <div class="sidebar-content">
        <!-- Brand -->
        <div class="text-center mb-4 py-3 border-bottom border-secondary">
            <center><img src="{{asset('img/logo-fritz-web.webp')}}" alt="logoo"  style="width: 70px; height: 55px;"></center>
            <h4 class="mb-0 text-white fw-bold sidebar-text">FRITZ C.A</h4>
            <small class="text-white sidebar-text">Sistema de Gestión</small>
        </div>
        
        <!-- User Profile -->
        <div class="sidebar-user-profile d-flex align-items-center">
            <div class="user-avatar me-3">
                @auth
                    <div class="avatar-circle bg-gradient-danger text-white">
                        @php
                            $name = auth()->user()->name ?? 'Usuario';
                            $initials = collect(explode(' ', $name))
                                ->filter()
                                ->map(fn($word) => strtoupper(mb_substr($word, 0, 1)))
                                ->take(2)
                                ->implode('');
                        @endphp
                        {{ $initials ?: 'US' }}
                    </div>
                @else
                    <div class="avatar-circle bg-danger text-white">GU</div>
                @endauth
            </div>

            <div class="user-info text-white sidebar-text">
                @auth
                    <div class="fw-bold text-truncate" style="max-width: 150px;">
                        {{ auth()->user()->name ?? 'Usuario' }}
                    </div>
                    <small class="text-white-50 d-block">
                        {{ auth()->user()->activo ? 'Activo' : 'Inactivo' }}
                    </small>
                @else
                    <div class="fw-bold">Invitado</div>
                    <small class="text-white-50">No autenticado</small>
                @endauth
            </div>
        </div>
        
        <!-- Menu -->
        <ul class="nav flex-column mt-3">
            <!-- Dashboard -->
            <li class="nav-item">
                <a class="nav-link text-white sidebar-link active" href="{{ route('dashboard') }}">
                    <i class="bi bi-speedometer2 me-2"></i> 
                    <span class="sidebar-text">Dashboard</span>
                </a>
            </li>
            
            <!-- Sección de Gestión -->
            <li class="sidebar-section">
                <i class="bi bi-gear me-1"></i> 
                <span class="sidebar-text">Gestión</span>
            </li>
            
            <li class="nav-item">
                <a class="nav-link text-white sidebar-link" href="{{ route('usuario.index') }}">
                    <i class="bi bi-person-vcard me-2"></i>
                    <span class="sidebar-text">TIC</span>
                </a>
            </li>
            
            <li class="nav-item">
                <a class="nav-link text-white sidebar-link" href="{{ route('stock_equipos.index') }}">
                    <i class="bi bi-box-seam me-2"></i>
                    <span class="sidebar-text">Inventario</span>
                </a>
            </li>

            <li class="nav-item">
                    <a class="nav-link text-white sidebar-link" href="{{ route('usuarios.index') }}">
                        <i class="bi bi-people-fill me-2"></i>
                        <span class="sidebar-text">Usuarios</span>
                    </a>
                </li>
            
            <li class="nav-item">
                <a class="nav-link text-white sidebar-link" href="{{ route('sedes.index') }}">
                    <i class="bi bi-building me-2"></i>
                    <span class="sidebar-text">Sedes</span>
                </a>
            </li>
            
            <li class="nav-item">
                <a class="nav-link text-white sidebar-link" href="{{ route('departamentos.index') }}">
                    <i class="bi bi-person-badge me-2"></i>
                    <span class="sidebar-text">Departamentos</span>
                </a>
            </li>

            <li class="nav-item">
                <a class="nav-link text-white sidebar-link" href="{{ route('tipo_equipo.index') }}">
                    <i class="bi bi-boxes me-2"></i>
                    <span class="sidebar-text">Categorías</span>
                </a>
            </li>

                        <li class="nav-item">
                <a class="nav-link text-white sidebar-link" href="{{ route('equipos_asignados.index') }}">
                    <i class="bi bi-laptop me-2"></i>
                    <span class="sidebar-text">Equipos Asignados</span>
                </a>
            </li>

           
        </ul>
            <!-- Bottom -->
<div class="mt-auto p-3">
                <div class="d-flex justify-content-between align-items-center">
                    <button class="btn btn-sm btn-outline-light theme-switcher" title="Cambiar tema">
                        <i class="bi bi-moon-stars"></i>
                    </button>
                    <form method="POST" action="{{ route('logout') }}" class="d-inline">
                        @csrf
                        <button type="submit" class="btn btn-sm btn-outline-danger">
                            <i class="bi bi-box-arrow-right"></i>
                            <span class="sidebar-text">Salir</span>
                        </button>
                    </form>
                </div>
            </div>
</div>

    </div>


        <!-- Main Content -->
        <div class="main-content flex-grow-1">
            <!-- Top Navbar -->
            <nav class="navbar navbar-expand-lg navbar-dark">
                <div class="container-fluid">
                    <button class="btn btn-sm btn-outline-light me-2 d-lg-none" id="mobileSidebarToggle">
                        <i class="bi bi-list"></i>
                    </button>
                    
                    <div class="d-flex align-items-center">
                        <span class="navbar-brand me-3 d-none d-lg-block">
                            <i class="bi bi-tools me-2 text-white"></i> FRITZ C.A
                        </span>
                        
                        <!-- Breadcrumb -->
                        <nav aria-label="breadcrumb">
                            <ol class="breadcrumb mb-0">
                                <li class="breadcrumb-item"><a href="{{ route('dashboard') }}" class="text-white">Dashboard</a></li>
                                
                                <li class="breadcrumb-item active text-white" aria-current="page">Inicio</li>
                            </ol>
                        </nav>
                    </div>
                    
                    
                </div>
            </nav>
            
            <!-- Main Content Area -->
            <div class="container-fluid py-4">
                @auth
                    <!-- Welcome Card -->
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <div class="col-12">
                            <div class="card welcome-card">
                                <div class="card-body">
                                    <div class="row align-items-center">
                                        <div class="col-md-8">
                                            <h1 class="card-title mb-3">¡Bienvenido de vuelta, {{ Auth::user()->name }}!</h1>
                                            <p class="card-text text-muted mb-4">
                                                Has iniciado sesión correctamente en el sistema de gestión Fritz C.A. 
                                                Aquí tienes un resumen de las operaciones recientes.
                                            </p>
                                            <div class="d-flex gap-2">
                                                <span class="badge bg-dark">{{ Auth::user()->email }}</span>
                                                <span class="badge bg-success">Usuario Activo</span>
                                                <span class="badge bg-info">Último acceso: Hoy</span>
                                            </div>
                                        </div>
                                        <div class="col-md-4 text-center">
                                            <div class="bg-light rounded-circle p-4 d-inline-block">
                                                <i class="bi bi-graph-up-arrow text-danger" style="font-size: 3rem;"></i>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
<!-- Statistics Cards -->
<div class="row mb-4">
    <div class="col-xl-3 col-md-6">
        <div class="stat-card"style="background: linear-gradient(135deg, #c53541ff 0%, #c2050eff 100%);">
            <div class="stat-number" id="totalUsuarios">{{ $totalUsuarios ?? 0 }}</div>
            <i class="bi bi-people-fill fs-3 float-end" style="font-size: 2rem; opacity: 0.9;"></i>
            <div class="stat-title">Total Usuarios</div>
        </div>
    </div>
    <div class="col-xl-3 col-md-6">
        <div class="stat-card" style="background: linear-gradient(135deg, #3498db 0%, #0576c2ff 100%);">
            <div class="stat-number" id="totalSedes">{{ $totalSedes ?? 0 }}</div>
            <i class="bi bi-building fs-3 float-end" style="font-size: 1rem; opacity: 0.9; "></i>
            <div class="stat-title">Sedes Registradas</div>
                    
        </div>
    </div>
    <div class="col-xl-3 col-md-6">
        <div class="stat-card" style="background: linear-gradient(135deg, #27ae60 0%, #09642fff 100%); ">
            <div class="stat-number" id="totalDepartamentos">{{ $totalDepartamentos ?? 0 }}</div>
            <i class="bi bi-person-badge float-end fs-3 " style="font-size: 1rem; opacity: 0.9;"></i>
            <div class="stat-title">Departamentos Registrados</div>
        </div>
    </div>
    <div class="col-xl-3 col-md-6">
        <div class="stat-card" style="background: linear-gradient(135deg, #f39c12 0%, #e97714ff 100%);">
            <div class="stat-number" id="totalEquiposAsignados">{{ $totalEquiposAsignados ?? 0 }}</div>
            <i class="bi bi-laptop me-2 fs-3 float-end" style="font-size: 1rem; opacity: 0.9;"></i>
            <div class="stat-title">Equipos Asignados</div>
        </div>
    </div>
</div>



                    <!-- Quick Actions -->
                    <div class="row mt-4">
                        <div class="col-12">
                            <div class="card">
                                <div class="card-header">
                                    <i class="bi bi-lightning-fill me-2"></i>Acciones Rápidas
                                </div>
                                <center></center><div class="card-body">
                                     <div class="row g-3">
                                        <div class="col-md-3">
                                            <a href="#" class="btn btn-outline-dark w-100 card-body"  style="box-shadow: 2px 0 10px rgba(0, 0, 0, 5);" onclick="verPDF()">
                                                <i class="bi bi-people me-2"></i>Reporte de Usuarios
                                            </a>
                                        </div>
                                        <div class="col-md-3">
                                            <a href="#" class="btn btn-outline-dark w-100 card-body" style="box-shadow: 2px 0 10px rgba(0, 0, 0, 5);" onclick="verPDFStock()" >
                                                <i class="bi bi-box me-2"></i>Reporte de Inventario
                                            </a>
                                        </div>
                                        <div class="col-md-3">
                                            <a href="#" class="btn btn-outline-dark w-100 card-body" style="box-shadow: 2px 0 10px rgba(0, 0, 0, 5);"onclick="verPDFAsignaciones()">
                                                <i class="bi bi-laptop me-2"></i>Reporte de Equipos Asignados
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                @else
                    <!-- Not Authenticated Section -->
                    <div class="row justify-content-center">
                        <div class="col-md-6">
                            <div class="card">
                                <div class="card-body text-center py-5">
                                    <i class="bi bi-exclamation-triangle text-warning" style="font-size: 4rem;"></i>
                                    <h2 class="mt-3">No has iniciado sesión</h2>
                                    <p class="text-muted mb-4">Por favor inicia sesión para acceder al sistema.</p>
                                    <a href="{{ route('login') }}" class="btn btn-fritz btn-lg">
                                        <i class="bi bi-box-arrow-in-right me-2"></i>Ir al Login
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                @endauth
            </div>
        </div>
    </div>
  <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    
    <script>
        // Toggle del sidebar
document.getElementById('sidebarToggle').addEventListener('click', function() {
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    
    sidebar.classList.toggle('sidebar-collapsed');
    mainContent.classList.toggle('main-content-expanded');
    
    const icon = this.querySelector('i');
    icon.classList.toggle('bi-chevron-double-left');
    icon.classList.toggle('bi-chevron-double-right');
});

// Mobile sidebar toggle
document.getElementById('mobileSidebarToggle').addEventListener('click', function() {
    document.querySelector('.sidebar').classList.toggle('sidebar-collapsed');
});



     // Cambiar tema
            $('.theme-switcher').click(function() {
                $('html').attr('data-bs-theme', 
                    $('html').attr('data-bs-theme') === 'dark' ? 'light' : 'dark');
                $(this).find('i').toggleClass('bi-moon-stars bi-sun');
            });


          
function verPDF() {
    const url = '{{ route("usuarios.ver-pdf") }}';
    window.open(url, '_blank');
}

function verPDFStock() {
    const url = '{{ route("stock_equipos.ver-pdf") }}';
    window.open(url, '_blank');
}

   function verPDFAsignaciones() {
    const url = '{{ route("equipos_asignados.ver-pdf") }}';
    window.open(url, '_blank');
}

    </script>


</body>
</html>