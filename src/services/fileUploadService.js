import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class FileUploadService {
  static validateImage(file) {
    if (!file.mimetype.startsWith('image/')) {
      throw new Error('El archivo debe ser una imagen');
    }
    
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new Error('Formato de imagen no permitido. Use JPEG, PNG, GIF o WebP');
    }
    
    return true;
  }

  static async uploadFile(file, folder = 'uploads') {
    try {
      const uploadDir = path.join(process.cwd(), 'uploads', folder);
      await fs.mkdir(uploadDir, { recursive: true });

      const timestamp = Date.now();
      const fileExtension = path.extname(file.originalname);
      const fileName = `${timestamp}-${Math.random().toString(36).substring(2)}${fileExtension}`;
      const filePath = path.join(uploadDir, fileName);

      // Guardar archivo
      await fs.writeFile(filePath, file.buffer);

      return path.join(folder, fileName).replace(/\\/g, '/');
    } catch (error) {
      console.error('Error subiendo archivo:', error);
      throw new Error('Error al subir el archivo');
    }
  }

  static async deleteFile(filePath) {
    try {
      if (!filePath) return;
      
      const fullPath = path.join(process.cwd(), 'uploads', filePath);
      await fs.unlink(fullPath);
      console.log('Archivo eliminado:', filePath);
    } catch (error) {
      console.error('Error eliminando archivo:', error);
    }
  }
}

export default FileUploadService;