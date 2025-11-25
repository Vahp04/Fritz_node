import puppeteer from 'puppeteer';
import os from 'os';
import path from 'path';
import fs from 'fs';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    let userDataDir = null;
    
    try {
      console.log('=== INICIANDO GENERACIÓN PDF ===');

      // CONFIGURACIÓN CRÍTICA: Directorio de cache personalizado
      const puppeteerCacheDir = path.join(process.cwd(), 'puppeteer_cache');
      if (!fs.existsSync(puppeteerCacheDir)) {
        fs.mkdirSync(puppeteerCacheDir, { recursive: true });
      }

      // Configurar variables de entorno ANTES de usar puppeteer
      process.env.PUPPETEER_CACHE_DIR = puppeteerCacheDir;
      process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'false';
      process.env.PUPPETEER_DOWNLOAD_PATH = puppeteerCacheDir;

      console.log('Cache directory configurado:', puppeteerCacheDir);

      // Verificar instalación de Chrome/Chromium
      const possiblePaths = [
        // Ruta de puppeteer cache personalizado
        path.join(puppeteerCacheDir, 'chrome', 'win64-142.0.7444.175', 'chrome-win64', 'chrome.exe'),
        path.join(puppeteerCacheDir, 'chromium', 'win64-142.0.7444.175', 'chrome-win64', 'chrome.exe'),
        
        // Rutas del sistema
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        
        // Chromium instalado por puppeteer
        puppeteer.executablePath()
      ];

      let executablePath = null;
      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          executablePath = possiblePath;
          console.log('Navegador encontrado en:', executablePath);
          break;
        }
      }

      // Si no se encuentra ningún navegador, usar puppeteer sin path específico
      if (!executablePath) {
        console.log('No se encontró navegador, usando puppeteer sin executablePath');
        // Puppeteer intentará encontrar o descargar automáticamente
      } else {
        console.log('Usando executablePath:', executablePath);
      }

      // Directorio de usuario temporal
      userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'puppeteer_'));
      console.log('UserDataDir:', userDataDir);

      const browserOptions = {
        headless: 'new',
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
          '--disable-web-security'
        ],
        timeout: 120000
      };

      // Solo agregar executablePath si existe
      if (executablePath) {
        browserOptions.executablePath = executablePath;
      }

      console.log('Opciones del browser:', {
        headless: browserOptions.headless,
        hasExecutablePath: !!browserOptions.executablePath,
        userDataDir: browserOptions.userDataDir
      });

      console.log('Lanzando browser...');
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

      await page.evaluateHandle('document.fonts.ready');
      await new Promise(resolve => setTimeout(resolve, 1000));

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
      if (browser) {
        await browser.close().catch(console.error);
      }
      if (userDataDir && fs.existsSync(userDataDir)) {
        try {
          fs.rmSync(userDataDir, { recursive: true, force: true });
        } catch (cleanupError) {
          console.warn('Error limpiando userDataDir:', cleanupError.message);
        }
      }
    }
  }
}

export default PuppeteerPDF;