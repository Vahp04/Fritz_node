import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const dashboardController = {
    async getDashboardStats() {
        try {
            console.log('Iniciando obtención de estadísticas...');
            
            if (!prisma) {
                throw new Error('Prisma Client no está inicializado');
            }

            const [
                totalUsuarios,
                totalSedes,
                totalDepartamentos,
                totalEquiposAsignados
            ] = await Promise.all([
                prisma.usuarios.count().catch(error => {
                    console.error('Error contando usuarios:', error);
                    return 0;
                }),
                prisma.sedes.count().catch(error => {
                    console.error('Error contando sedes:', error);
                    return 0;
                }),
                prisma.departamentos.count().catch(error => {
                    console.error('Error contando departamentos:', error);
                    return 0;
                }),
                // CORRECCIÓN: Usando el nombre correcto del modelo
                prisma.equipo_asignado.count({
                    where: { estado: 'activo' }
                }).catch(error => {
                    console.error('Error contando equipos asignados:', error);
                    return 0;
                })
            ]);

            console.log('Estadísticas obtenidas:', {
                totalUsuarios,
                totalSedes,
                totalDepartamentos,
                totalEquiposAsignados
            });

            return {
                totalUsuarios: totalUsuarios || 0,
                totalSedes: totalSedes || 0,
                totalDepartamentos: totalDepartamentos || 0,
                totalEquiposAsignados: totalEquiposAsignados || 0
            };

        } catch (error) {
            console.error('Error crítico obteniendo estadísticas:', error);
            
            return {
                totalUsuarios: 0,
                totalSedes: 0,
                totalDepartamentos: 0,
                totalEquiposAsignados: 0,
                error: error.message
            };
        }
    }
};

export const getDashboardStats = dashboardController.getDashboardStats;