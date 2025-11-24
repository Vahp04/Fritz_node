-- CreateEnum
CREATE TYPE "cargo" AS ENUM ('Gerente', 'Jefe', 'Analista', 'Especialista', 'Becario', 'Pasante', 'Coordinador', 'Supervisor', 'Auxiliar');

-- CreateEnum
CREATE TYPE "EstadoMikrotik" AS ENUM ('activo', 'inactivo', 'mantenimiento', 'desuso');

-- CreateEnum
CREATE TYPE "EstadoImpresora" AS ENUM ('activa', 'inactiva', 'mantenimiento', 'sin_toner', 'obsoleta');

-- CreateEnum
CREATE TYPE "EstadoServidor" AS ENUM ('activo', 'inactivo', 'mantenimiento', 'desuso');

-- CreateEnum
CREATE TYPE "EstadoDvr" AS ENUM ('activo', 'inactivo', 'mantenimiento', 'desuso');

-- CreateTable
CREATE TABLE "departamentos" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(191) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sedes" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(191) NOT NULL,
    "ubicacion" VARCHAR(191),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sedes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipo_equipo" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(191) NOT NULL,
    "descripcion" VARCHAR(191),
    "requiere_ip" BOOLEAN DEFAULT true,
    "requiere_cereal" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tipo_equipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_equipos" (
    "id" SERIAL NOT NULL,
    "tipo_equipo_id" INTEGER NOT NULL,
    "marca" VARCHAR(191),
    "modelo" VARCHAR(191),
    "descripcion" VARCHAR(191),
    "cantidad_total" INTEGER NOT NULL,
    "cantidad_disponible" INTEGER NOT NULL,
    "cantidad_asignada" INTEGER NOT NULL,
    "minimo_stock" INTEGER,
    "fecha_adquisicion" TIMESTAMP(3),
    "valor_adquisicion" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_equipos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(191) NOT NULL,
    "email" VARCHAR(191) NOT NULL,
    "password" VARCHAR(191) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(191) NOT NULL,
    "apellido" VARCHAR(191),
    "cargo" "cargo" NOT NULL,
    "correo" VARCHAR(191),
    "rdpfis" VARCHAR(191),
    "rdpfin" VARCHAR(191),
    "descripcion" VARCHAR(191),
    "sede_id" INTEGER NOT NULL,
    "departamento_id" INTEGER NOT NULL,
    "comprobante" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipo_asignado" (
    "id" SERIAL NOT NULL,
    "usuarios_id" INTEGER NOT NULL,
    "stock_equipos_id" INTEGER NOT NULL,
    "fecha_asignacion" TIMESTAMP(3),
    "ip_equipo" TEXT,
    "cereal_equipo" TEXT,
    "fecha_devolucion" TIMESTAMP(3),
    "observaciones" VARCHAR(191),
    "usuario_id" INTEGER,
    "estado" VARCHAR(191) NOT NULL DEFAULT 'activo',
    "imagen_comprobante" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipo_asignado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impresora" (
    "id" SERIAL NOT NULL,
    "stock_equipos_id" INTEGER NOT NULL,
    "nombre" VARCHAR(191) NOT NULL,
    "descripcion" VARCHAR(191),
    "ip_impresora" TEXT,
    "cereal_impresora" TEXT,
    "sede_id" INTEGER NOT NULL,
    "departamento_id" INTEGER NOT NULL,
    "ubicacion" VARCHAR(191),
    "toner" VARCHAR(191),
    "toner_actual_id" INTEGER,
    "fecha_instalacion_toner" TIMESTAMP(3),
    "contador_instalacion_toner" INTEGER DEFAULT 0,
    "contador_impresiones" INTEGER NOT NULL DEFAULT 0,
    "estado_impresora" "EstadoImpresora" NOT NULL DEFAULT 'activa',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "impresora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mikrotik" (
    "id" SERIAL NOT NULL,
    "stock_equipos_id" INTEGER NOT NULL,
    "descripcion" VARCHAR(191),
    "ip_mikrotik" TEXT,
    "cereal_mikrotik" TEXT,
    "sede_id" INTEGER NOT NULL,
    "ubicacion" VARCHAR(191) NOT NULL,
    "estado" "EstadoMikrotik" NOT NULL DEFAULT 'activo',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mikrotik_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumibles" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "sede_id" INTEGER NOT NULL,
    "departamento_id" INTEGER NOT NULL,
    "fecha_enviado" TIMESTAMP(3) NOT NULL,
    "detalles" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumibles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumible_equipos" (
    "id" SERIAL NOT NULL,
    "consumible_id" INTEGER NOT NULL,
    "stock_equipos_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,

    CONSTRAINT "consumible_equipos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servidores" (
    "id" SERIAL NOT NULL,
    "stock_equipos_id" INTEGER NOT NULL,
    "descripcion" TEXT,
    "ip_servidores" TEXT,
    "cereal_servidores" TEXT,
    "sede_id" INTEGER NOT NULL,
    "ubicacion" VARCHAR(191) NOT NULL,
    "estado" "EstadoServidor" NOT NULL DEFAULT 'activo',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "servidores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dvr" (
    "id" SERIAL NOT NULL,
    "stock_equipos_id" INTEGER NOT NULL,
    "sede_id" INTEGER NOT NULL,
    "descripcion" VARCHAR(500),
    "cantidad_cam" INTEGER NOT NULL DEFAULT 1,
    "ip_dvr" TEXT,
    "cereal_dvr" TEXT,
    "mac_dvr" TEXT,
    "estado" "EstadoDvr" NOT NULL DEFAULT 'activo',
    "switch" VARCHAR(191),
    "ubicacion" VARCHAR(191),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dvr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telefonos" (
    "id" SERIAL NOT NULL,
    "usuarios_id" INTEGER NOT NULL,
    "stock_equipos_id" INTEGER NOT NULL,
    "num_telefono" TEXT NOT NULL,
    "linea_telefono" VARCHAR(191) NOT NULL,
    "ip_telefono" TEXT,
    "mac_telefono" TEXT,
    "mail_telefono" TEXT,
    "fecha_asignacion" TIMESTAMP(3),
    "imagen_telefono" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telefonos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contadorRegistros" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "ultimoNumero" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contadorRegistros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contador_documentos" (
    "tipo" TEXT NOT NULL,
    "valor" INTEGER NOT NULL DEFAULT 1,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contador_documentos_pkey" PRIMARY KEY ("tipo")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "equipo_asignado_ip_equipo_key" ON "equipo_asignado"("ip_equipo");

-- CreateIndex
CREATE UNIQUE INDEX "equipo_asignado_cereal_equipo_key" ON "equipo_asignado"("cereal_equipo");

-- CreateIndex
CREATE UNIQUE INDEX "impresora_ip_impresora_key" ON "impresora"("ip_impresora");

-- CreateIndex
CREATE UNIQUE INDEX "impresora_cereal_impresora_key" ON "impresora"("cereal_impresora");

-- CreateIndex
CREATE UNIQUE INDEX "mikrotik_ip_mikrotik_key" ON "mikrotik"("ip_mikrotik");

-- CreateIndex
CREATE UNIQUE INDEX "mikrotik_cereal_mikrotik_key" ON "mikrotik"("cereal_mikrotik");

-- CreateIndex
CREATE UNIQUE INDEX "consumible_equipos_consumible_id_stock_equipos_id_key" ON "consumible_equipos"("consumible_id", "stock_equipos_id");

-- CreateIndex
CREATE UNIQUE INDEX "servidores_ip_servidores_key" ON "servidores"("ip_servidores");

-- CreateIndex
CREATE UNIQUE INDEX "servidores_cereal_servidores_key" ON "servidores"("cereal_servidores");

-- CreateIndex
CREATE UNIQUE INDEX "dvr_ip_dvr_key" ON "dvr"("ip_dvr");

-- CreateIndex
CREATE UNIQUE INDEX "dvr_cereal_dvr_key" ON "dvr"("cereal_dvr");

-- CreateIndex
CREATE UNIQUE INDEX "dvr_mac_dvr_key" ON "dvr"("mac_dvr");

-- CreateIndex
CREATE UNIQUE INDEX "telefonos_num_telefono_key" ON "telefonos"("num_telefono");

-- CreateIndex
CREATE UNIQUE INDEX "telefonos_ip_telefono_key" ON "telefonos"("ip_telefono");

-- CreateIndex
CREATE UNIQUE INDEX "telefonos_mac_telefono_key" ON "telefonos"("mac_telefono");

-- CreateIndex
CREATE UNIQUE INDEX "telefonos_mail_telefono_key" ON "telefonos"("mail_telefono");

-- CreateIndex
CREATE UNIQUE INDEX "contadorRegistros_tipo_key" ON "contadorRegistros"("tipo");

-- AddForeignKey
ALTER TABLE "stock_equipos" ADD CONSTRAINT "stock_equipos_tipo_equipo_id_fkey" FOREIGN KEY ("tipo_equipo_id") REFERENCES "tipo_equipo"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_departamento_id_fkey" FOREIGN KEY ("departamento_id") REFERENCES "departamentos"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo_asignado" ADD CONSTRAINT "equipo_asignado_stock_equipos_id_fkey" FOREIGN KEY ("stock_equipos_id") REFERENCES "stock_equipos"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo_asignado" ADD CONSTRAINT "equipo_asignado_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo_asignado" ADD CONSTRAINT "equipo_asignado_usuarios_id_fkey" FOREIGN KEY ("usuarios_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impresora" ADD CONSTRAINT "impresora_stock_equipos_id_fkey" FOREIGN KEY ("stock_equipos_id") REFERENCES "stock_equipos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impresora" ADD CONSTRAINT "impresora_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impresora" ADD CONSTRAINT "impresora_departamento_id_fkey" FOREIGN KEY ("departamento_id") REFERENCES "departamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impresora" ADD CONSTRAINT "impresora_toner_actual_id_fkey" FOREIGN KEY ("toner_actual_id") REFERENCES "stock_equipos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mikrotik" ADD CONSTRAINT "mikrotik_stock_equipos_id_fkey" FOREIGN KEY ("stock_equipos_id") REFERENCES "stock_equipos"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mikrotik" ADD CONSTRAINT "mikrotik_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumibles" ADD CONSTRAINT "consumibles_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumibles" ADD CONSTRAINT "consumibles_departamento_id_fkey" FOREIGN KEY ("departamento_id") REFERENCES "departamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumible_equipos" ADD CONSTRAINT "consumible_equipos_consumible_id_fkey" FOREIGN KEY ("consumible_id") REFERENCES "consumibles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumible_equipos" ADD CONSTRAINT "consumible_equipos_stock_equipos_id_fkey" FOREIGN KEY ("stock_equipos_id") REFERENCES "stock_equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servidores" ADD CONSTRAINT "servidores_stock_equipos_id_fkey" FOREIGN KEY ("stock_equipos_id") REFERENCES "stock_equipos"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servidores" ADD CONSTRAINT "servidores_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dvr" ADD CONSTRAINT "dvr_stock_equipos_id_fkey" FOREIGN KEY ("stock_equipos_id") REFERENCES "stock_equipos"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dvr" ADD CONSTRAINT "dvr_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telefonos" ADD CONSTRAINT "telefonos_stock_equipos_id_fkey" FOREIGN KEY ("stock_equipos_id") REFERENCES "stock_equipos"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telefonos" ADD CONSTRAINT "telefonos_usuarios_id_fkey" FOREIGN KEY ("usuarios_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
