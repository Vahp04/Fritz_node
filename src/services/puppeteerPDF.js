import puppeteer from 'puppeteer-core';
import fs from 'fs';
import os from 'os';
import path from 'path';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    let userDataDir = null;
    
    try {
      console.log('=== INICIANDO GENERACIÓN PDF ===');

      // Buscar Chrome instalado
      const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
        process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe'
      ];

      let executablePath = null;
      for (const chromePath of chromePaths) {
        if (fs.existsSync(chromePath)) {
          executablePath = chromePath;
          console.log('Chrome encontrado:', executablePath);
          break;
        }
      }

      if (!executablePath) {
        throw new Error('No se encontró Chrome instalado en el sistema');
      }

      // Crear directorio único con timestamp y random
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      userDataDir = path.join(os.tmpdir(), `puppeteer_${timestamp}_${random}`);
      fs.mkdirSync(userDataDir, { recursive: true });
      
      console.log('UserDataDir único creado:', userDataDir);

      const browserOptions = {
        headless: 'new',
        executablePath: executablePath,
        userDataDir: userDataDir,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--single-process',
          '--disable-web-security',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ],
        timeout: 30000, // Timeout más corto para lanzamiento
        protocolTimeout: 60000 // Timeout para protocolo
      };

      console.log('Lanzando browser con userDataDir único...');
      browser = await puppeteer.launch(browserOptions);
      console.log('Browser iniciado correctamente');

      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });
      page.setDefaultTimeout(60000);

      console.log('Configurando contenido HTML...');
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0',
        timeout: 60000
      });

      // Esperar a que las fuentes carguen
      await page.evaluateHandle('document.fonts.ready');
      await new Promise(resolve => setTimeout(resolve, 500));

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      });

      console.log('PDF generado exitosamente');
      return pdfBuffer;

    } catch (error) {
      console.error('Error en generatePDF:', error.message);
      throw error;
    } finally {
      // Cerrar browser de manera segura
      if (browser) {
        try {
          await browser.close();
          console.log('Browser cerrado correctamente');
          
          // Esperar un poco antes de limpiar
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (closeError) {
          console.warn('Error cerrando browser:', closeError.message);
        }
      }
      
      // Limpiar directorio de manera segura
      if (userDataDir && fs.existsSync(userDataDir)) {
        await cleanDirectorySafely(userDataDir);
      }
    }
  }
}

// Función para limpiar directorio de manera segura con reintentos
async function cleanDirectorySafely(dirPath, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log('UserDataDir limpiado correctamente');
      break;
    } catch (cleanupError) {
      console.warn(`Intento ${attempt} de limpiar UserDataDir falló:`, cleanupError.message);
      
      if (attempt < maxRetries) {
        // Esperar antes de reintentar
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      } else {
        console.warn('No se pudo limpiar UserDataDir después de', maxRetries, 'intentos');
      }
    }
  }
}

export default PuppeteerPDF;