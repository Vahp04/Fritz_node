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
                (async () => {
                    try {
                        return await prisma.usuarios.count();
                    } catch (error) {
                        console.error('Error contando usuarios:', error);
                        return 0;
                    }
                })(),
                (async () => {
                    try {
                        return await prisma.sedes.count();
                    } catch (error) {
                        console.error('Error contando sedes:', error);
                        return 0;
                    }
                })(),
                (async () => {
                    try {
                        return await prisma.departamentos.count();
                    } catch (error) {
                        console.error('Error contando departamentos:', error);
                        return 0;
                    }
                })(),
                (async () => {
                    try {
                        return await prisma.equipo_asignado.count({
                            where: { estado: 'activo' }
                        });
                    } catch (error) {
                        console.error('Error contando equipos asignados:', error);
                        return 0;
                    }
                })()
            ]);

            const stats = {
                totalUsuarios: totalUsuarios || 0,
                totalSedes: totalSedes || 0,
                totalDepartamentos: totalDepartamentos || 0,
                totalEquiposAsignados: totalEquiposAsignados || 0
            };

            console.log('Estadísticas obtenidas exitosamente:', stats);
            return stats;

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